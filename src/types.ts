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

export interface LogEntry {
    time: string;
    level: string;
    msg: string;
    service?: string;
    [key: string]: unknown;
}

export interface DockerStatus {
    available: boolean;
    running: boolean;
    version?: string;
}

export interface ContainerStatus {
    exists: boolean;
    running: boolean;
    imagePresent: boolean;
    containerId?: string;
    status?: string;
    isCompose?: boolean;
    composeProject?: string;
    composeService?: string;
    composeWorkingDir?: string;
}

export interface SystemdStatus {
    exists: boolean;
    running: boolean;
    enabled: boolean;
    status?: string;
}

export interface HealthStatus {
    status: string;
    version: string;
    build_date: string;
    environment: string;
    database_status: string;
    database_error?: string;
    uptime: string;
    uptime_seconds: number;
    timestamp: string;
}

export interface VersionInfo {
    current: string;
    buildDate: string;
    latest?: string;
    latestNightly?: string;
    nightlyTags?: string[];
    updateAvailable?: boolean;
    checkingUpdate?: boolean;
    updateError?: string;
    releaseNotes?: string;
    releaseUrl?: string;
}
