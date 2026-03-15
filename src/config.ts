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

// ── Container & Service Defaults ────────────────────────────────────────────

/** Default BirdNET-Go API port */
export const BIRDNET_PORT = 8080;

/** Default BirdNET-Go metrics port */
export const BIRDNET_METRICS_PORT = 8090;

/** Default container name */
export const CONTAINER_NAME = 'birdnet-go';

/** Docker image (without tag) */
export const DOCKER_IMAGE = 'ghcr.io/tphakala/birdnet-go';

/** Default image tag used when creating a new container or pulling */
export const DEFAULT_IMAGE_TAG = 'nightly';

/** Systemd service unit name */
export const SERVICE_NAME = 'birdnet-go.service';

// ── Host Paths ──────────────────────────────────────────────────────────────

/** Default base directory for BirdNET-Go data on the host */
export const DEFAULT_BASE_DIR = '/home/thakala/birdnet-go-app';

/** Default log directory (derived from base dir) */
export const DEFAULT_LOG_DIR = `${DEFAULT_BASE_DIR}/data/logs`;

/** Default config mount source */
export const DEFAULT_CONFIG_DIR = `${DEFAULT_BASE_DIR}/config`;

/** Default data mount source */
export const DEFAULT_DATA_DIR = `${DEFAULT_BASE_DIR}/data`;

// ── GitHub / Registry URLs ──────────────────────────────────────────────────

const GITHUB_OWNER = 'tphakala';
const GITHUB_REPO = 'birdnet-go';

/** GitHub API URL for the latest stable release */
export const GITHUB_RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/** GitHub API URL for container package versions (nightly check) */
export const GITHUB_PACKAGES_URL = `https://api.github.com/orgs/${GITHUB_OWNER}/packages/container/${GITHUB_REPO}/versions?per_page=20`;

/** Human-readable releases page */
export const GITHUB_RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

/** Human-readable container registry page */
export const GITHUB_REGISTRY_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/pkgs/container/${GITHUB_REPO}`;

// ── Derived Helpers ─────────────────────────────────────────────────────────

/** Build the full image reference including a tag */
export const getImageRef = (tag: string = DEFAULT_IMAGE_TAG): string => `${DOCKER_IMAGE}:${tag}`;

/** Build the BirdNET-Go health API URL for a given hostname and port */
export const getHealthUrl = (hostname: string, port: number = BIRDNET_PORT): string =>
    `http://${hostname}:${port}/api/v2/health`;

/** Build the BirdNET-Go web interface base URL */
export const getWebInterfaceUrl = (hostname: string, port: number = BIRDNET_PORT): string =>
    `http://${hostname}:${port}`;

/** Build the log directory path. When a container ID is provided, attempts
 *  to detect the path from the container's mount configuration. Falls back
 *  to DEFAULT_LOG_DIR. The actual detection is async and handled separately
 *  so this function only returns the static default. */
export const getLogDir = (): string => DEFAULT_LOG_DIR;

/**
 * Detect the log directory from a running container's mounts.
 * Looks for a bind-mount whose destination is `/data` and appends `/logs`.
 * Returns `null` when the path cannot be determined so the caller can
 * fall back to `DEFAULT_LOG_DIR`.
 */
export const detectLogDirFromInspect = (inspectJson: string): string | null => {
    try {
        const config = JSON.parse(inspectJson);
        const container = Array.isArray(config) ? config[0] : config;
        const mounts: { Type: string; Source: string; Destination: string }[] = container?.Mounts ?? [];
        const dataMount = mounts.find(m => m.Type === 'bind' && m.Destination === '/data');
        if (dataMount) {
            return `${dataMount.Source}/logs`;
        }
    } catch {
        // Inspect output was not valid JSON – fall through
    }
    return null;
};

/**
 * Detect volume mount paths from a running container's inspect output.
 * Returns an object with `configDir` and `dataDir` when they can be
 * determined, or `null` values otherwise.
 */
export const detectVolumesFromInspect = (inspectJson: string): { configDir: string | null; dataDir: string | null } => {
    const result = { configDir: null as string | null, dataDir: null as string | null };
    try {
        const config = JSON.parse(inspectJson);
        const container = Array.isArray(config) ? config[0] : config;
        const mounts: { Type: string; Source: string; Destination: string }[] = container?.Mounts ?? [];
        for (const m of mounts) {
            if (m.Type === 'bind' && m.Destination === '/config') {
                result.configDir = m.Source;
            }
            if (m.Type === 'bind' && m.Destination === '/data') {
                result.dataDir = m.Source;
            }
        }
    } catch {
        // Inspect output was not valid JSON – fall through
    }
    return result;
};
