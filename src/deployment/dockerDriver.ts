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

import { deriveCapabilities } from './capabilities';
import type { DeploymentDriver, PortChangeResult } from './driver';
import { exec } from './exec';
import { recreateContainer } from './recreate';
import { runtimeBin } from './runtime';
import type { Deployment, DeploymentCapabilities } from './types';

export class DockerDriver implements DeploymentDriver {
    constructor(private readonly d: Deployment) {}

    private bin(): 'docker' | 'podman' {
        return runtimeBin(this.d.runtime);
    }

    async start(): Promise<void> {
        if (this.d.serviceName) {
            await exec(['systemctl', 'start', this.d.serviceName], { superuser: 'try' });
        } else if (this.d.containerId) {
            await exec([this.bin(), 'start', this.d.containerId]);
        }
    }

    async stop(): Promise<void> {
        if (this.d.serviceName) {
            await exec(['systemctl', 'stop', this.d.serviceName], { superuser: 'try' });
        } else if (this.d.containerId) {
            await exec([this.bin(), 'stop', this.d.containerId]);
        }
    }

    async restart(): Promise<void> {
        if (this.d.serviceName) {
            await exec(['systemctl', 'restart', this.d.serviceName], { superuser: 'try' });
        } else if (this.d.containerId) {
            await exec([this.bin(), 'restart', this.d.containerId]);
        }
    }

    async getHostPort(): Promise<number> {
        return this.d.hostPort;
    }

    getCapabilities(): DeploymentCapabilities {
        return deriveCapabilities(this.d);
    }

    async setHostPort(port: number): Promise<PortChangeResult> {
        if (this.d.kind === 'docker-standalone' && this.d.containerId) {
            const result = await recreateContainer(this.bin(), this.d.containerId, {
                hostPort: port,
                internalPort: this.d.internalPort,
            });
            if (result.kind === 'unsupported') {
                return { kind: 'guided-manual', instructions: result.instructions };
            }
            return { kind: 'applied' };
        }
        if (this.d.kind === 'docker-compose') {
            const dir = this.d.composeWorkingDir || 'your compose project directory';
            return {
                kind: 'guided-manual',
                instructions:
                    `In ${dir}, set the host side of the birdnet-go service ports mapping to ${port} ` +
                    `(e.g. "${port}:8080"), then run: docker compose up -d`,
            };
        }
        if (this.d.kind === 'docker-systemd') {
            return {
                kind: 'guided-manual',
                instructions:
                    `Edit the ExecStart line of ${this.d.serviceName} to map host port ${port} (e.g. -p ${port}:8080), ` +
                    `then run: systemctl daemon-reload && systemctl restart ${this.d.serviceName}`,
            };
        }
        // Fallback: e.g. a standalone deployment with no container id, or an unexpected kind.
        return {
            kind: 'guided-manual',
            instructions: `Could not determine how to change the port automatically for this deployment. Recreate the container with the new host mapping (for example -p ${port}:8080).`,
        };
    }
}
