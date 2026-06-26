import { afterEach, describe, expect, it, vi } from 'vitest';

const exec = vi.fn();
vi.mock('./exec', () => ({ exec: (...a: unknown[]) => exec(...a) }));

import { buildRunArgs, recreateContainer, type DockerInspect } from './recreate';

afterEach(() => exec.mockReset());

const inspect: DockerInspect = {
    Name: '/birdnet-go',
    Config: { Image: 'ghcr.io/tphakala/birdnet-go:nightly', Env: ['PATH=/usr/bin', 'TZ=UTC'] },
    HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '8080' }], '8090/tcp': [{ HostPort: '8090' }] } },
    Mounts: [{ Type: 'bind', Source: '/opt/birdnet-go/config', Destination: '/config' }],
};

describe('buildRunArgs', () => {
    it('overrides only the internal-port mapping and preserves others, mounts, env, and image', () => {
        const args = buildRunArgs('docker', inspect, { hostPort: 443, internalPort: 8080 });
        expect(args).toEqual([
            'docker',
            'run',
            '-d',
            '--name',
            'birdnet-go',
            '--restart',
            'unless-stopped',
            '-p',
            '443:8080',
            '-p',
            '8090:8090',
            '-v',
            '/opt/birdnet-go/config:/config',
            '-e',
            'TZ=UTC',
            'ghcr.io/tphakala/birdnet-go:nightly',
        ]);
    });

    it('keeps the current image when no image override is given and uses podman bin', () => {
        const args = buildRunArgs('podman', inspect, { hostPort: 8081, internalPort: 8080 });
        expect(args[0]).toBe('podman');
        expect(args[args.length - 1]).toBe('ghcr.io/tphakala/birdnet-go:nightly');
        expect(args).toContain('8081:8080');
    });

    it('applies an image override (for version switching)', () => {
        const args = buildRunArgs('docker', inspect, {
            hostPort: 8080,
            internalPort: 8080,
            image: 'ghcr.io/tphakala/birdnet-go:v1.2.3',
        });
        expect(args[args.length - 1]).toBe('ghcr.io/tphakala/birdnet-go:v1.2.3');
    });

    it('skips PATH and HOME env vars', () => {
        const args = buildRunArgs(
            'docker',
            { ...inspect, Config: { Image: 'img', Env: ['PATH=/x', 'HOME=/root', 'KEEP=1'] } },
            { hostPort: 8080, internalPort: 8080 }
        );
        expect(args).toContain('KEEP=1');
        expect(args).not.toContain('PATH=/x');
        expect(args).not.toContain('HOME=/root');
    });

    it('preserves a bound host interface so 127.0.0.1 is not widened to 0.0.0.0', () => {
        const localhostBound: DockerInspect = {
            Name: '/birdnet-go',
            Config: { Image: 'img' },
            HostConfig: { PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080' }] } },
        };
        const args = buildRunArgs('docker', localhostBound, { hostPort: 443, internalPort: 8080 });
        expect(args).toContain('127.0.0.1:443:8080');
    });
});

describe('buildRunArgs reproduction', () => {
    it('reproduces --device for a sound card in simple form', () => {
        const i: DockerInspect = {
            Name: '/birdnet-go',
            Config: { Image: 'img' },
            HostConfig: {
                PortBindings: { '8080/tcp': [{ HostPort: '8080' }] },
                Devices: [{ PathOnHost: '/dev/snd', PathInContainer: '/dev/snd', CgroupPermissions: 'rwm' }],
            },
        };
        const args = buildRunArgs('docker', i, { hostPort: 80, internalPort: 8080 });
        expect(args[args.indexOf('--device') + 1]).toBe('/dev/snd');
    });

    it('uses the explicit --device form when paths or perms differ', () => {
        const i: DockerInspect = {
            Name: '/birdnet-go',
            Config: { Image: 'img' },
            HostConfig: {
                Devices: [{ PathOnHost: '/dev/snd', PathInContainer: '/dev/audio', CgroupPermissions: 'rw' }],
            },
        };
        const args = buildRunArgs('docker', i, {});
        expect(args[args.indexOf('--device') + 1]).toBe('/dev/snd:/dev/audio:rw');
    });

    it('reproduces --network host and omits -p under host networking', () => {
        const i: DockerInspect = {
            Name: '/birdnet-go',
            Config: { Image: 'img' },
            HostConfig: { NetworkMode: 'host', PortBindings: { '8080/tcp': [{ HostPort: '8080' }] } },
        };
        const args = buildRunArgs('docker', i, { hostPort: 80, internalPort: 8080 });
        expect(args[args.indexOf('--network') + 1]).toBe('host');
        expect(args).not.toContain('-p');
    });

    it('does not emit --network for default or bridge', () => {
        const i: DockerInspect = { Name: '/x', Config: { Image: 'img' }, HostConfig: { NetworkMode: 'bridge' } };
        expect(buildRunArgs('docker', i, {})).not.toContain('--network');
    });

    it('preserves the real restart policy including on-failure count', () => {
        const i: DockerInspect = {
            Name: '/x',
            Config: { Image: 'img' },
            HostConfig: { RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 5 } },
        };
        const args = buildRunArgs('docker', i, {});
        expect(args[args.indexOf('--restart') + 1]).toBe('on-failure:5');
    });

    it('defaults restart policy to unless-stopped when inspect carries none', () => {
        const i: DockerInspect = { Name: '/x', Config: { Image: 'img' }, HostConfig: {} };
        const args = buildRunArgs('docker', i, {});
        expect(args[args.indexOf('--restart') + 1]).toBe('unless-stopped');
    });

    it('omits --restart for an explicit "no" policy (docker default)', () => {
        const i: DockerInspect = {
            Name: '/x',
            Config: { Image: 'img' },
            HostConfig: { RestartPolicy: { Name: 'no' } },
        };
        expect(buildRunArgs('docker', i, {})).not.toContain('--restart');
    });

    it('adds :ro and propagation suffixes on bind mounts', () => {
        const i: DockerInspect = {
            Name: '/x',
            Config: { Image: 'img' },
            Mounts: [
                { Type: 'bind', Source: '/data', Destination: '/data', RW: false },
                { Type: 'bind', Source: '/ext', Destination: '/ext', Propagation: 'rshared' },
            ],
        };
        const args = buildRunArgs('docker', i, {});
        expect(args).toContain('/data:/data:ro');
        expect(args).toContain('/ext:/ext:rshared');
    });
});

describe('recreateContainer', () => {
    const inspectJson = JSON.stringify([
        {
            Name: '/birdnet-go',
            Config: { Image: 'img' },
            HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '8080' }] } },
        },
    ]);

    it('restores the original container when the new run fails', async () => {
        exec.mockImplementation((argv: string[]) => {
            if (argv[1] === 'inspect') return Promise.resolve(inspectJson);
            if (argv.includes('443:8080')) return Promise.reject(new Error('port restricted')); // new run fails
            return Promise.resolve(''); // stop, rm, restore run
        });
        await expect(recreateContainer('docker', 'abc', { hostPort: 443, internalPort: 8080 })).rejects.toThrow(
            'port restricted'
        );
        // the restore run with the original 8080 mapping was issued
        const restoreCall = exec.mock.calls.find(c => Array.isArray(c[0]) && (c[0] as string[]).includes('8080:8080'));
        expect(restoreCall).toBeTruthy();
    });

    it('surfaces the original error even if the restore run also fails', async () => {
        exec.mockImplementation((argv: string[]) => {
            if (argv[1] === 'inspect') return Promise.resolve(inspectJson);
            if (argv.includes('443:8080')) return Promise.reject(new Error('port restricted')); // new run fails
            if (argv.includes('8080:8080')) return Promise.reject(new Error('restore failed')); // restore also fails
            return Promise.resolve(''); // stop, rm
        });
        await expect(recreateContainer('docker', 'abc', { hostPort: 443, internalPort: 8080 })).rejects.toThrow(
            'port restricted'
        );
    });
});
