import { describe, expect, it } from 'vitest';

import { ensurePrivilegedBind } from './privileged';
import type { Deployment } from './types';

const dep = (over: Partial<Deployment>): Deployment => ({
    kind: 'docker-standalone',
    runtime: 'docker',
    running: true,
    imagePresent: true,
    dockerAvailable: true,
    dockerRunning: true,
    hostPort: 8080,
    internalPort: 8080,
    ...over,
});

describe('ensurePrivilegedBind', () => {
    it('is ok for a non-privileged port regardless of runtime', () => {
        expect(ensurePrivilegedBind(dep({ runtime: 'podman' }), 8080)).toEqual({ kind: 'ok' });
    });
    it('is ok for rootful docker on a privileged port', () => {
        expect(ensurePrivilegedBind(dep({ runtime: 'docker' }), 443)).toEqual({ kind: 'ok' });
    });
    it('asks for the sysctl on rootless podman privileged ports', () => {
        const a = ensurePrivilegedBind(dep({ runtime: 'podman' }), 443);
        expect(a.kind).toBe('manual');
        if (a.kind === 'manual') expect(a.instructions).toContain('ip_unprivileged_port_start');
    });
    it('asks for setcap on native privileged ports', () => {
        const a = ensurePrivilegedBind(dep({ kind: 'native-systemd', runtime: null }), 80);
        expect(a.kind).toBe('manual');
        if (a.kind === 'manual') expect(a.instructions).toContain('cap_net_bind_service');
    });
});
