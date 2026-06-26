import { describe, expect, it, vi } from 'vitest';

import { safeSetPort, type SafeSetPortDeps } from './safeApply';
import type { Deployment } from './types';
import type { DeploymentDriver, PortChangeResult } from './driver';

const standalone: Deployment = {
    kind: 'docker-standalone',
    runtime: 'docker',
    running: true,
    imagePresent: true,
    dockerAvailable: true,
    dockerRunning: true,
    containerId: 'abc',
    hostPort: 8080,
    internalPort: 8080,
};

const mkDriver = (over: Partial<DeploymentDriver> = {}): DeploymentDriver => ({
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    getHostPort: vi.fn(),
    getCapabilities: () => ({ canChangePort: true, portChangeMode: 'auto', privilegedPortStrategy: 'docker-root' }),
    setHostPort: vi.fn(async (): Promise<PortChangeResult> => ({ kind: 'applied' })),
    ...over,
});

const mkDeps = (over: Partial<SafeSetPortDeps> = {}): SafeSetPortDeps => ({
    checkPortAvailable: vi.fn(async () => ({ free: true })),
    ensurePrivilegedBind: vi.fn(() => ({ kind: 'ok' as const })),
    pollHealth: vi.fn(async () => true),
    redetect: vi.fn(async () => standalone),
    getDriver: vi.fn(() => mkDriver()),
    ...over,
});

describe('safeSetPort', () => {
    it('rejects an invalid port before doing anything', async () => {
        const r = await safeSetPort(mkDriver(), standalone, 70000, 'h', mkDeps());
        expect(r.kind).toBe('precheck-failed');
    });

    it('passes guided-manual deployments straight through', async () => {
        const driver = mkDriver({
            getCapabilities: () => ({
                canChangePort: true,
                portChangeMode: 'guided-manual',
                privilegedPortStrategy: 'setcap',
            }),
            setHostPort: vi.fn(async () => ({ kind: 'guided-manual' as const, instructions: 'do X' })),
        });
        const r = await safeSetPort(driver, standalone, 443, 'h', mkDeps());
        expect(r).toEqual({ kind: 'guided-manual', instructions: 'do X' });
    });

    it('fails precheck when the port is in use', async () => {
        const r = await safeSetPort(
            mkDriver(),
            standalone,
            443,
            'h',
            mkDeps({ checkPortAvailable: vi.fn(async () => ({ free: false })) })
        );
        expect(r.kind).toBe('precheck-failed');
    });

    it('fails precheck when a privileged bind needs manual host setup', async () => {
        const r = await safeSetPort(
            mkDriver(),
            standalone,
            80,
            'h',
            mkDeps({ ensurePrivilegedBind: vi.fn(() => ({ kind: 'manual' as const, instructions: 'sysctl ...' })) })
        );
        expect(r).toEqual({ kind: 'precheck-failed', reason: 'sysctl ...' });
    });

    it('applies and confirms health on the new port', async () => {
        const setHostPort = vi.fn(async () => ({ kind: 'applied' as const }));
        const r = await safeSetPort(mkDriver({ setHostPort }), standalone, 9000, 'h', mkDeps());
        expect(setHostPort).toHaveBeenCalledWith(9000);
        expect(r).toEqual({ kind: 'applied', hostPort: 9000 });
    });

    it('rolls back to the old port when health does not come up', async () => {
        const rollbackDriver = mkDriver({ setHostPort: vi.fn(async () => ({ kind: 'applied' as const })) });
        const deps = mkDeps({ pollHealth: vi.fn(async () => false), getDriver: vi.fn(() => rollbackDriver) });
        const r = await safeSetPort(mkDriver(), standalone, 9000, 'h', deps);
        expect(rollbackDriver.setHostPort).toHaveBeenCalledWith(8080); // back to snapshot
        expect(r.kind).toBe('rolled-back');
    });

    it('reports rolled-back when applying the change throws', async () => {
        const setHostPort = vi.fn(async () => {
            throw new Error('docker run failed');
        });
        const r = await safeSetPort(mkDriver({ setHostPort }), standalone, 9000, 'h', mkDeps());
        expect(r.kind).toBe('rolled-back');
    });

    it('allows re-applying the current port without an availability failure', async () => {
        const checkPortAvailable = vi.fn(async () => ({ free: false }));
        const r = await safeSetPort(mkDriver(), standalone, 8080, 'h', mkDeps({ checkPortAvailable }));
        expect(checkPortAvailable).not.toHaveBeenCalled(); // same as current port, skip the check
        expect(r.kind).toBe('applied');
    });

    it('fails precheck when the deployment cannot change its port', async () => {
        const driver = mkDriver({
            getCapabilities: () => ({
                canChangePort: false,
                portChangeMode: 'auto',
                privilegedPortStrategy: 'docker-root',
            }),
        });
        const r = await safeSetPort(driver, standalone, 9000, 'h', mkDeps());
        expect(r.kind).toBe('precheck-failed');
    });

    it('passes through an applied result from a guided-manual driver', async () => {
        const driver = mkDriver({
            getCapabilities: () => ({
                canChangePort: true,
                portChangeMode: 'guided-manual',
                privilegedPortStrategy: 'setcap',
            }),
            setHostPort: vi.fn(async () => ({ kind: 'applied' as const })),
        });
        const r = await safeSetPort(driver, standalone, 443, 'h', mkDeps());
        expect(r).toEqual({ kind: 'applied', hostPort: 443 });
    });

    it('returns rolled-back (not a thrown error) when the rollback itself fails', async () => {
        const failingRollbackDriver = mkDriver({
            setHostPort: vi.fn(async () => {
                throw new Error('rollback boom');
            }),
        });
        const deps = mkDeps({ pollHealth: vi.fn(async () => false), getDriver: vi.fn(() => failingRollbackDriver) });
        const r = await safeSetPort(mkDriver(), standalone, 9000, 'h', deps);
        expect(r.kind).toBe('rolled-back');
    });

    it('reports a guided-manual rollback when the restore cannot be applied automatically', async () => {
        const guidedRollbackDriver = mkDriver({
            setHostPort: vi.fn(async () => ({ kind: 'guided-manual' as const, instructions: 'edit the unit' })),
        });
        const deps = mkDeps({ pollHealth: vi.fn(async () => false), getDriver: vi.fn(() => guidedRollbackDriver) });
        const r = await safeSetPort(mkDriver(), standalone, 9000, 'h', deps);
        expect(r.kind).toBe('rolled-back');
        if (r.kind === 'rolled-back') expect(r.reason).toContain('manual steps');
    });
});
