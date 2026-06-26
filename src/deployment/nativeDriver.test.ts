import { afterEach, describe, expect, it, vi } from 'vitest';

const exec = vi.fn().mockResolvedValue('');
vi.mock('./exec', () => ({ exec: (...a: unknown[]) => exec(...a), probe: vi.fn() }));

import { NativeDriver } from './nativeDriver';
import type { Deployment } from './types';

const nativeSystemd: Deployment = {
    kind: 'native-systemd',
    runtime: null,
    running: true,
    imagePresent: false,
    dockerAvailable: false,
    dockerRunning: false,
    serviceName: 'birdnet-go.service',
    hostPort: 8080,
    internalPort: 8080,
};
const nativeBare: Deployment = {
    kind: 'native',
    runtime: null,
    running: true,
    imagePresent: false,
    dockerAvailable: false,
    dockerRunning: false,
    hostPort: 8080,
    internalPort: 8080,
};

afterEach(() => exec.mockClear());

describe('NativeDriver lifecycle', () => {
    it('restarts via systemctl when a unit exists', async () => {
        await new NativeDriver(nativeSystemd).restart();
        expect(exec).toHaveBeenCalledWith(['systemctl', 'restart', 'birdnet-go.service'], { superuser: 'try' });
    });

    it('does nothing on lifecycle calls for a bare native process', async () => {
        await new NativeDriver(nativeBare).restart();
        expect(exec).not.toHaveBeenCalled();
    });
});

describe('NativeDriver.setHostPort', () => {
    it('returns guided-manual instructions and does not exec', async () => {
        const r = await new NativeDriver(nativeSystemd).setHostPort(443);
        expect(r.kind).toBe('guided-manual');
        expect(exec).not.toHaveBeenCalled();
    });
});
