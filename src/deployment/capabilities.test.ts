import { describe, expect, it } from 'vitest';

import { deriveCapabilities } from './capabilities';
import type { Deployment } from './types';

const dep = (over: Partial<Deployment>): Deployment => ({
    kind: 'docker-standalone',
    runtime: 'docker',
    running: true,
    imagePresent: true,
    hostPort: 8080,
    internalPort: 8080,
    dockerAvailable: true,
    dockerRunning: true,
    ...over,
});

describe('deriveCapabilities', () => {
    it('docker-standalone on docker: auto change, docker-root privileged', () => {
        expect(deriveCapabilities(dep({ kind: 'docker-standalone', runtime: 'docker' }))).toEqual({
            canChangePort: true,
            portChangeMode: 'auto',
            privilegedPortStrategy: 'docker-root',
        });
    });

    it('docker-standalone on podman: podman-sysctl privileged', () => {
        expect(deriveCapabilities(dep({ runtime: 'podman' })).privilegedPortStrategy).toBe('podman-sysctl');
    });

    it('docker-compose and docker-systemd: guided-manual', () => {
        expect(deriveCapabilities(dep({ kind: 'docker-compose' })).portChangeMode).toBe('guided-manual');
        expect(deriveCapabilities(dep({ kind: 'docker-systemd' })).portChangeMode).toBe('guided-manual');
    });

    it('native-systemd: guided-manual + setcap (native auto-edit deferred to a later milestone)', () => {
        expect(deriveCapabilities(dep({ kind: 'native-systemd', runtime: null }))).toEqual({
            canChangePort: true,
            portChangeMode: 'guided-manual',
            privilegedPortStrategy: 'setcap',
        });
    });

    it('native (bare): guided-manual, setcap', () => {
        expect(deriveCapabilities(dep({ kind: 'native', runtime: null }))).toMatchObject({
            portChangeMode: 'guided-manual',
            privilegedPortStrategy: 'setcap',
        });
    });

    it('none: cannot change port', () => {
        expect(deriveCapabilities(dep({ kind: 'none' })).canChangePort).toBe(false);
    });
});
