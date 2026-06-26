import { afterEach, describe, expect, it, vi } from 'vitest';

const exec = vi.fn().mockResolvedValue('');
vi.mock('./exec', () => ({ exec: (...a: unknown[]) => exec(...a), probe: vi.fn() }));

import { DockerDriver } from './dockerDriver';
import type { Deployment } from './types';

const standalone: Deployment = {
    kind: 'docker-standalone', runtime: 'docker', running: true, imagePresent: true,
    containerId: 'abc', hostPort: 8080, internalPort: 8080,
    dockerAvailable: true, dockerRunning: true,
};
const podmanSystemd: Deployment = { ...standalone, kind: 'docker-systemd', runtime: 'podman', serviceName: 'birdnet-go.service' };

afterEach(() => exec.mockClear());

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
