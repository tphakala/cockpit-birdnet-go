import { describe, expect, it } from 'vitest';

import { classifyDeployment } from './classify';
import type { DetectionSignals } from './types';

const base: DetectionSignals = {
    runtime: 'docker',
    imagePresent: true,
    healthRunning: false,
    docker: { available: true, running: true, version: 'Docker version 27' },
};

describe('classifyDeployment', () => {
    it('docker-systemd when a systemd unit and a container both exist', () => {
        const d = classifyDeployment({
            ...base,
            systemd: { exists: true, running: true, enabled: true },
            container: { id: 'abc', running: true, isCompose: false, hostPort: 8080 },
        });
        expect(d.kind).toBe('docker-systemd');
        expect(d.serviceName).toBe('birdnet-go.service');
        expect(d.containerId).toBe('abc');
        expect(d.running).toBe(true);
    });

    it('native-systemd when a systemd unit exists but no container', () => {
        const d = classifyDeployment({
            ...base,
            systemd: { exists: true, running: true, enabled: false },
            healthRunning: true,
        });
        expect(d.kind).toBe('native-systemd');
        expect(d.internalPort).toBe(d.hostPort);
    });

    it('docker-compose when a compose-labelled container exists and no systemd', () => {
        const d = classifyDeployment({
            ...base,
            container: {
                id: 'c1',
                running: true,
                isCompose: true,
                composeProject: 'p',
                composeWorkingDir: '/srv/bng',
                hostPort: 9000,
            },
        });
        expect(d.kind).toBe('docker-compose');
        expect(d.composeWorkingDir).toBe('/srv/bng');
        expect(d.hostPort).toBe(9000);
    });

    it('docker-standalone for a plain container', () => {
        const d = classifyDeployment({ ...base, container: { id: 'c2', running: true, isCompose: false } });
        expect(d.kind).toBe('docker-standalone');
        expect(d.hostPort).toBe(8080); // falls back to BIRDNET_PORT
        expect(d.internalPort).toBe(8080);
    });

    it('carries the shim fields the legacy UI needs', () => {
        const d = classifyDeployment({
            ...base,
            systemd: { exists: true, running: true, enabled: true },
            container: { id: 'c3', running: true, isCompose: false, status: 'Up 2 hours' },
        });
        expect(d.dockerAvailable).toBe(true);
        expect(d.dockerRunning).toBe(true);
        expect(d.dockerVersion).toBe('Docker version 27');
        expect(d.statusText).toBe('Up 2 hours');
        expect(d.systemdEnabled).toBe(true);
    });

    it('native-systemd carries systemdStatusText from the systemd signal status', () => {
        const d = classifyDeployment({
            ...base,
            systemd: { exists: true, running: true, enabled: false, status: 'active' },
        });
        expect(d.kind).toBe('native-systemd');
        expect(d.systemdStatusText).toBe('active');
    });

    it('native (health-only, no container) sets statusText to "Running (native binary)"', () => {
        const d = classifyDeployment({ runtime: null, imagePresent: false, healthRunning: true });
        expect(d.kind).toBe('native');
        expect(d.statusText).toBe('Running (native binary)');
    });

    it('native when only the health API answers', () => {
        const d = classifyDeployment({ runtime: null, imagePresent: false, healthRunning: true });
        expect(d.kind).toBe('native');
        expect(d.running).toBe(true);
    });

    it('none when nothing is detected', () => {
        const d = classifyDeployment({ runtime: 'docker', imagePresent: false, healthRunning: false });
        expect(d.kind).toBe('none');
        expect(d.running).toBe(false);
    });
});
