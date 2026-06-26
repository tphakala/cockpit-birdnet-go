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

import { exec } from './exec';

export interface DockerInspect {
    Name?: string;
    Config?: { Image?: string; Env?: string[] };
    HostConfig?: { PortBindings?: Record<string, { HostPort: string; HostIp?: string }[]> };
    Mounts?: { Type: string; Source: string; Destination: string }[];
}

export interface RecreateOptions {
    hostPort?: number;
    internalPort?: number;
    image?: string;
}

export const buildRunArgs = (bin: string, inspect: DockerInspect, opts: RecreateOptions): string[] => {
    const name = (inspect.Name || '').replace('/', '');
    const args = [bin, 'run', '-d', '--name', name, '--restart', 'unless-stopped'];
    const internal = opts.internalPort ?? 8080;

    const bindings = inspect.HostConfig?.PortBindings ?? {};
    for (const [containerPort, hostPorts] of Object.entries(bindings)) {
        const internalNum = containerPort.split('/')[0];
        for (const b of hostPorts ?? []) {
            const hostPort =
                opts.hostPort != null && internalNum === String(internal) ? String(opts.hostPort) : b.HostPort;
            // preserve a bound interface (e.g. 127.0.0.1) so a localhost-only
            // binding is not silently widened to 0.0.0.0 on a port change
            const ip = b.HostIp ? `${b.HostIp}:` : '';
            args.push('-p', `${ip}${hostPort}:${internalNum}`);
        }
    }

    for (const m of inspect.Mounts ?? []) {
        if (m.Type === 'bind') args.push('-v', `${m.Source}:${m.Destination}`);
    }

    for (const env of inspect.Config?.Env ?? []) {
        if (!env.startsWith('PATH=') && !env.startsWith('HOME=')) args.push('-e', env);
    }

    args.push(opts.image ?? inspect.Config?.Image ?? '');
    return args;
};

export const recreateContainer = async (bin: string, containerId: string, opts: RecreateOptions): Promise<void> => {
    const inspectJson = await exec([bin, 'inspect', containerId]);
    const inspect = (JSON.parse(inspectJson) as DockerInspect[])[0];
    if (!inspect) throw new Error('failed to inspect container');
    await exec([bin, 'stop', containerId]);
    await exec([bin, 'rm', containerId]);
    try {
        await exec(buildRunArgs(bin, inspect, opts));
    } catch (err) {
        // The new `docker run` failed after the old container was removed (e.g. a
        // restricted port). Never leave the user with no container: recreate the
        // original (original port mapping and image), then surface the failure.
        const restoreOpts: RecreateOptions = {};
        if (opts.internalPort !== undefined) restoreOpts.internalPort = opts.internalPort;
        await exec(buildRunArgs(bin, inspect, restoreOpts));
        throw err;
    }
};
