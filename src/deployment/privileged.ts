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
import { isPrivilegedPort } from './ports';
import type { Deployment } from './types';

export type PrivilegedAction = { kind: 'ok' } | { kind: 'manual'; instructions: string };

export const ensurePrivilegedBind = (d: Deployment, port: number): PrivilegedAction => {
    if (!isPrivilegedPort(port)) return { kind: 'ok' };
    switch (deriveCapabilities(d).privilegedPortStrategy) {
        case 'docker-root':
            return { kind: 'ok' };
        case 'podman-sysctl':
            return {
                kind: 'manual',
                instructions:
                    `Rootless podman cannot bind port ${port}. On the host run: ` +
                    `sysctl net.ipv4.ip_unprivileged_port_start=${port} (persist it in /etc/sysctl.d/), then retry.`,
            };
        case 'setcap':
            return {
                kind: 'manual',
                instructions:
                    `Binding port ${port} needs CAP_NET_BIND_SERVICE. Grant it with: ` +
                    `setcap 'cap_net_bind_service=+ep' /path/to/birdnet-go, then retry.`,
            };
        default:
            return {
                kind: 'manual',
                instructions: `Port ${port} is privileged and cannot be bound by this deployment.`,
            };
    }
};
