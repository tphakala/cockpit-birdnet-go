/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import type { ContainerStatus, DockerStatus, LogEntry, SystemdStatus } from './types';

export const capitalize = (str?: string): string => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const formatLogTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
};

export const getLogLevelColor = (level: string): string => {
    switch (level?.toUpperCase()) {
        case 'ERROR':
            return '#c9190b';
        case 'WARN':
            return '#f0ab00';
        case 'INFO':
            return '#0066cc';
        case 'DEBUG':
            return '#6a6e73';
        default:
            return '#151515';
    }
};

export const formatUptime = (uptimeStr: string): string => {
    if (!uptimeStr || typeof uptimeStr !== 'string') {
        return '0s';
    }

    try {
        let totalSeconds = 0;

        const hoursMatch = uptimeStr.match(/(\d+)h/);
        const minutesMatch = uptimeStr.match(/(\d+)m(?!s)/);
        const secondsMatch = uptimeStr.match(/(\d+(?:\.\d+)?)s/);
        const millisecondsMatch = uptimeStr.match(/(\d+(?:\.\d+)?)ms/);

        if (hoursMatch) {
            const hours = parseInt(hoursMatch[1], 10);
            totalSeconds += Math.min(hours, 8760) * 3600;
        }

        if (minutesMatch) {
            const minutes = parseInt(minutesMatch[1], 10);
            totalSeconds += Math.min(minutes, 59) * 60;
        }

        if (secondsMatch) {
            const seconds = parseFloat(secondsMatch[1]);
            totalSeconds += Math.min(seconds, 59);
        }

        if (millisecondsMatch && !secondsMatch) {
            const ms = parseFloat(millisecondsMatch[1]);
            totalSeconds += Math.min(ms / 1000, 59);
        }

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);

        const parts: string[] = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

        return parts.join(' ');
    } catch (error) {
        console.warn('Error parsing uptime:', uptimeStr, error);
        return '0s';
    }
};

export const isBinaryInstallation = (systemdStatus: SystemdStatus, containerStatus: ContainerStatus): boolean => {
    if (systemdStatus.exists && !containerStatus.exists) return true;
    if ((containerStatus.running || systemdStatus.running) && !containerStatus.exists) return true;
    return false;
};

export const supportsAutomaticUpgrade = (systemdStatus: SystemdStatus, containerStatus: ContainerStatus): boolean => {
    if (isBinaryInstallation(systemdStatus, containerStatus)) return false;
    if (containerStatus.isCompose) return false;
    return containerStatus.exists && !containerStatus.isCompose;
};

export const getDockerStatusVariant = (dockerStatus: DockerStatus): 'danger' | 'warning' | 'success' => {
    if (!dockerStatus.available) return 'danger';
    if (!dockerStatus.running) return 'warning';
    return 'success';
};

export const getContainerStatusVariant = (
    systemdStatus: SystemdStatus,
    containerStatus: ContainerStatus
): 'danger' | 'warning' | 'info' | 'success' => {
    if (systemdStatus.exists) {
        if (systemdStatus.running) return 'success';
        return 'warning';
    }

    if (!containerStatus.imagePresent) return 'warning';
    if (!containerStatus.exists) return 'info';
    if (!containerStatus.running) return 'warning';
    return 'success';
};

export const filterLogs = (logs: LogEntry[], levelFilter: string, searchText: string): LogEntry[] => {
    return logs.filter(log => {
        if (levelFilter !== 'all' && log.level?.toUpperCase() !== levelFilter.toUpperCase()) {
            return false;
        }

        if (searchText && !JSON.stringify(log).toLowerCase().includes(searchText.toLowerCase())) {
            return false;
        }

        return true;
    });
};
