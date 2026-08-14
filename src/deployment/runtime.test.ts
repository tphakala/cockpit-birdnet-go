import { describe, expect, it } from 'vitest';

import { runtimeBin, runtimeComposeCommand, runtimeComposeLabel, runtimeLabel } from './runtime';

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

describe('runtimeLabel', () => {
    it('maps docker to Docker', () => {
        expect(runtimeLabel('docker')).toBe('Docker');
    });
    it('maps podman to Podman', () => {
        expect(runtimeLabel('podman')).toBe('Podman');
    });
    it('falls back to Docker when no runtime was detected (null)', () => {
        expect(runtimeLabel(null)).toBe('Docker');
    });
});

describe('runtimeComposeLabel', () => {
    it('maps docker to Docker Compose', () => {
        expect(runtimeComposeLabel('docker')).toBe('Docker Compose');
    });
    it('maps podman to Podman Compose', () => {
        expect(runtimeComposeLabel('podman')).toBe('Podman Compose');
    });
    it('falls back to Docker Compose when no runtime was detected (null)', () => {
        expect(runtimeComposeLabel(null)).toBe('Docker Compose');
    });
});

describe('runtimeComposeCommand', () => {
    it('maps docker to docker-compose', () => {
        expect(runtimeComposeCommand('docker')).toBe('docker-compose');
    });
    it('maps podman to podman compose', () => {
        expect(runtimeComposeCommand('podman')).toBe('podman compose');
    });
    it('falls back to docker-compose when no runtime was detected (null)', () => {
        expect(runtimeComposeCommand(null)).toBe('docker-compose');
    });
});
