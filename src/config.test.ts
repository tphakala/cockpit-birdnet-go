import { describe, expect, it } from 'vitest';

import {
    BIRDNET_METRICS_PORT,
    BIRDNET_PORT,
    CONTAINER_NAME,
    DEFAULT_BASE_DIR,
    DEFAULT_CONFIG_DIR,
    DEFAULT_DATA_DIR,
    DEFAULT_IMAGE_TAG,
    DEFAULT_LOG_DIR,
    detectLogDirFromInspect,
    detectVolumesFromInspect,
    DOCKER_IMAGE,
    getHealthUrl,
    getImageRef,
    getLogDir,
    getWebInterfaceUrl,
    GITHUB_PACKAGES_URL,
    GITHUB_REGISTRY_PAGE_URL,
    GITHUB_RELEASES_LATEST_URL,
    GITHUB_RELEASES_PAGE_URL,
    SERVICE_NAME,
} from './config';

// ── Constants ───────────────────────────────────────────────────────────────

describe('config constants', () => {
    it('exposes expected default port', () => {
        expect(BIRDNET_PORT).toBe(8080);
    });

    it('exposes expected metrics port', () => {
        expect(BIRDNET_METRICS_PORT).toBe(8090);
    });

    it('exposes the container name', () => {
        expect(CONTAINER_NAME).toBe('birdnet-go');
    });

    it('exposes the Docker image without tag', () => {
        expect(DOCKER_IMAGE).toBe('ghcr.io/tphakala/birdnet-go');
    });

    it('exposes the default image tag', () => {
        expect(DEFAULT_IMAGE_TAG).toBe('nightly');
    });

    it('exposes the systemd service name', () => {
        expect(SERVICE_NAME).toBe('birdnet-go.service');
    });

    it('derives log dir from base dir', () => {
        expect(DEFAULT_LOG_DIR).toBe(`${DEFAULT_BASE_DIR}/data/logs`);
    });

    it('derives config dir from base dir', () => {
        expect(DEFAULT_CONFIG_DIR).toBe(`${DEFAULT_BASE_DIR}/config`);
    });

    it('derives data dir from base dir', () => {
        expect(DEFAULT_DATA_DIR).toBe(`${DEFAULT_BASE_DIR}/data`);
    });

    it('has GitHub releases API URL pointing to correct repo', () => {
        expect(GITHUB_RELEASES_LATEST_URL).toContain('api.github.com');
        expect(GITHUB_RELEASES_LATEST_URL).toContain('tphakala');
        expect(GITHUB_RELEASES_LATEST_URL).toContain('birdnet-go');
    });

    it('has GitHub packages API URL pointing to correct org', () => {
        expect(GITHUB_PACKAGES_URL).toContain('api.github.com');
        expect(GITHUB_PACKAGES_URL).toContain('tphakala');
    });

    it('has human-readable releases page URL', () => {
        expect(GITHUB_RELEASES_PAGE_URL).toContain('github.com/tphakala/birdnet-go/releases');
    });

    it('has human-readable registry page URL', () => {
        expect(GITHUB_REGISTRY_PAGE_URL).toContain('github.com/tphakala/birdnet-go/pkgs/container');
    });
});

// ── Helper Functions ────────────────────────────────────────────────────────

describe('getImageRef', () => {
    it('returns default nightly tag when called without arguments', () => {
        expect(getImageRef()).toBe('ghcr.io/tphakala/birdnet-go:nightly');
    });

    it('uses the provided tag', () => {
        expect(getImageRef('v1.2.3')).toBe('ghcr.io/tphakala/birdnet-go:v1.2.3');
    });

    it('handles latest tag', () => {
        expect(getImageRef('latest')).toBe('ghcr.io/tphakala/birdnet-go:latest');
    });
});

describe('getHealthUrl', () => {
    it('builds URL with default port', () => {
        expect(getHealthUrl('myhost')).toBe('http://myhost:8080/api/v2/health');
    });

    it('builds URL with custom port', () => {
        expect(getHealthUrl('myhost', 9090)).toBe('http://myhost:9090/api/v2/health');
    });
});

describe('getWebInterfaceUrl', () => {
    it('builds URL with default port', () => {
        expect(getWebInterfaceUrl('myhost')).toBe('http://myhost:8080');
    });

    it('builds URL with custom port', () => {
        expect(getWebInterfaceUrl('myhost', 3000)).toBe('http://myhost:3000');
    });
});

describe('getLogDir', () => {
    it('returns the default log directory', () => {
        expect(getLogDir()).toBe(DEFAULT_LOG_DIR);
    });
});

// ── Detection from Docker Inspect ───────────────────────────────────────────

describe('detectLogDirFromInspect', () => {
    const makeInspect = (mounts: { Type: string; Source: string; Destination: string }[]) =>
        JSON.stringify([{ Mounts: mounts }]);

    it('returns log path when /data bind mount exists', () => {
        const json = makeInspect([{ Type: 'bind', Source: '/srv/birdnet/data', Destination: '/data' }]);
        expect(detectLogDirFromInspect(json)).toBe('/srv/birdnet/data/logs');
    });

    it('returns null when no /data mount found', () => {
        const json = makeInspect([{ Type: 'bind', Source: '/srv/config', Destination: '/config' }]);
        expect(detectLogDirFromInspect(json)).toBeNull();
    });

    it('ignores volume (non-bind) mounts', () => {
        const json = makeInspect([{ Type: 'volume', Source: 'myvolume', Destination: '/data' }]);
        expect(detectLogDirFromInspect(json)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
        expect(detectLogDirFromInspect('not json')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(detectLogDirFromInspect('')).toBeNull();
    });

    it('handles non-array inspect output', () => {
        const json = JSON.stringify({
            Mounts: [{ Type: 'bind', Source: '/opt/data', Destination: '/data' }],
        });
        expect(detectLogDirFromInspect(json)).toBe('/opt/data/logs');
    });
});

describe('detectVolumesFromInspect', () => {
    const makeInspect = (mounts: { Type: string; Source: string; Destination: string }[]) =>
        JSON.stringify([{ Mounts: mounts }]);

    it('detects both config and data dirs', () => {
        const json = makeInspect([
            { Type: 'bind', Source: '/srv/birdnet/config', Destination: '/config' },
            { Type: 'bind', Source: '/srv/birdnet/data', Destination: '/data' },
        ]);
        const result = detectVolumesFromInspect(json);
        expect(result.configDir).toBe('/srv/birdnet/config');
        expect(result.dataDir).toBe('/srv/birdnet/data');
    });

    it('returns nulls when no matching mounts', () => {
        const json = makeInspect([{ Type: 'bind', Source: '/tmp/other', Destination: '/other' }]);
        const result = detectVolumesFromInspect(json);
        expect(result.configDir).toBeNull();
        expect(result.dataDir).toBeNull();
    });

    it('returns nulls for invalid JSON', () => {
        const result = detectVolumesFromInspect('garbage');
        expect(result.configDir).toBeNull();
        expect(result.dataDir).toBeNull();
    });

    it('ignores non-bind mounts', () => {
        const json = makeInspect([
            { Type: 'volume', Source: 'vol1', Destination: '/config' },
            { Type: 'volume', Source: 'vol2', Destination: '/data' },
        ]);
        const result = detectVolumesFromInspect(json);
        expect(result.configDir).toBeNull();
        expect(result.dataDir).toBeNull();
    });

    it('handles partial matches (only data)', () => {
        const json = makeInspect([{ Type: 'bind', Source: '/mnt/data', Destination: '/data' }]);
        const result = detectVolumesFromInspect(json);
        expect(result.configDir).toBeNull();
        expect(result.dataDir).toBe('/mnt/data');
    });
});
