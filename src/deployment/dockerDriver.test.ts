import { afterEach, describe, expect, it, vi } from 'vitest';

const exec = vi.fn().mockResolvedValue('');
vi.mock('./exec', () => ({ exec: (...a: unknown[]) => exec(...a), probe: vi.fn() }));

const recreate = vi.fn().mockResolvedValue(undefined);
vi.mock('./recreate', () => ({ recreateContainer: (...a: unknown[]) => recreate(...a) }));

import { DockerDriver } from './dockerDriver';
import type { Deployment } from './types';

const standalone: Deployment = {
    kind: 'docker-standalone',
    runtime: 'docker',
    running: true,
    imagePresent: true,
    containerId: 'abc',
    hostPort: 8080,
    internalPort: 8080,
    dockerAvailable: true,
    dockerRunning: true,
};
const podmanSystemd: Deployment = {
    ...standalone,
    kind: 'docker-systemd',
    runtime: 'podman',
    serviceName: 'birdnet-go.service',
};

afterEach(() => {
    exec.mockClear();
    recreate.mockClear();
});

describe('DockerDriver lifecycle', () => {
    it('restarts a standalone container via the container runtime', async () => {
        await new DockerDriver(standalone).restart();
        expect(exec).toHaveBeenCalledWith(['docker', 'restart', 'abc']);
    });

    it('uses podman binary when runtime is podman', async () => {
        await new DockerDriver({ ...standalone, runtime: 'podman' }).start();
        expect(exec).toHaveBeenCalledWith(['podman', 'start', 'abc']);
    });

    it('controls docker-systemd deployments through systemctl', async () => {
        await new DockerDriver(podmanSystemd).restart();
        expect(exec).toHaveBeenCalledWith(['systemctl', 'restart', 'birdnet-go.service'], { superuser: 'try' });
    });

    it('reports the current host port', async () => {
        await expect(new DockerDriver(standalone).getHostPort()).resolves.toBe(8080);
    });
});

describe('DockerDriver.setHostPort', () => {
    it('recreates a standalone container with the new host port', async () => {
        const r = await new DockerDriver(standalone).setHostPort(443);
        expect(recreate).toHaveBeenCalledWith('docker', 'abc', { hostPort: 443, internalPort: 8080 });
        expect(r).toEqual({ kind: 'applied' });
    });

    it('returns guided-manual instructions for a docker-systemd deployment', async () => {
        const r = await new DockerDriver(podmanSystemd).setHostPort(443);
        expect(r.kind).toBe('guided-manual');
        if (r.kind === 'guided-manual') expect(r.instructions).toContain('birdnet-go.service');
        expect(recreate).not.toHaveBeenCalled();
    });

    it('returns guided-manual instructions referencing the compose dir for compose', async () => {
        const compose: Deployment = { ...standalone, kind: 'docker-compose', composeWorkingDir: '/srv/bng' };
        const r = await new DockerDriver(compose).setHostPort(443);
        expect(r.kind).toBe('guided-manual');
        if (r.kind === 'guided-manual') expect(r.instructions).toContain('/srv/bng');
    });

    it('returns guided-manual instructions for a standalone deployment missing its container id', async () => {
        const orphan: Deployment = {
            kind: 'docker-standalone',
            runtime: 'docker',
            running: true,
            imagePresent: true,
            hostPort: 8080,
            internalPort: 8080,
            dockerAvailable: true,
            dockerRunning: true,
        };
        const r = await new DockerDriver(orphan).setHostPort(443);
        expect(r.kind).toBe('guided-manual');
        if (r.kind === 'guided-manual') expect(r.instructions).not.toContain('undefined');
        expect(recreate).not.toHaveBeenCalled();
    });
});
