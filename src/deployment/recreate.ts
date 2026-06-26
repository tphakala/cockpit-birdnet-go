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
    Config?: {
        Image?: string;
        Env?: string[];
        Labels?: Record<string, string> | null;
        User?: string;
    };
    HostConfig?: {
        PortBindings?: Record<string, { HostPort: string; HostIp?: string }[]>;
        Devices?: { PathOnHost: string; PathInContainer: string; CgroupPermissions?: string }[] | null;
        NetworkMode?: string;
        RestartPolicy?: { Name?: string; MaximumRetryCount?: number };
        CapAdd?: string[] | null;
        CapDrop?: string[] | null;
        Privileged?: boolean;
        Tmpfs?: Record<string, string> | null;
        Sysctls?: Record<string, string> | null;
        Ulimits?: unknown[] | null;
        GroupAdd?: string[] | null;
        ExtraHosts?: string[] | null;
        Dns?: string[] | null;
        SecurityOpt?: string[] | null;
        DeviceCgroupRules?: string[] | null;
        DeviceRequests?: unknown[] | null;
        Runtime?: string;
    };
    Mounts?: { Type: string; Source: string; Destination: string; RW?: boolean; Propagation?: string }[];
    NetworkSettings?: {
        Networks?: Record<
            string,
            { IPAMConfig?: { IPv4Address?: string; IPv6Address?: string } | null; Aliases?: string[] | null }
        > | null;
    };
}

export interface RecreateOptions {
    hostPort?: number;
    internalPort?: number;
    image?: string;
}

// NetworkMode values that mean "the default bridge network" and so need no --network flag.
const DEFAULT_NETWORK_MODES = new Set(['', 'default', 'bridge']);

export const buildRunArgs = (bin: string, inspect: DockerInspect, opts: RecreateOptions): string[] => {
    const name = (inspect.Name || '').replace('/', '');
    const args = [bin, 'run', '-d', '--name', name];

    // Restart policy: preserve the real value. Default to unless-stopped only when
    // inspect carries no policy (keeps prior behavior and never drops restart by omission).
    const policy = inspect.HostConfig?.RestartPolicy;
    const policyName = policy?.Name ? policy.Name : undefined;
    if (policyName === undefined) {
        args.push('--restart', 'unless-stopped');
    } else if (policyName !== 'no') {
        const count = policyName === 'on-failure' && policy?.MaximumRetryCount ? `:${policy.MaximumRetryCount}` : '';
        args.push('--restart', `${policyName}${count}`);
    }
    // policyName === 'no' is docker's default; emit nothing.

    // Network mode: reproduce any non-default mode (host, none, a named network).
    const netMode = inspect.HostConfig?.NetworkMode ?? '';
    const hostNet = netMode === 'host';
    if (!DEFAULT_NETWORK_MODES.has(netMode)) args.push('--network', netMode);

    const internal = opts.internalPort ?? 8080;

    // Port bindings. Host networking ignores -p, so skip the mappings entirely there.
    if (!hostNet) {
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
    }

    // Devices (e.g. --device /dev/snd for sound-card capture).
    for (const dev of inspect.HostConfig?.Devices ?? []) {
        const perms = dev.CgroupPermissions ?? 'rwm';
        if (dev.PathOnHost === dev.PathInContainer && perms === 'rwm') {
            args.push('--device', dev.PathOnHost);
        } else {
            args.push('--device', `${dev.PathOnHost}:${dev.PathInContainer}:${perms}`);
        }
    }

    // Bind mounts, preserving read-only and a non-default propagation mode.
    for (const m of inspect.Mounts ?? []) {
        if (m.Type !== 'bind') continue;
        const suffix: string[] = [];
        if (m.RW === false) suffix.push('ro');
        if (m.Propagation && m.Propagation !== 'rprivate') suffix.push(m.Propagation);
        const opt = suffix.length ? `:${suffix.join(',')}` : '';
        args.push('-v', `${m.Source}:${m.Destination}${opt}`);
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
        try {
            await exec(buildRunArgs(bin, inspect, restoreOpts));
        } catch {
            // The restore run also failed; fall through and surface the original error.
        }
        throw err;
    }
};
