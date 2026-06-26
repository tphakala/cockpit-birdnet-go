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

import type { Deployment, DeploymentCapabilities, PrivilegedPortStrategy } from './types';

const dockerPrivileged = (d: Deployment): PrivilegedPortStrategy =>
    d.runtime === 'podman' ? 'podman-sysctl' : 'docker-root';

export const deriveCapabilities = (d: Deployment): DeploymentCapabilities => {
    switch (d.kind) {
        case 'docker-standalone':
            // The only fully-automatic path: recreate the container with a new
            // host port mapping. The container internal port stays 8080.
            return { canChangePort: true, portChangeMode: 'auto', privilegedPortStrategy: dockerPrivileged(d) };
        case 'docker-systemd':
        case 'docker-compose':
            // Editing a systemd unit's ExecStart or a compose file in place is
            // fragile; guide the user instead. Auto is a later milestone.
            return { canChangePort: true, portChangeMode: 'guided-manual', privilegedPortStrategy: dockerPrivileged(d) };
        // Native auto-edit of the listen port is deferred until birdnet-go's
        // config key is verified (see M1). Until then both native shapes are
        // guided-manual: the plugin can restart the service but instructs the
        // user where to change the port.
        case 'native-systemd':
        case 'native':
            return { canChangePort: true, portChangeMode: 'guided-manual', privilegedPortStrategy: 'setcap' };
        case 'none':
        default:
            return { canChangePort: false, portChangeMode: 'guided-manual', privilegedPortStrategy: 'none' };
    }
};
