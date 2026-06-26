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
import type { Deployment, DeploymentCapabilities } from './types';

export class NativeDriver implements DeploymentDriver {
    constructor(private readonly d: Deployment) {}

    async start(): Promise<void> {
        if (this.d.serviceName) await exec(['systemctl', 'start', this.d.serviceName], { superuser: 'try' });
    }

    async stop(): Promise<void> {
        if (this.d.serviceName) await exec(['systemctl', 'stop', this.d.serviceName], { superuser: 'try' });
    }

    async restart(): Promise<void> {
        if (this.d.serviceName) await exec(['systemctl', 'restart', this.d.serviceName], { superuser: 'try' });
    }

    async getHostPort(): Promise<number> {
        return this.d.hostPort;
    }

    getCapabilities(): DeploymentCapabilities {
        return deriveCapabilities(this.d);
    }

    async setHostPort(port: number): Promise<PortChangeResult> {
        const restart = this.d.serviceName
            ? `then restart it from this page or run: systemctl restart ${this.d.serviceName}`
            : 'then restart the birdnet-go process';
        return {
            kind: 'guided-manual',
            instructions:
                `Set the web server port to ${port} in the BirdNET-Go configuration, ${restart}. ` +
                (port < 1024
                    ? `Because ${port} is a privileged port, also grant the binary permission with: ` +
                      `setcap 'cap_net_bind_service=+ep' /path/to/birdnet-go`
                    : ''),
        };
    }
}
