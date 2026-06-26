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

import { BIRDNET_PORT, SERVICE_NAME } from '../config';
import type { Deployment, DetectionSignals } from './types';

export const classifyDeployment = (s: DetectionSignals): Deployment => {
    const container = s.container;
    const systemdExists = s.systemd?.exists ?? false;
    const hasContainer = !!container;

    let kind: Deployment['kind'];
    if (systemdExists && hasContainer) kind = 'docker-systemd';
    else if (systemdExists) kind = 'native-systemd';
    else if (hasContainer && container!.isCompose) kind = 'docker-compose';
    else if (hasContainer) kind = 'docker-standalone';
    else if (s.healthRunning) kind = 'native';
    else kind = 'none';

    const running = (container?.running ?? false) || (s.systemd?.running ?? false) || s.healthRunning;
    const hostPort = container?.hostPort ?? BIRDNET_PORT;
    const internalPort = hasContainer ? BIRDNET_PORT : hostPort;

    const result: Deployment = {
        kind,
        runtime: s.runtime,
        running,
        imagePresent: s.imagePresent,
        hostPort,
        internalPort,
        dockerAvailable: s.docker?.available ?? false,
        dockerRunning: s.docker?.running ?? false,
    };

    if (container?.id !== undefined) result.containerId = container.id;
    if (systemdExists) result.serviceName = SERVICE_NAME;
    if (container?.composeProject !== undefined) result.composeProject = container.composeProject;
    if (container?.composeService !== undefined) result.composeService = container.composeService;
    if (container?.composeWorkingDir !== undefined) result.composeWorkingDir = container.composeWorkingDir;
    if (s.docker?.version !== undefined) result.dockerVersion = s.docker.version;
    if (container?.status !== undefined) result.statusText = container.status;
    if (s.systemd?.enabled !== undefined) result.systemdEnabled = s.systemd.enabled;

    return result;
};
