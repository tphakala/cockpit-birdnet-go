/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */
import { getHealthUrl } from '../config';
import { checkPortAvailable as realCheck, validatePort } from './ports';
import { detectDeployment } from './detect';
import { getDriver as realGetDriver } from './driver';
import { ensurePrivilegedBind as realEnsure } from './privileged';
import { exec } from './exec';
import type { Deployment } from './types';
import type { DeploymentDriver } from './driver';

export type ApplyResult =
    | { kind: 'applied'; hostPort: number }
    | { kind: 'rolled-back'; reason: string }
    | { kind: 'guided-manual'; instructions: string }
    | { kind: 'precheck-failed'; reason: string };

export interface SafeSetPortDeps {
    checkPortAvailable: (port: number) => Promise<{ free: boolean }>;
    ensurePrivilegedBind: (d: Deployment, port: number) => { kind: 'ok' } | { kind: 'manual'; instructions: string };
    pollHealth: (hostname: string, port: number) => Promise<boolean>;
    redetect: (hostname: string) => Promise<Deployment>;
    getDriver: (d: Deployment) => DeploymentDriver;
}

/** Poll the health endpoint on a port until healthy or attempts run out. */
export const pollHealth = async (hostname: string, port: number): Promise<boolean> => {
    for (let i = 0; i < 10; i++) {
        try {
            const out = await exec(['curl', '-s', '-m', '3', getHealthUrl(hostname, port)]);
            const status = (JSON.parse(out) as { status?: string }).status;
            if (status === 'healthy' || status === 'degraded') return true;
        } catch {
            // not up yet
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return false;
};

export const defaultSafeSetPortDeps: SafeSetPortDeps = {
    checkPortAvailable: realCheck,
    ensurePrivilegedBind: realEnsure,
    pollHealth,
    redetect: detectDeployment,
    getDriver: realGetDriver,
};

export const safeSetPort = async (
    driver: DeploymentDriver,
    deployment: Deployment,
    newPort: number,
    hostname: string,
    deps: SafeSetPortDeps
): Promise<ApplyResult> => {
    if (!validatePort(newPort)) return { kind: 'precheck-failed', reason: `${newPort} is not a valid port` };

    const caps = driver.getCapabilities();
    if (!caps.canChangePort) return { kind: 'precheck-failed', reason: 'this deployment cannot change its port' };

    if (caps.portChangeMode === 'guided-manual') {
        const r = await driver.setHostPort(newPort);
        return r.kind === 'guided-manual'
            ? { kind: 'guided-manual', instructions: r.instructions }
            : { kind: 'applied', hostPort: newPort };
    }

    // auto path
    const priv = deps.ensurePrivilegedBind(deployment, newPort);
    if (priv.kind === 'manual') return { kind: 'precheck-failed', reason: priv.instructions };

    if (newPort !== deployment.hostPort) {
        const avail = await deps.checkPortAvailable(newPort);
        if (!avail.free) return { kind: 'precheck-failed', reason: `port ${newPort} is already in use` };
    }

    const snapshot = deployment.hostPort;
    try {
        await driver.setHostPort(newPort);
    } catch (e) {
        // recreateContainer restores the original container on a failed run, so the
        // service is already back on its old port; just report the failure.
        return {
            kind: 'rolled-back',
            reason: `failed to apply port ${newPort}: ${(e as Error).message}; restored ${snapshot}`,
        };
    }

    if (await deps.pollHealth(hostname, newPort)) return { kind: 'applied', hostPort: newPort };

    // applied but unhealthy: re-detect to get a driver bound to the new container, restore the old port
    const after = await deps.redetect(hostname);
    await deps.getDriver(after).setHostPort(snapshot);
    return { kind: 'rolled-back', reason: `service did not become healthy on port ${newPort}; restored ${snapshot}` };
};
