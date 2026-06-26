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

// Network names that are docker built-ins (reproducible via --network or the default).
const BUILTIN_NETWORK_NAMES = new Set(['bridge', 'host', 'none', 'default']);

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

/**
 * Curated list of container settings buildRunArgs cannot faithfully reproduce.
 * A non-empty result means the container must NOT be auto-recreated; the caller
 * should fall back to guided-manual steps so nothing is silently dropped. This is
 * a known-impactful field set, not an exhaustive inspect diff.
 */
export const findUnreproducible = (inspect: DockerInspect, opts: RecreateOptions): string[] => {
    const reasons: string[] = [];
    const hc = inspect.HostConfig ?? {};

    for (const m of inspect.Mounts ?? []) {
        if (m.Type !== 'bind') reasons.push(`a non-bind mount (${m.Type}) at ${m.Destination}`);
    }
    if (hc.Privileged) reasons.push('privileged mode (--privileged)');
    if (hc.CapAdd?.length) reasons.push(`added capabilities (${hc.CapAdd.join(', ')})`);
    if (hc.CapDrop?.length) reasons.push(`dropped capabilities (${hc.CapDrop.join(', ')})`);
    if (hc.Tmpfs && Object.keys(hc.Tmpfs).length) reasons.push('tmpfs mounts (--tmpfs)');
    if (hc.Sysctls && Object.keys(hc.Sysctls).length) reasons.push('custom sysctls (--sysctl)');
    if (hc.Ulimits?.length) reasons.push('custom ulimits (--ulimit)');
    if (hc.GroupAdd?.length) reasons.push('supplementary groups (--group-add)');
    if (hc.ExtraHosts?.length) reasons.push('extra hosts (--add-host)');
    if (hc.Dns?.length) reasons.push('custom DNS servers (--dns)');
    if (hc.SecurityOpt?.length) reasons.push('security options (--security-opt)');
    if (hc.DeviceCgroupRules?.length) reasons.push('device cgroup rules');
    if (hc.DeviceRequests?.length) reasons.push('device requests such as GPUs (--gpus)');
    if (hc.Runtime && hc.Runtime !== 'runc') reasons.push(`a custom runtime (${hc.Runtime})`);

    const user = inspect.Config?.User;
    if (user && user !== '') reasons.push(`a custom user (--user ${user})`);

    const labels = inspect.Config?.Labels ?? {};
    if (Object.keys(labels).some(k => k.startsWith('com.docker.compose.'))) {
        reasons.push('Docker Compose management (compose labels)');
    }

    const networks = inspect.NetworkSettings?.Networks ?? {};
    const netNames = Object.keys(networks);
    if (netNames.length > 1) reasons.push('attachment to more than one network');
    for (const [netName, ep] of Object.entries(networks)) {
        if (BUILTIN_NETWORK_NAMES.has(netName)) continue;
        const ipam = ep?.IPAMConfig;
        if (ipam && (ipam.IPv4Address || ipam.IPv6Address)) reasons.push('a static IP address on a custom network');
        if (ep?.Aliases?.length) reasons.push('network aliases on a custom network');
    }

    // A host port change is meaningless under host networking: the listen port lives
    // in BirdNET-Go's config, not in a host port mapping.
    if (opts.hostPort != null && inspect.HostConfig?.NetworkMode === 'host') {
        reasons.push('host networking, where the listen port is set in BirdNET-Go config, not a host port mapping');
    }

    return reasons;
};

/** Build a short guided-manual message from the reasons a container is not reproducible. */
export const buildManualInstructions = (reasons: string[], opts: RecreateOptions): string => {
    const action = opts.hostPort != null ? `change the port to ${opts.hostPort}` : 'upgrade';
    return (
        `This container uses settings this tool cannot safely reproduce automatically: ${reasons.join('; ')}. ` +
        `To avoid losing them, ${action} by hand: stop and remove the container, then re-run "docker run" ` +
        `with all of its current flags plus your change.`
    );
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
