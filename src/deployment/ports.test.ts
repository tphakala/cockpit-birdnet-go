import { afterEach, describe, expect, it, vi } from 'vitest';

const probe = vi.fn();
vi.mock('./exec', () => ({ probe: (...a: unknown[]) => probe(...a), exec: vi.fn() }));

import { checkPortAvailable, isPrivilegedPort, parseListeningPorts, validatePort } from './ports';

afterEach(() => probe.mockReset());

describe('validatePort', () => {
    it('accepts 1..65535 integers', () => {
        expect(validatePort(80)).toBe(true);
        expect(validatePort(65535)).toBe(true);
    });
    it('rejects out-of-range and non-integers', () => {
        expect(validatePort(0)).toBe(false);
        expect(validatePort(70000)).toBe(false);
        expect(validatePort(80.5)).toBe(false);
        expect(validatePort(NaN)).toBe(false);
    });
});

describe('isPrivilegedPort', () => {
    it('is true below 1024', () => {
        expect(isPrivilegedPort(80)).toBe(true);
        expect(isPrivilegedPort(443)).toBe(true);
        expect(isPrivilegedPort(1023)).toBe(true);
    });
    it('is false at and above 1024', () => {
        expect(isPrivilegedPort(1024)).toBe(false);
        expect(isPrivilegedPort(8080)).toBe(false);
    });
});

describe('parseListeningPorts', () => {
    it('extracts local ports from ss -H -ltn output (ipv4 and ipv6)', () => {
        const out = [
            'LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:*',
            'LISTEN 0 128 127.0.0.1:9090 0.0.0.0:*',
            'LISTEN 0 4096 [::]:22 [::]:*',
        ].join('\n');
        expect(parseListeningPorts(out)).toEqual(new Set([8080, 9090, 22]));
    });
    it('returns an empty set for empty input', () => {
        expect(parseListeningPorts('')).toEqual(new Set());
    });
    it('extracts the local port even when ss emits a leading Netid column', () => {
        expect(parseListeningPorts('tcp LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:*')).toEqual(new Set([8080]));
    });
});

describe('checkPortAvailable', () => {
    it('reports free when no listener is on the port', async () => {
        probe.mockResolvedValue({ ok: true, out: 'LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:*' });
        expect(await checkPortAvailable(443)).toEqual({ free: true });
    });
    it('reports not free when a listener exists', async () => {
        probe.mockResolvedValue({ ok: true, out: 'LISTEN 0 128 127.0.0.1:9090 0.0.0.0:*' });
        expect(await checkPortAvailable(9090)).toEqual({ free: false });
    });
    it('assumes free when ss cannot be run', async () => {
        probe.mockResolvedValue({ ok: false, out: '' });
        expect(await checkPortAvailable(80)).toEqual({ free: true });
    });
});
