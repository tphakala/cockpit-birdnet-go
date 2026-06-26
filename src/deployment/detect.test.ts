import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseContainerLine, parseHostPort } from './detect';

describe('parseContainerLine', () => {
    it('parses a plain birdnet-go container line incl status', () => {
        const c = parseContainerLine('abc123|ghcr.io/tphakala/birdnet-go:nightly|Up 2 hours|birdnet-go|');
        // undefined-valued compose fields are ignored by toEqual
        expect(c).toEqual({ id: 'abc123', running: true, isCompose: false, status: 'Up 2 hours' });
    });

    it('extracts compose project, service, and working dir from labels', () => {
        const line =
            'c1|ghcr.io/tphakala/birdnet-go:latest|Up|bng|com.docker.compose.project=bng,com.docker.compose.service=web,com.docker.compose.project.working_dir=/srv/bng';
        const c = parseContainerLine(line);
        expect(c).toMatchObject({
            id: 'c1',
            isCompose: true,
            composeProject: 'bng',
            composeService: 'web',
            composeWorkingDir: '/srv/bng',
        });
    });

    it('ignores vscode dev containers', () => {
        expect(parseContainerLine('x|vsc-abc|Up|vsc|')).toBeNull();
    });

    it('returns running:false for an exited container', () => {
        expect(parseContainerLine('d|ghcr.io/tphakala/birdnet-go:nightly|Exited (0) 3m ago|birdnet-go|')?.running).toBe(
            false
        );
    });
});

describe('parseHostPort', () => {
    it('returns the host port mapped to the internal port', () => {
        const inspect = JSON.stringify([{ HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '9000' }] } } }]);
        expect(parseHostPort(inspect, 8080)).toBe(9000);
    });

    it('returns undefined when no mapping for the internal port exists', () => {
        const inspect = JSON.stringify([{ HostConfig: { PortBindings: {} } }]);
        expect(parseHostPort(inspect, 8080)).toBeUndefined();
    });

    it('returns undefined for unparseable input', () => {
        expect(parseHostPort('not json', 8080)).toBeUndefined();
    });
});

const probeMock = vi.fn();
vi.mock('./exec', () => ({
    exec: (...a: unknown[]) => probeMock(...a),
    probe: (...a: unknown[]) => probeMock(...a),
}));

afterEach(() => probeMock.mockReset());

describe('detectDeployment', () => {
    it('classifies a running standalone docker deployment', async () => {
        const { detectDeployment } = await import('./detect');
        probeMock.mockImplementation((argv: string[]) => {
            const cmd = argv.join(' ');
            if (cmd.includes('docker --version')) return { ok: true, out: 'Docker version 27' };
            if (cmd.includes('images')) return { ok: true, out: 'ghcr.io/tphakala/birdnet-go:nightly' };
            if (cmd.includes('curl')) return { ok: false, out: '' };
            if (cmd.includes('ps -a'))
                return { ok: true, out: 'abc|ghcr.io/tphakala/birdnet-go:nightly|Up|birdnet-go|' };
            if (cmd.includes('inspect'))
                return {
                    ok: true,
                    out: JSON.stringify([{ HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '8080' }] } } }]),
                };
            if (cmd.includes('list-unit-files')) return { ok: true, out: '' };
            return { ok: false, out: '' };
        });
        const d = await detectDeployment('localhost');
        expect(d.kind).toBe('docker-standalone');
        expect(d.runtime).toBe('docker');
        expect(d.hostPort).toBe(8080);
    });

    it('populates systemdStatusText from is-active output for a native-systemd deployment', async () => {
        const { detectDeployment } = await import('./detect');
        probeMock.mockImplementation((argv: string[]) => {
            const cmd = argv.join(' ');
            if (cmd.includes('docker --version')) return { ok: false, out: '' };
            if (cmd.includes('podman --version')) return { ok: false, out: '' };
            if (cmd.includes('curl')) return { ok: false, out: '' };
            if (cmd.includes('list-unit-files')) return { ok: true, out: 'birdnet-go.service enabled' };
            if (cmd.includes('is-active')) return { ok: true, out: 'active' };
            if (cmd.includes('is-enabled')) return { ok: true, out: 'enabled' };
            return { ok: false, out: '' };
        });
        const d = await detectDeployment('localhost');
        expect(d.kind).toBe('native-systemd');
        expect(d.systemdStatusText).toBe('active');
    });

    it('detects a running docker daemon as docker', async () => {
        const { detectDeployment } = await import('./detect');
        probeMock.mockImplementation((argv: string[]) => {
            const cmd = argv.join(' ');
            if (cmd.includes('docker --version')) return { ok: true, out: 'Docker version 27' };
            if (cmd.includes('is-active docker')) return { ok: true, out: 'active' };
            return { ok: false, out: '' };
        });
        const d = await detectDeployment('localhost');
        expect(d.runtime).toBe('docker');
        expect(d.dockerRunning).toBe(true);
    });

    it('prefers a running podman when the docker CLI exists but its daemon is down', async () => {
        const { detectDeployment } = await import('./detect');
        probeMock.mockImplementation((argv: string[]) => {
            const cmd = argv.join(' ');
            if (cmd.includes('docker --version')) return { ok: true, out: 'Docker version 27' };
            if (cmd.includes('is-active docker')) return { ok: true, out: 'inactive' };
            if (cmd.includes('podman --version')) return { ok: true, out: 'podman version 5' };
            return { ok: false, out: '' };
        });
        const d = await detectDeployment('localhost');
        expect(d.runtime).toBe('podman');
        expect(d.dockerRunning).toBe(true);
    });

    it('reports docker present-but-stopped when its daemon is down and there is no podman', async () => {
        const { detectDeployment } = await import('./detect');
        probeMock.mockImplementation((argv: string[]) => {
            const cmd = argv.join(' ');
            if (cmd.includes('docker --version')) return { ok: true, out: 'Docker version 27' };
            if (cmd.includes('is-active docker')) return { ok: true, out: 'inactive' };
            if (cmd.includes('podman --version')) return { ok: false, out: '' };
            return { ok: false, out: '' };
        });
        const d = await detectDeployment('localhost');
        expect(d.runtime).toBe('docker');
        expect(d.dockerAvailable).toBe(true);
        expect(d.dockerRunning).toBe(false);
    });

    it('detects podman when the docker CLI is absent', async () => {
        const { detectDeployment } = await import('./detect');
        probeMock.mockImplementation((argv: string[]) => {
            const cmd = argv.join(' ');
            if (cmd.includes('docker --version')) return { ok: false, out: '' };
            if (cmd.includes('podman --version')) return { ok: true, out: 'podman version 5' };
            return { ok: false, out: '' };
        });
        const d = await detectDeployment('localhost');
        expect(d.runtime).toBe('podman');
        expect(d.dockerRunning).toBe(true);
    });

    it('reports no runtime when neither docker nor podman is present', async () => {
        const { detectDeployment } = await import('./detect');
        probeMock.mockImplementation((argv: string[]) => {
            const cmd = argv.join(' ');
            if (cmd.includes('docker --version')) return { ok: false, out: '' };
            if (cmd.includes('podman --version')) return { ok: false, out: '' };
            return { ok: false, out: '' };
        });
        const d = await detectDeployment('localhost');
        expect(d.runtime).toBe(null);
        expect(d.dockerAvailable).toBe(false);
    });
});
