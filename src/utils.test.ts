import { describe, expect, it, vi } from 'vitest';

import type { ContainerStatus, LogEntry, SystemdStatus } from './types';
import {
    capitalize,
    filterLogs,
    formatLogTime,
    formatUptime,
    getContainerStatusVariant,
    getDockerStatusVariant,
    getLogLevelColor,
    isBinaryInstallation,
    isValidLogFile,
    safeJsonParse,
    sanitizeFileName,
    supportsAutomaticUpgrade,
} from './utils';

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

    it('returns fallback for null input', () => {
        const fallback = { status: 'default' };
        const result = safeJsonParse(null as unknown as string, fallback);
        expect(result).toBe(fallback);
    });

    it('returns fallback for undefined input', () => {
        const fallback = [1, 2, 3];
        const result = safeJsonParse(undefined as unknown as string, fallback);
        expect(result).toBe(fallback);
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

    it('does not log a warning for empty or null input', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        safeJsonParse('', {});
        safeJsonParse(null as unknown as string, {});
        expect(warnSpy).not.toHaveBeenCalled();
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

describe('capitalize', () => {
    it('capitalizes the first letter', () => {
        expect(capitalize('hello')).toBe('Hello');
    });

    it('returns empty string for undefined', () => {
        expect(capitalize(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
        expect(capitalize('')).toBe('');
    });

    it('handles single character', () => {
        expect(capitalize('a')).toBe('A');
    });

    it('does not change already capitalized', () => {
        expect(capitalize('Hello')).toBe('Hello');
    });
});

describe('formatLogTime', () => {
    it('formats an ISO timestamp', () => {
        const result = formatLogTime('2025-01-15T10:30:00Z');
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
    });

    it('returns Invalid Date for garbage input', () => {
        expect(formatLogTime('not-a-date')).toBe('Invalid Date');
    });
});

describe('getLogLevelColor', () => {
    it('returns red for ERROR', () => {
        expect(getLogLevelColor('ERROR')).toBe('#c9190b');
    });

    it('returns yellow for WARN', () => {
        expect(getLogLevelColor('WARN')).toBe('#f0ab00');
    });

    it('returns blue for INFO', () => {
        expect(getLogLevelColor('INFO')).toBe('#0066cc');
    });

    it('returns gray for DEBUG', () => {
        expect(getLogLevelColor('DEBUG')).toBe('#6a6e73');
    });

    it('returns default for unknown level', () => {
        expect(getLogLevelColor('TRACE')).toBe('#151515');
    });

    it('is case-insensitive', () => {
        expect(getLogLevelColor('error')).toBe('#c9190b');
        expect(getLogLevelColor('warn')).toBe('#f0ab00');
    });
});

describe('formatUptime', () => {
    it('formats hours, minutes, seconds', () => {
        expect(formatUptime('1h30m45s')).toBe('1h 30m 45s');
    });

    it('formats minutes and seconds only', () => {
        expect(formatUptime('5m30s')).toBe('5m 30s');
    });

    it('formats seconds only', () => {
        expect(formatUptime('45s')).toBe('45s');
    });

    it('formats fractional seconds', () => {
        expect(formatUptime('45.123s')).toBe('45s');
    });

    it('formats milliseconds only', () => {
        expect(formatUptime('500ms')).toBe('0s');
    });

    it('returns 0s for empty string', () => {
        expect(formatUptime('')).toBe('0s');
    });

    it('returns 0s for null-ish input', () => {
        expect(formatUptime(null as unknown as string)).toBe('0s');
        expect(formatUptime(undefined as unknown as string)).toBe('0s');
    });

    it('clamps hours to max 8760 (1 year)', () => {
        const result = formatUptime('10000h');
        expect(result).toBe('8760h');
    });

    it('clamps minutes to max 59', () => {
        expect(formatUptime('90m')).toBe('59m');
    });

    it('handles hours only', () => {
        expect(formatUptime('2h')).toBe('2h');
    });
});

describe('isBinaryInstallation', () => {
    const defaultSystemd: SystemdStatus = { exists: false, running: false, enabled: false };
    const defaultContainer: ContainerStatus = { exists: false, running: false, imagePresent: false };

    it('returns true when systemd exists but no container', () => {
        expect(isBinaryInstallation({ ...defaultSystemd, exists: true }, { ...defaultContainer, exists: false })).toBe(
            true
        );
    });

    it('returns true when running via systemd with no container', () => {
        expect(
            isBinaryInstallation(
                { ...defaultSystemd, running: true },
                { ...defaultContainer, running: true, exists: false }
            )
        ).toBe(true);
    });

    it('returns false when container exists', () => {
        expect(isBinaryInstallation(defaultSystemd, { ...defaultContainer, exists: true })).toBe(false);
    });

    it('returns false when both systemd and container exist', () => {
        expect(isBinaryInstallation({ ...defaultSystemd, exists: true }, { ...defaultContainer, exists: true })).toBe(
            false
        );
    });
});

describe('supportsAutomaticUpgrade', () => {
    const defaultSystemd: SystemdStatus = { exists: false, running: false, enabled: false };
    const defaultContainer: ContainerStatus = { exists: false, running: false, imagePresent: false };

    it('returns false for binary installation', () => {
        expect(
            supportsAutomaticUpgrade({ ...defaultSystemd, exists: true }, { ...defaultContainer, exists: false })
        ).toBe(false);
    });

    it('returns false for Docker Compose', () => {
        expect(supportsAutomaticUpgrade(defaultSystemd, { ...defaultContainer, exists: true, isCompose: true })).toBe(
            false
        );
    });

    it('returns true for standalone Docker container', () => {
        expect(supportsAutomaticUpgrade(defaultSystemd, { ...defaultContainer, exists: true, isCompose: false })).toBe(
            true
        );
    });

    it('returns false when no container exists', () => {
        expect(supportsAutomaticUpgrade(defaultSystemd, defaultContainer)).toBe(false);
    });
});

describe('getDockerStatusVariant', () => {
    it('returns danger when Docker not available', () => {
        expect(getDockerStatusVariant({ available: false, running: false })).toBe('danger');
    });

    it('returns warning when Docker not running', () => {
        expect(getDockerStatusVariant({ available: true, running: false })).toBe('warning');
    });

    it('returns success when Docker is running', () => {
        expect(getDockerStatusVariant({ available: true, running: true })).toBe('success');
    });
});

describe('getContainerStatusVariant', () => {
    const defaultSystemd: SystemdStatus = { exists: false, running: false, enabled: false };
    const defaultContainer: ContainerStatus = { exists: false, running: false, imagePresent: false };

    it('returns success when systemd service is running', () => {
        expect(getContainerStatusVariant({ ...defaultSystemd, exists: true, running: true }, defaultContainer)).toBe(
            'success'
        );
    });

    it('returns warning when systemd exists but not running', () => {
        expect(getContainerStatusVariant({ ...defaultSystemd, exists: true, running: false }, defaultContainer)).toBe(
            'warning'
        );
    });

    it('returns warning when image not present', () => {
        expect(getContainerStatusVariant(defaultSystemd, { ...defaultContainer, imagePresent: false })).toBe('warning');
    });

    it('returns info when image present but no container', () => {
        expect(
            getContainerStatusVariant(defaultSystemd, { ...defaultContainer, imagePresent: true, exists: false })
        ).toBe('info');
    });

    it('returns warning when container exists but not running', () => {
        expect(
            getContainerStatusVariant(defaultSystemd, {
                ...defaultContainer,
                imagePresent: true,
                exists: true,
                running: false,
            })
        ).toBe('warning');
    });

    it('returns success when container is running', () => {
        expect(
            getContainerStatusVariant(defaultSystemd, {
                ...defaultContainer,
                imagePresent: true,
                exists: true,
                running: true,
            })
        ).toBe('success');
    });
});

describe('filterLogs', () => {
    const logs: LogEntry[] = [
        { time: '2025-01-01', level: 'ERROR', msg: 'Something failed' },
        { time: '2025-01-01', level: 'WARN', msg: 'Something risky' },
        { time: '2025-01-01', level: 'INFO', msg: 'Started successfully' },
        { time: '2025-01-01', level: 'DEBUG', msg: 'Processing item 42' },
    ];

    it('returns all logs when filter is "all"', () => {
        expect(filterLogs(logs, 'all', '')).toHaveLength(4);
    });

    it('filters by log level', () => {
        expect(filterLogs(logs, 'ERROR', '')).toHaveLength(1);
        expect(filterLogs(logs, 'ERROR', '')[0].msg).toBe('Something failed');
    });

    it('is case-insensitive for level filter', () => {
        expect(filterLogs(logs, 'error', '')).toHaveLength(1);
    });

    it('filters by search text', () => {
        expect(filterLogs(logs, 'all', 'item 42')).toHaveLength(1);
        expect(filterLogs(logs, 'all', 'item 42')[0].level).toBe('DEBUG');
    });

    it('is case-insensitive for search text', () => {
        expect(filterLogs(logs, 'all', 'STARTED')).toHaveLength(1);
    });

    it('combines level and search filters', () => {
        expect(filterLogs(logs, 'INFO', 'started')).toHaveLength(1);
        expect(filterLogs(logs, 'ERROR', 'started')).toHaveLength(0);
    });

    it('returns empty for no matches', () => {
        expect(filterLogs(logs, 'all', 'nonexistent')).toHaveLength(0);
    });

    it('handles empty logs array', () => {
        expect(filterLogs([], 'all', '')).toHaveLength(0);
    });
});

describe('sanitizeFileName', () => {
    it('returns a valid filename unchanged', () => {
        expect(sanitizeFileName('analysis.log')).toBe('analysis.log');
    });

    it('allows hyphens and underscores', () => {
        expect(sanitizeFileName('my-log_file.log')).toBe('my-log_file.log');
    });

    it('allows alphanumeric names', () => {
        expect(sanitizeFileName('log2025.log')).toBe('log2025.log');
    });

    it('strips forward slash path components and returns basename', () => {
        expect(sanitizeFileName('/etc/passwd')).toBe('passwd');
    });

    it('strips backslash path components and returns basename', () => {
        expect(sanitizeFileName('C:\\Windows\\system32\\config')).toBe('config');
    });

    it('rejects double-dot sequences', () => {
        expect(sanitizeFileName('..%2f..%2fetc/passwd')).toBe('passwd');
        expect(sanitizeFileName('../../../etc/passwd')).toBe('passwd');
    });

    it('rejects basename containing double dots', () => {
        expect(sanitizeFileName('..analysis.log')).toBe('');
        expect(sanitizeFileName('foo..bar')).toBe('');
    });

    it('returns empty for path traversal attempts after basename extraction', () => {
        expect(sanitizeFileName('..')).toBe('');
        expect(sanitizeFileName('../..')).toBe('');
    });

    it('rejects names with special characters', () => {
        expect(sanitizeFileName('file name.log')).toBe('');
        expect(sanitizeFileName('file;rm -rf /')).toBe('');
        expect(sanitizeFileName('file$(whoami).log')).toBe('');
        expect(sanitizeFileName('file`id`.log')).toBe('');
        expect(sanitizeFileName("file'name.log")).toBe('');
        expect(sanitizeFileName('file"name.log')).toBe('');
    });

    it('returns empty for empty or falsy input', () => {
        expect(sanitizeFileName('')).toBe('');
        expect(sanitizeFileName(null as unknown as string)).toBe('');
        expect(sanitizeFileName(undefined as unknown as string)).toBe('');
    });

    it('returns empty for whitespace-only input', () => {
        expect(sanitizeFileName('   ')).toBe('');
    });

    it('handles names with only dots', () => {
        expect(sanitizeFileName('.')).toBe('.');
        expect(sanitizeFileName('.hidden')).toBe('.hidden');
    });
});

describe('isValidLogFile', () => {
    const allowedFiles = ['analysis.log', 'birdnet.log', 'system-2025.log'];

    it('returns true for a valid file in the allowed list', () => {
        expect(isValidLogFile('analysis.log', allowedFiles)).toBe(true);
        expect(isValidLogFile('birdnet.log', allowedFiles)).toBe(true);
        expect(isValidLogFile('system-2025.log', allowedFiles)).toBe(true);
    });

    it('returns false for a file not in the allowed list', () => {
        expect(isValidLogFile('other.log', allowedFiles)).toBe(false);
    });

    it('returns false for path traversal attempts', () => {
        expect(isValidLogFile('../etc/passwd', allowedFiles)).toBe(false);
        expect(isValidLogFile('/etc/shadow', allowedFiles)).toBe(false);
        expect(isValidLogFile('../../analysis.log', allowedFiles)).toBe(false);
    });

    it('returns false for empty input', () => {
        expect(isValidLogFile('', allowedFiles)).toBe(false);
    });

    it('returns false for names with special characters', () => {
        expect(isValidLogFile('file;cmd', allowedFiles)).toBe(false);
        expect(isValidLogFile('file name.log', allowedFiles)).toBe(false);
    });

    it('returns false when the sanitized name differs from input', () => {
        // Even if the basename matches an allowed file, the original must match too
        expect(isValidLogFile('/some/path/analysis.log', allowedFiles)).toBe(false);
    });

    it('returns false with empty allowed list', () => {
        expect(isValidLogFile('analysis.log', [])).toBe(false);
    });
});
