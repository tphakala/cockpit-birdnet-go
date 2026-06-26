import { describe, expect, it } from 'vitest';

import { runtimeBin } from './runtime';

describe('runtimeBin', () => {
    it('maps docker to the docker binary', () => {
        expect(runtimeBin('docker')).toBe('docker');
    });
    it('maps podman to the podman binary', () => {
        expect(runtimeBin('podman')).toBe('podman');
    });
    it('falls back to docker when no runtime was detected (null)', () => {
        expect(runtimeBin(null)).toBe('docker');
    });
});
