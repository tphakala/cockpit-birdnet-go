import { describe, expect, it, vi } from 'vitest';

import { safeJsonParse } from './utils';

describe('safeJsonParse', () => {
    it('parses valid JSON and returns the result', () => {
        const result = safeJsonParse('{"name":"test","value":42}', {});
        expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('parses valid JSON arrays', () => {
        const result = safeJsonParse('[1, 2, 3]', []);
        expect(result).toEqual([1, 2, 3]);
    });

    it('returns fallback for invalid JSON', () => {
        const fallback = { status: 'unknown' };
        const result = safeJsonParse('not valid json', fallback);
        expect(result).toBe(fallback);
    });

    it('returns fallback for empty string', () => {
        const result = safeJsonParse('', null);
        expect(result).toBeNull();
    });

    it('returns fallback for truncated JSON', () => {
        const result = safeJsonParse('{"status": "healthy', { status: 'error' });
        expect(result).toEqual({ status: 'error' });
    });

    it('returns fallback for HTML error pages (non-JSON response)', () => {
        const html = '<html><body>502 Bad Gateway</body></html>';
        const result = safeJsonParse(html, []);
        expect(result).toEqual([]);
    });

    it('logs a warning with context when parsing fails', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        safeJsonParse('bad json', {}, 'health check response');
        expect(warnSpy).toHaveBeenCalledWith('Failed to parse JSON (health check response):', expect.any(SyntaxError));
        warnSpy.mockRestore();
    });

    it('logs a warning without context when context is omitted', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        safeJsonParse('bad json', {});
        expect(warnSpy).toHaveBeenCalledWith('Failed to parse JSON:', expect.any(SyntaxError));
        warnSpy.mockRestore();
    });

    it('preserves generic type for typed fallbacks', () => {
        interface HealthStatus {
            status: string;
            version: string;
        }
        const fallback: HealthStatus = { status: 'unknown', version: '0.0.0' };
        const result = safeJsonParse<HealthStatus>('invalid', fallback);
        expect(result.status).toBe('unknown');
        expect(result.version).toBe('0.0.0');
    });

    it('handles JSON with nested objects', () => {
        const json = '{"metadata":{"container":{"tags":["v1.0","nightly"]}}}';
        const result = safeJsonParse(json, {});
        expect(result).toEqual({ metadata: { container: { tags: ['v1.0', 'nightly'] } } });
    });
});
