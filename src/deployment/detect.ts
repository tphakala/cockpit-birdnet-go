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

import { CONTAINER_NAME, DOCKER_IMAGE, SERVICE_NAME, getHealthUrl } from '../config';
import { classifyDeployment } from './classify';
import { probe } from './exec';
import type { ContainerRuntime, DetectionSignals, Deployment } from './types';

export const parseContainerLine = (line: string): DetectionSignals['container'] | null => {
    const parts = line.split('|');
    const id = parts[0];
    const image = parts[1] || '';
    const status = parts[2] || '';
    const name = parts[3] || '';
    const labels = parts.slice(4).join('|');
    if (!id || image.startsWith('vsc-')) return null;
    const isBirdnet = image.startsWith(DOCKER_IMAGE) || image === CONTAINER_NAME || name === CONTAINER_NAME;
    if (!isBirdnet) return null;

    const isCompose = labels.includes('com.docker.compose.project=');
    const project = labels.match(/com\.docker\.compose\.project=([^,]+)/)?.[1];
    const service = labels.match(/com\.docker\.compose\.service=([^,]+)/)?.[1];
    const workingDir = labels.match(/com\.docker\.compose\.project\.working_dir=([^,]+)/)?.[1];

    // Adapt for exactOptionalPropertyTypes: build base object, conditionally assign optionals
    const c: DetectionSignals['container'] = {
        id,
        running: status.startsWith('Up'),
        isCompose,
        status,
    };
    if (project !== undefined) c.composeProject = project;
    if (service !== undefined) c.composeService = service;
    if (workingDir !== undefined) c.composeWorkingDir = workingDir;
    return c;
};

export const parseHostPort = (inspectJson: string, internalPort: number): number | undefined => {
    try {
        const arr = JSON.parse(inspectJson);
        const bindings = (Array.isArray(arr) ? arr[0] : arr)?.HostConfig?.PortBindings ?? {};
        const hostPort = bindings[`${internalPort}/tcp`]?.[0]?.HostPort;
        return hostPort ? parseInt(hostPort, 10) : undefined;
    } catch {
        return undefined;
    }
};

const detectDocker = async (): Promise<{ runtime: ContainerRuntime; docker: DetectionSignals['docker'] }> => {
    const dv = await probe(['docker', '--version']);
    if (dv.ok) {
        const active = await probe(['systemctl', 'is-active', 'docker']);
        return { runtime: 'docker', docker: { available: true, running: active.out === 'active', version: dv.out } };
    }
    const pv = await probe(['podman', '--version']);
    if (pv.ok) return { runtime: 'podman', docker: { available: true, running: true, version: pv.out } };
    return { runtime: null, docker: { available: false, running: false } };
};

export const detectDeployment = async (hostname: string): Promise<Deployment> => {
    const { runtime, docker } = await detectDocker();
    const bin = runtime ?? 'docker';

    // image present?
    const images = runtime ? (await probe([bin, 'images', '--format', '{{.Repository}}:{{.Tag}}'])).out : '';
    const imagePresent = images.includes(DOCKER_IMAGE);

    // health probe
    const health = await probe(['curl', '-s', '-m', '2', getHealthUrl(hostname)]);
    let healthRunning = false;
    if (health.ok && health.out) {
        try {
            const status = (JSON.parse(health.out) as { status?: string }).status;
            healthRunning = status === 'healthy' || status === 'degraded';
        } catch {
            healthRunning = false;
        }
    }

    // container
    let container: DetectionSignals['container'] | undefined;
    if (runtime) {
        const ps = await probe([bin, 'ps', '-a', '--format', '{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}|{{.Labels}}']);
        for (const line of ps.out.split('\n')) {
            const parsed = parseContainerLine(line);
            if (parsed) {
                container = parsed;
                break;
            }
        }
        if (container) {
            const inspect = await probe([bin, 'inspect', container.id]);
            // Adapt for exactOptionalPropertyTypes: capture to local, assign only if defined
            const hp = parseHostPort(inspect.out, 8080);
            if (hp !== undefined) container.hostPort = hp;
        }
    }

    // systemd
    const unitFiles = await probe(['systemctl', 'list-unit-files', '--no-pager', '--plain', SERVICE_NAME]);
    let systemd: DetectionSignals['systemd'] | undefined;
    if (unitFiles.ok && unitFiles.out.includes(SERVICE_NAME)) {
        const active = await probe(['systemctl', 'is-active', SERVICE_NAME]);
        const enabled = await probe(['systemctl', 'is-enabled', SERVICE_NAME]);
        const activeText = active.out || 'inactive';
        systemd = {
            exists: true,
            running: active.out === 'active',
            enabled: enabled.out === 'enabled',
            status: activeText,
        };
    }

    // Build signals object, only including properties that are not undefined
    const signals: DetectionSignals = { runtime, imagePresent, healthRunning };
    if (docker !== undefined) signals.docker = docker;
    if (container !== undefined) signals.container = container;
    if (systemd !== undefined) signals.systemd = systemd;

    return classifyDeployment(signals);
};
