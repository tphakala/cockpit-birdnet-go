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

import type { ContainerRuntime } from './types';

/**
 * Map a detected container runtime to the CLI binary used to drive it.
 * A null runtime (none detected) falls back to 'docker' to preserve prior behavior.
 */
export const runtimeBin = (runtime: ContainerRuntime): 'docker' | 'podman' =>
    runtime === 'podman' ? 'podman' : 'docker';

/**
 * Return a human-readable display label for the container runtime.
 * Defaults to 'Docker' when no runtime is detected (null).
 */
export const runtimeLabel = (runtime: ContainerRuntime): 'Docker' | 'Podman' =>
    runtime === 'podman' ? 'Podman' : 'Docker';

/**
 * Return a human-readable display label for the compose deployment.
 * Defaults to 'Docker Compose' when no runtime is detected (null).
 */
export const runtimeComposeLabel = (runtime: ContainerRuntime): string =>
    runtime === 'podman' ? 'Podman Compose' : 'Docker Compose';

/**
 * Return the recommended compose command invocation for the runtime.
 * Defaults to 'docker-compose' when no runtime is detected (null).
 */
export const runtimeComposeCommand = (runtime: ContainerRuntime): string =>
    runtime === 'podman' ? 'podman compose' : 'docker-compose';
