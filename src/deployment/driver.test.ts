import { describe, expect, it } from 'vitest';

import { getDriver } from './driver';
import { DockerDriver } from './dockerDriver';
import { NativeDriver } from './nativeDriver';
import type { Deployment } from './types';

const dep = (kind: Deployment['kind']): Deployment => ({
    kind,
    runtime: 'docker',
    running: false,
    imagePresent: false,
    dockerAvailable: false,
    dockerRunning: false,
    hostPort: 8080,
    internalPort: 8080,
});

describe('getDriver', () => {
    it('returns DockerDriver for docker kinds', () => {
        expect(getDriver(dep('docker-standalone'))).toBeInstanceOf(DockerDriver);
        expect(getDriver(dep('docker-systemd'))).toBeInstanceOf(DockerDriver);
    });

    it('returns NativeDriver for native kinds', () => {
        expect(getDriver(dep('native-systemd'))).toBeInstanceOf(NativeDriver);
        expect(getDriver(dep('native'))).toBeInstanceOf(NativeDriver);
    });
});
