import { afterEach, describe, expect, it, vi } from 'vitest';

const exec = vi.fn();
vi.mock('./exec', () => ({ exec: (...a: unknown[]) => exec(...a) }));

import {
    buildManualInstructions,
    buildRunArgs,
    findUnreproducible,
    recreateContainer,
    type DockerInspect,
} from './recreate';

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

    it('returns unsupported and never stops or removes a container it cannot reproduce', async () => {
        const namedVolJson = JSON.stringify([
            {
                Name: '/birdnet-go',
                Config: { Image: 'img' },
                HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '8080' }] } },
                Mounts: [{ Type: 'volume', Source: 'bng-data', Destination: '/data' }],
            },
        ]);
        exec.mockImplementation((argv: string[]) => {
            if (argv[1] === 'inspect') return Promise.resolve(namedVolJson);
            return Promise.resolve('');
        });
        const result = await recreateContainer('docker', 'abc', { hostPort: 443, internalPort: 8080 });
        expect(result.kind).toBe('unsupported');
        // the container must be left untouched
        const touched = exec.mock.calls.some(
            c => Array.isArray(c[0]) && ((c[0] as string[])[1] === 'stop' || (c[0] as string[])[1] === 'rm')
        );
        expect(touched).toBe(false);
    });

    it('returns recreated and issues stop/rm/run for a reproducible container', async () => {
        exec.mockImplementation((argv: string[]) => {
            if (argv[1] === 'inspect') return Promise.resolve(inspectJson);
            return Promise.resolve('');
        });
        const result = await recreateContainer('docker', 'abc', { hostPort: 8081, internalPort: 8080 });
        expect(result).toEqual({ kind: 'recreated' });
        expect(exec.mock.calls.some(c => (c[0] as string[])[1] === 'stop')).toBe(true);
        expect(exec.mock.calls.some(c => (c[0] as string[])[1] === 'rm')).toBe(true);
    });
});

describe('findUnreproducible', () => {
    const clean: DockerInspect = {
        Name: '/birdnet-go',
        Config: { Image: 'img' },
        HostConfig: {
            PortBindings: { '8080/tcp': [{ HostPort: '8080' }] },
            Devices: [{ PathOnHost: '/dev/snd', PathInContainer: '/dev/snd', CgroupPermissions: 'rwm' }],
            NetworkMode: 'bridge',
            RestartPolicy: { Name: 'unless-stopped' },
        },
        Mounts: [{ Type: 'bind', Source: '/cfg', Destination: '/config' }],
        NetworkSettings: {
            Networks: {
                bridge: {
                    IPAMConfig: { IPv4Address: '172.17.0.3' },
                    Aliases: ['birdnet-go'],
                },
            },
        },
    };

    it('returns no reasons for a reproducible sound-card container', () => {
        expect(findUnreproducible(clean, { hostPort: 80, internalPort: 8080 })).toEqual([]);
    });

    it.each([
        ['named volume', { Mounts: [{ Type: 'volume', Source: 'vol', Destination: '/data' }] }],
        ['privileged', { HostConfig: { Privileged: true } }],
        ['cap-add', { HostConfig: { CapAdd: ['NET_ADMIN'] } }],
        ['cap-drop', { HostConfig: { CapDrop: ['ALL'] } }],
        ['tmpfs', { HostConfig: { Tmpfs: { '/run': '' } } }],
        ['sysctls', { HostConfig: { Sysctls: { 'net.core.somaxconn': '1024' } } }],
        ['ulimits', { HostConfig: { Ulimits: [{}] } }],
        ['group-add', { HostConfig: { GroupAdd: ['audio'] } }],
        ['extra-hosts', { HostConfig: { ExtraHosts: ['db:1.2.3.4'] } }],
        ['dns', { HostConfig: { Dns: ['1.1.1.1'] } }],
        ['security-opt', { HostConfig: { SecurityOpt: ['label=disable'] } }],
        ['device-cgroup-rules', { HostConfig: { DeviceCgroupRules: ['c 1:3 rwm'] } }],
        ['device-requests (gpu)', { HostConfig: { DeviceRequests: [{}] } }],
        ['custom runtime', { HostConfig: { Runtime: 'nvidia' } }],
        ['custom user', { Config: { Image: 'img', User: '1000:1000' } }],
        ['compose labels', { Config: { Image: 'img', Labels: { 'com.docker.compose.project': 'p' } } }],
    ])('flags %s', (_label, partial) => {
        const i: DockerInspect = { Name: '/x', Config: { Image: 'img' }, ...partial } as DockerInspect;
        expect(findUnreproducible(i, {}).length).toBeGreaterThan(0);
    });

    it('flags a static IP or aliases on a custom network', () => {
        const i: DockerInspect = {
            Name: '/x',
            Config: { Image: 'img' },
            HostConfig: { NetworkMode: 'mynet' },
            NetworkSettings: { Networks: { mynet: { IPAMConfig: { IPv4Address: '10.0.0.5' }, Aliases: ['bng'] } } },
        };
        expect(findUnreproducible(i, {}).length).toBeGreaterThan(0);
    });

    it('does not flag a plain custom network with no static IP or aliases', () => {
        const i: DockerInspect = {
            Name: '/x',
            Config: { Image: 'img' },
            HostConfig: { NetworkMode: 'mynet' },
            NetworkSettings: { Networks: { mynet: { IPAMConfig: null, Aliases: null } } },
        };
        expect(findUnreproducible(i, {})).toEqual([]);
    });

    it('flags a port change on a host-network container but not an upgrade', () => {
        const i: DockerInspect = { Name: '/x', Config: { Image: 'img' }, HostConfig: { NetworkMode: 'host' } };
        expect(findUnreproducible(i, { hostPort: 80 }).length).toBeGreaterThan(0);
        expect(findUnreproducible(i, { image: 'img:v2' })).toEqual([]);
    });
});

describe('buildManualInstructions', () => {
    it('mentions the reasons and the port change', () => {
        const msg = buildManualInstructions(['privileged mode (--privileged)'], { hostPort: 443 });
        expect(msg).toContain('privileged mode (--privileged)');
        expect(msg).toContain('443');
    });

    it('describes an upgrade when no host port is given', () => {
        const msg = buildManualInstructions(['a named volume (vol) at /data'], { image: 'img:v2' });
        expect(msg.toLowerCase()).toContain('upgrade');
    });
});
