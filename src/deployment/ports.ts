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

import { probe } from './exec';

export const validatePort = (p: number): boolean => Number.isInteger(p) && p >= 1 && p <= 65535;

export const isPrivilegedPort = (p: number): boolean => p < 1024;

/** Parse `ss -H -ltn` output to the set of locally listening ports. */
export const parseListeningPorts = (ssOutput: string): Set<number> => {
    const ports = new Set<number>();
    for (const line of ssOutput.split('\n')) {
        for (const token of line.trim().split(/\s+/)) {
            const colon = token.lastIndexOf(':');
            if (colon === -1) continue;
            const portStr = token.slice(colon + 1);
            // Skip the peer column (ends in ':*') and any non-address token.
            if (!/^\d+$/.test(portStr)) continue;
            ports.add(parseInt(portStr, 10));
        }
    }
    return ports;
};

export const checkPortAvailable = async (port: number): Promise<{ free: boolean }> => {
    const res = await probe(['ss', '-H', '-ltn']);
    if (!res.ok) return { free: true }; // cannot determine; do not block
    return { free: !parseListeningPorts(res.out).has(port) };
};
