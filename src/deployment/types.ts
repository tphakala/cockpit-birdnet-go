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

export type DeploymentKind =
    'docker-standalone' | 'docker-compose' | 'docker-systemd' | 'native-systemd' | 'native' | 'none';

export type ContainerRuntime = 'docker' | 'podman' | null;

export interface Deployment {
    kind: DeploymentKind;
    runtime: ContainerRuntime;
    running: boolean;
    imagePresent: boolean;
    containerId?: string;
    serviceName?: string;
    composeProject?: string;
    composeService?: string;
    composeWorkingDir?: string;
    hostPort: number;
    internalPort: number;
    configPath?: string;
    // Fields the existing app.tsx JSX still reads via a compatibility shim (M0 Task 7).
    // These keep the Docker Status card, the Status details grid, and the upgrade
    // routines working unchanged after detection is consolidated.
    dockerAvailable: boolean;
    dockerRunning: boolean;
    dockerVersion?: string;
    statusText?: string; // human-readable container/service status, e.g. "Up 2 hours"
    // systemd active-state text ("active"/"inactive"/"failed") for the status grid
    systemdStatusText?: string;
    systemdEnabled?: boolean;
}

export interface DetectionSignals {
    runtime: ContainerRuntime;
    imagePresent: boolean;
    docker?: { available: boolean; running: boolean; version?: string };
    container?: {
        id: string;
        running: boolean;
        isCompose: boolean;
        composeProject?: string;
        composeService?: string;
        composeWorkingDir?: string;
        hostPort?: number;
        status?: string;
    };
    systemd?: { exists: boolean; running: boolean; enabled: boolean; status?: string };
    healthRunning: boolean;
}

export type PortChangeMode = 'auto' | 'guided-manual';
export type PrivilegedPortStrategy = 'docker-root' | 'podman-sysctl' | 'setcap' | 'none';

export interface DeploymentCapabilities {
    canChangePort: boolean;
    portChangeMode: PortChangeMode;
    privilegedPortStrategy: PrivilegedPortStrategy;
}
