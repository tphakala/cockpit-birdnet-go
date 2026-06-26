import { afterEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.fn();
vi.mock('cockpit', () => ({ default: { spawn: (...args: unknown[]) => spawn(...args) } }));

import { exec, probe } from './exec';

afterEach(() => spawn.mockReset());

describe('exec', () => {
    it('passes argv and superuser option through to cockpit.spawn and returns stdout', async () => {
        spawn.mockResolvedValue('hello\n');
        const out = await exec(['echo', 'hello'], { superuser: 'try' });
        expect(out).toBe('hello\n');
        expect(spawn).toHaveBeenCalledWith(['echo', 'hello'], { superuser: 'try', err: 'message' });
    });

    it('rejects when the underlying spawn rejects', async () => {
        spawn.mockRejectedValue(new Error('boom'));
        await expect(exec(['false'])).rejects.toThrow('boom');
    });
});

describe('probe', () => {
    it('returns ok:true with trimmed output on success', async () => {
        spawn.mockResolvedValue('active\n');
        expect(await probe(['systemctl', 'is-active', 'x'])).toEqual({ ok: true, out: 'active' });
    });

    it('returns ok:false with empty output when the command fails', async () => {
        spawn.mockRejectedValue(new Error('inactive'));
        expect(await probe(['systemctl', 'is-active', 'x'])).toEqual({ ok: false, out: '' });
    });
});
