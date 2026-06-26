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

import cockpit from 'cockpit';

export interface ExecOptions {
    superuser?: 'try' | 'require';
}

/** Run a command on the host. Resolves stdout; rejects on non-zero exit. */
export const exec = (argv: string[], opts: ExecOptions = {}): Promise<string> =>
    cockpit.spawn(argv, { superuser: opts.superuser, err: 'message' }) as unknown as Promise<string>;

/** Run a command expected to possibly fail (status probes). Never rejects. */
export const probe = async (argv: string[], opts: ExecOptions = {}): Promise<{ ok: boolean; out: string }> => {
    try {
        const out = await exec(argv, opts);
        return { ok: true, out: out.trim() };
    } catch {
        return { ok: false, out: '' };
    }
};
