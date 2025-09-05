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

import React, { useEffect, useState } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Card, CardBody, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea/index.js";
import { Select, SelectOption, SelectList } from "@patternfly/react-core/dist/esm/components/Select/index.js";
import { MenuToggle } from "@patternfly/react-core/dist/esm/components/MenuToggle/index.js";
import { ToggleGroup, ToggleGroupItem } from "@patternfly/react-core/dist/esm/components/ToggleGroup/index.js";
import { SearchInput } from "@patternfly/react-core/dist/esm/components/SearchInput/index.js";

import cockpit from 'cockpit';

const _ = cockpit.gettext;

interface DockerStatus {
    available: boolean;
    running: boolean;
    version?: string;
}

interface ContainerStatus {
    exists: boolean;
    running: boolean;
    imagePresent: boolean;
    containerId?: string;
    status?: string;
}

interface SystemdStatus {
    exists: boolean;
    running: boolean;
    enabled: boolean;
    status?: string;
}

interface HealthStatus {
    status: string;
    version: string;
    build_date: string;
    environment: string;
    database_status: string;
    database_error?: string;
    uptime: string;
    uptime_seconds: number;
    timestamp: string;
}

interface StatusItem {
    label: string;
    value: string | React.ReactNode;
    icon?: string;
}

interface VersionInfo {
    current: string;
    buildDate: string;
    latest?: string;
    latestNightly?: string;
    nightlyTags?: string[];
    updateAvailable?: boolean;
    checkingUpdate?: boolean;
    updateError?: string;
    releaseNotes?: string;
    releaseUrl?: string;
}

export const Application = () => {
    const [hostname, setHostname] = useState(_("Unknown"));
    const [dockerStatus, setDockerStatus] = useState<DockerStatus>({ available: false, running: false });
    const [containerStatus, setContainerStatus] = useState<ContainerStatus>({ 
        exists: false, 
        running: false, 
        imagePresent: false 
    });
    const [loading, setLoading] = useState(true);
    const [containerLogs, setContainerLogs] = useState<string>("");
    const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
    const [systemdStatus, setSystemdStatus] = useState<SystemdStatus>({ 
        exists: false, 
        running: false, 
        enabled: false 
    });
    
    // BirdNET-Go application logs state
    const [appLogs, setAppLogs] = useState<any[]>([]);
    const [selectedLogFile, setSelectedLogFile] = useState<string>("analysis.log");
    const [logFiles, setLogFiles] = useState<string[]>([]);
    const [logSelectOpen, setLogSelectOpen] = useState(false);
    const [logLevelFilter, setLogLevelFilter] = useState<string>("all");
    const [logSearchText, setLogSearchText] = useState<string>("");
    
    // Version management state
    const [versionInfo, setVersionInfo] = useState<VersionInfo>({
        current: '',
        buildDate: '',
        updateAvailable: false,
        checkingUpdate: false
    });
    const [upgrading, setUpgrading] = useState(false);

    useEffect(() => {
        const hostname = cockpit.file('/etc/hostname');
        hostname.watch(content => setHostname(content?.trim() ?? ""));
        return hostname.close;
    }, []);

    const checkDockerStatus = async () => {
        try {
            // Check if Docker is available
            const dockerVersion = await cockpit.spawn(["docker", "--version"]);
            
            // Check if Docker service is running
            const dockerService = await cockpit.spawn(["systemctl", "is-active", "docker"]);
            
            setDockerStatus({
                available: true,
                running: dockerService.trim() === "active",
                version: dockerVersion.trim()
            });
        } catch (error) {
            setDockerStatus({ available: false, running: false });
        }
    };

    const checkSystemdStatus = async () => {
        try {
            // Check if systemd service exists - use list-unit-files which doesn't require privileges
            const serviceFiles = await cockpit.spawn(["systemctl", "list-unit-files", "--no-pager", "--plain", "birdnet-go.service"]);
            const serviceExists = serviceFiles.includes("birdnet-go.service");
            
            if (serviceExists) {
                // Get simple status - these commands work without sudo
                let isRunning = false;
                let isEnabled = false;
                let simpleStatus = "inactive";
                
                // Check if enabled
                try {
                    const enabledState = await cockpit.spawn(["systemctl", "is-enabled", "birdnet-go.service"]);
                    isEnabled = enabledState.trim() === "enabled";
                } catch (e) {
                    // is-enabled returns non-zero if not enabled
                }
                
                // Check if active
                try {
                    const activeState = await cockpit.spawn(["systemctl", "is-active", "birdnet-go.service"]);
                    simpleStatus = activeState.trim();
                    isRunning = simpleStatus === "active";
                } catch (e) {
                    // is-active returns non-zero if not active
                    simpleStatus = "inactive";
                }
                
                console.log("Systemd service found:", "Status:", simpleStatus, "Running:", isRunning, "Enabled:", isEnabled);
                
                setSystemdStatus({
                    exists: true,
                    running: isRunning,
                    enabled: isEnabled,
                    status: simpleStatus
                });
            } else {
                console.log("Systemd service not found");
                setSystemdStatus({
                    exists: false,
                    running: false,
                    enabled: false
                });
            }
        } catch (error) {
            console.error("Error checking systemd status:", error);
            setSystemdStatus({ exists: false, running: false, enabled: false });
        }
    };

    const checkBirdNetGoStatus = async () => {
        try {
            // Check if BirdNET-Go image exists
            const images = await cockpit.spawn(["docker", "images", "--format", "{{.Repository}}:{{.Tag}}"]);
            const imagePresent = images.includes("ghcr.io/tphakala/birdnet-go");

            // First, try to check if BirdNET-Go is running via health API
            let isActuallyRunning = false;
            try {
                const result = await cockpit.spawn([
                    "curl", 
                    "-s",  // Silent mode
                    "-m", "2",  // 2 second timeout
                    `http://${window.location.hostname}:8080/api/v2/health`
                ]);
                
                if (result) {
                    const healthData = JSON.parse(result);
                    isActuallyRunning = healthData.status === 'healthy' || healthData.status === 'degraded';
                    console.log("Health check API response - BirdNET-Go is running:", isActuallyRunning);
                } else {
                    console.log("Health check API returned empty response");
                    isActuallyRunning = false;
                }
            } catch (healthError) {
                console.log("Health check API failed - BirdNET-Go likely not running");
                isActuallyRunning = false;
            }

            // Check for BirdNET-Go containers - get all containers and filter manually
            const containers = await cockpit.spawn(["docker", "ps", "-a", "--format", "{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}"]);
            
            console.log("Docker containers output:", containers); // Debug logging
            
            if (containers.trim()) {
                const containerLines = containers.trim().split('\n');
                
                // Find BirdNET-Go container by image name or container name
                // Be specific to avoid matching VSCode dev containers
                const birdnetContainer = containerLines.find(line => {
                    const parts = line.split('|');
                    const image = parts[1];
                    const name = parts[3];
                    
                    // Exclude VSCode containers (they start with vsc-)
                    if (image.startsWith('vsc-')) {
                        return false;
                    }
                    
                    // Match official BirdNET-Go images or container name
                    return (image.startsWith('ghcr.io/tphakala/birdnet-go') || 
                            image === 'birdnet-go' ||
                            name === 'birdnet-go');
                });
                
                if (birdnetContainer) {
                    const parts = birdnetContainer.split('|');
                    const status = parts[2];
                    
                    console.log("Found BirdNET-Go container:", birdnetContainer); // Debug logging
                    console.log("Container status:", status, "Docker says running:", status.startsWith('Up')); // Debug logging
                    
                    // Use health API result as primary indicator, fallback to Docker status
                    setContainerStatus({
                        exists: true,
                        running: isActuallyRunning || status.startsWith('Up'),
                        imagePresent,
                        containerId: parts[0],
                        status: status
                    });
                } else if (isActuallyRunning) {
                    // BirdNET-Go is responding but we can't find a specific container
                    // This might happen if running outside Docker or with unexpected name
                    console.log("BirdNET-Go is running but container not found in Docker"); // Debug logging
                    setContainerStatus({
                        exists: true,
                        running: true,
                        imagePresent,
                        containerId: undefined,
                        status: "Running (non-Docker or custom container)"
                    });
                } else {
                    console.log("No BirdNET-Go container found"); // Debug logging
                    setContainerStatus({
                        exists: false,
                        running: false,
                        imagePresent,
                    });
                }
            } else {
                // No containers at all, but check if BirdNET-Go is running anyway
                if (isActuallyRunning) {
                    setContainerStatus({
                        exists: true,
                        running: true,
                        imagePresent,
                        containerId: undefined,
                        status: "Running (non-Docker)"
                    });
                } else {
                    setContainerStatus({
                        exists: false,
                        running: false,
                        imagePresent,
                    });
                }
            }
        } catch (error) {
            console.error("Error checking BirdNET-Go status:", error);
            setContainerStatus({ exists: false, running: false, imagePresent: false });
        }
    };

    const refreshStatus = async () => {
        setLoading(true);
        await checkDockerStatus();
        await checkSystemdStatus();
        await checkBirdNetGoStatus();
        await fetchHealthStatus();
        setLoading(false);
    };

    useEffect(() => {
        refreshStatus();
    }, []);

    // Fetch logs when container status changes
    useEffect(() => {
        fetchLogs();
    }, [containerStatus.containerId, containerStatus.running]);

    // Auto-refresh logs every 5 seconds if container is running
    useEffect(() => {
        if (containerStatus.running) {
            const interval = setInterval(() => {
                fetchLogs();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [containerStatus.running, containerStatus.containerId]);

    // Fetch log files when container is running
    useEffect(() => {
        if (containerStatus.running) {
            fetchLogFiles();
        }
    }, [containerStatus.running]);

    // Fetch health status when container is running
    useEffect(() => {
        if (containerStatus.running) {
            fetchHealthStatus();
        }
    }, [containerStatus.running]);

    // Auto-refresh health status every 10 seconds
    useEffect(() => {
        if (containerStatus.running) {
            const interval = setInterval(() => {
                fetchHealthStatus();
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [containerStatus.running]);

    // Fetch app logs when selected log file changes
    useEffect(() => {
        if (selectedLogFile && containerStatus.running) {
            fetchAppLogs();
        }
    }, [selectedLogFile, containerStatus.running]);

    // Auto-refresh app logs every 3 seconds if container is running
    useEffect(() => {
        if (containerStatus.running && selectedLogFile) {
            const interval = setInterval(() => {
                fetchAppLogs();
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [containerStatus.running, selectedLogFile]);

    // Check for updates when version info is available
    useEffect(() => {
        if (versionInfo.current && !versionInfo.latest && !versionInfo.checkingUpdate) {
            checkForUpdates();
        }
    }, [versionInfo.current]);

    const getDockerStatusVariant = () => {
        if (!dockerStatus.available) return "danger";
        if (!dockerStatus.running) return "warning";
        return "success";
    };

    const getContainerStatusVariant = () => {
        // Check systemd first
        if (systemdStatus.exists) {
            if (systemdStatus.running) return "success";
            return "warning";
        }
        
        // Then check Docker
        if (!containerStatus.imagePresent) return "warning";
        if (!containerStatus.exists) return "info";
        if (!containerStatus.running) return "warning";
        return "success";
    };

    const getDockerStatusText = () => {
        if (!dockerStatus.available) return _("Docker not available");
        if (!dockerStatus.running) return _("Docker service not running");
        return _("Docker service running");
    };

    const getContainerStatusText = () => {
        // Check systemd first
        if (systemdStatus.exists) {
            if (systemdStatus.running) return _("BirdNET-Go service running (systemd)");
            return _("BirdNET-Go service stopped (systemd)");
        }
        
        // Then check Docker
        if (!containerStatus.imagePresent) return _("BirdNET-Go Docker image not found");
        if (!containerStatus.exists) return _("No BirdNET-Go container found");
        if (!containerStatus.running) return _("BirdNET-Go container stopped");
        return _("BirdNET-Go container running");
    };

    const startContainer = async () => {
        if (!containerStatus.containerId) return;
        
        try {
            await cockpit.spawn(["docker", "start", containerStatus.containerId]);
            await refreshStatus();
        } catch (error) {
            console.error("Error starting container:", error);
        }
    };

    const stopContainer = async () => {
        if (!containerStatus.containerId) return;
        
        try {
            await cockpit.spawn(["docker", "stop", containerStatus.containerId]);
            await refreshStatus();
        } catch (error) {
            console.error("Error stopping container:", error);
        }
    };

    const restartContainer = async () => {
        if (!containerStatus.containerId) return;
        
        try {
            await cockpit.spawn(["docker", "restart", containerStatus.containerId]);
            await refreshStatus();
        } catch (error) {
            console.error("Error restarting container:", error);
        }
    };

    const createContainer = async () => {
        try {
            await cockpit.spawn([
                "docker", "run", "-d",
                "--name", "birdnet-go",
                "-p", "8080:8080",
                "-p", "8090:8090",
                "-v", "/home/thakala/birdnet-go-app/config:/config",
                "-v", "/home/thakala/birdnet-go-app/data:/data",
                "ghcr.io/tphakala/birdnet-go:nightly"
            ]);
            await refreshStatus();
        } catch (error) {
            console.error("Error creating container:", error);
        }
    };

    const pullImage = async () => {
        try {
            await cockpit.spawn(["docker", "pull", "ghcr.io/tphakala/birdnet-go:nightly"]);
            await refreshStatus();
        } catch (error) {
            console.error("Error pulling image:", error);
        }
    };

    // Systemd service controls
    const startSystemdService = async () => {
        try {
            await cockpit.spawn(["systemctl", "start", "birdnet-go.service"], { superuser: "try" });
            await refreshStatus();
        } catch (error) {
            console.error("Error starting systemd service:", error);
        }
    };

    const stopSystemdService = async () => {
        try {
            await cockpit.spawn(["systemctl", "stop", "birdnet-go.service"], { superuser: "try" });
            await refreshStatus();
        } catch (error) {
            console.error("Error stopping systemd service:", error);
        }
    };

    const restartSystemdService = async () => {
        try {
            await cockpit.spawn(["systemctl", "restart", "birdnet-go.service"], { superuser: "try" });
            await refreshStatus();
        } catch (error) {
            console.error("Error restarting systemd service:", error);
        }
    };

    const enableSystemdService = async () => {
        try {
            await cockpit.spawn(["systemctl", "enable", "birdnet-go.service"], { superuser: "try" });
            await refreshStatus();
        } catch (error) {
            console.error("Error enabling systemd service:", error);
        }
    };

    const fetchLogs = async () => {
        if (!containerStatus.exists || !containerStatus.containerId) {
            setContainerLogs("");
            return;
        }
        
        try {
            const logs = await cockpit.spawn(["docker", "logs", "--tail", "200", containerStatus.containerId]);
            setContainerLogs(logs);
        } catch (error) {
            console.error("Error fetching logs:", error);
            setContainerLogs("Error fetching logs");
        }
    };

    const fetchLogFiles = async () => {
        try {
            const result = await cockpit.spawn(["ls", "-1", "/home/thakala/birdnet-go-app/data/logs/"]);
            const files = result.trim().split('\n').filter(file => file.endsWith('.log'));
            setLogFiles(files);
            if (files.length > 0 && !files.includes(selectedLogFile)) {
                setSelectedLogFile(files[0]);
            }
        } catch (error) {
            console.error("Error fetching log files:", error);
            setLogFiles([]);
        }
    };

    const fetchHealthStatus = async () => {
        if (!containerStatus.running && !systemdStatus.running) {
            setHealthStatus(null);
            return;
        }
        
        try {
            // Use curl through cockpit.spawn to bypass CSP restrictions
            const result = await cockpit.spawn([
                "curl", 
                "-s",  // Silent mode
                "-m", "5",  // 5 second timeout
                `http://${window.location.hostname}:8080/api/v2/health`
            ]);
            
            if (result) {
                const data = JSON.parse(result);
                setHealthStatus(data);
                // Update version info
                setVersionInfo(prev => ({
                    ...prev,
                    current: data.version,
                    buildDate: data.build_date
                }));
            } else {
                console.error("Health check returned empty response");
                setHealthStatus(null);
            }
        } catch (error) {
            console.error("Error fetching health status:", error);
            setHealthStatus(null);
        }
    };

    const checkForUpdates = async () => {
        setVersionInfo(prev => ({ ...prev, checkingUpdate: true, updateError: undefined }));
        
        try {
            const currentVersion = versionInfo.current?.replace('v', '');
            const isNightly = currentVersion?.includes('nightly');
            
            if (isNightly) {
                // For nightly builds, fetch tags from GitHub Container Registry API
                // Extract date from version like "nightly-20250831-5-gc2d911f7"
                const versionMatch = currentVersion?.match(/nightly-(\d{8})/);
                const currentDate = versionMatch ? parseInt(versionMatch[1]) : 0;
                
                try {
                    // Fetch package versions from GitHub Container Registry
                    // Using the GitHub API to get container package versions
                    const packageResult = await cockpit.spawn([
                        "curl",
                        "-s",
                        "-m", "10",
                        "-H", "Accept: application/vnd.github+json",
                        "https://api.github.com/orgs/tphakala/packages/container/birdnet-go/versions?per_page=20"
                    ]);
                    
                    if (packageResult) {
                        const versions = JSON.parse(packageResult);
                        const nightlyTags: string[] = [];
                        let latestNightlyDate = 0;
                        let latestNightlyTag = '';
                        
                        // Extract nightly tags and find the most recent one
                        versions.forEach((version: any) => {
                            if (version.metadata?.container?.tags) {
                                version.metadata.container.tags.forEach((tag: string) => {
                                    if (tag.startsWith('nightly-') && tag.match(/nightly-\d{8}/)) {
                                        nightlyTags.push(tag);
                                        const dateMatch = tag.match(/nightly-(\d{8})/);
                                        if (dateMatch) {
                                            const date = parseInt(dateMatch[1]);
                                            if (date > latestNightlyDate) {
                                                latestNightlyDate = date;
                                                latestNightlyTag = tag;
                                            }
                                        }
                                    }
                                });
                            }
                        });
                        
                        // Sort nightly tags by date (newest first)
                        nightlyTags.sort((a, b) => {
                            const dateA = parseInt(a.match(/nightly-(\d{8})/)?.[1] || '0');
                            const dateB = parseInt(b.match(/nightly-(\d{8})/)?.[1] || '0');
                            return dateB - dateA;
                        });
                        
                        const updateAvailable = latestNightlyDate > currentDate;
                        
                        setVersionInfo(prev => ({
                            ...prev,
                            latestNightly: latestNightlyTag || 'nightly',
                            nightlyTags: nightlyTags.slice(0, 5), // Keep only 5 most recent
                            updateAvailable,
                            checkingUpdate: false,
                            releaseNotes: updateAvailable 
                                ? `Newer nightly build available: ${latestNightlyTag}`
                                : 'You are on the latest nightly build',
                            releaseUrl: 'https://github.com/tphakala/birdnet-go/pkgs/container/birdnet-go'
                        }));
                    }
                } catch (registryError) {
                    console.error("Error fetching registry data:", registryError);
                    // Fallback to simple nightly check
                    setVersionInfo(prev => ({
                        ...prev,
                        latest: 'nightly (development build)',
                        updateAvailable: false,
                        checkingUpdate: false,
                        releaseNotes: 'Nightly builds contain the latest development features and fixes',
                        releaseUrl: 'https://github.com/tphakala/birdnet-go/pkgs/container/birdnet-go'
                    }));
                }
            } else {
                // For stable versions, check against GitHub releases
                const result = await cockpit.spawn([
                    "curl",
                    "-s",
                    "-m", "10",
                    "https://api.github.com/repos/tphakala/birdnet-go/releases/latest"
                ]);
                
                if (result) {
                    const release = JSON.parse(result);
                    const latestStable = release.tag_name?.replace('v', '');
                    
                    // Compare semantic versions for stable releases
                    const parseVersion = (v: string) => {
                        const parts = v.split('.').map(p => parseInt(p) || 0);
                        return parts[0] * 10000 + parts[1] * 100 + parts[2];
                    };
                    
                    let updateAvailable = false;
                    if (latestStable && currentVersion) {
                        // Remove any suffix from current version for comparison
                        const cleanCurrent = currentVersion.split('-')[0];
                        try {
                            updateAvailable = parseVersion(latestStable) > parseVersion(cleanCurrent);
                        } catch {
                            updateAvailable = latestStable !== cleanCurrent;
                        }
                    }
                    
                    setVersionInfo(prev => ({
                        ...prev,
                        latest: latestStable,
                        updateAvailable,
                        checkingUpdate: false,
                        releaseNotes: release.body,
                        releaseUrl: release.html_url
                    }));
                }
            }
        } catch (error) {
            console.error("Error checking for updates:", error);
            setVersionInfo(prev => ({
                ...prev,
                checkingUpdate: false,
                updateError: "Failed to check for updates"
            }));
        }
    };

    const upgradeBirdNetGo = async () => {
        setUpgrading(true);
        
        try {
            // Check if Docker is available first
            if (!dockerStatus.available) {
                alert("Docker is not available. Please install Docker to upgrade BirdNET-Go.");
                return;
            }
            
            if (!dockerStatus.running) {
                alert("Docker service is not running. Please start Docker service first.");
                return;
            }
            
            // Determine which image tag to use
            const isNightly = versionInfo.current?.includes('nightly');
            let imageTag: string;
            
            if (isNightly) {
                // Use the latest nightly tag if available, otherwise default to 'nightly'
                imageTag = versionInfo.latestNightly || 'nightly';
            } else {
                imageTag = versionInfo.latest ? `v${versionInfo.latest}` : 'latest';
            }
            
            const imageName = `ghcr.io/tphakala/birdnet-go:${imageTag}`;
            
            // Pull the new image
            await cockpit.spawn(["docker", "pull", imageName]);
            
            if (systemdStatus.exists) {
                // For systemd service that runs Docker, just restart the service
                // The service will pull and run the latest image
                await cockpit.spawn(["systemctl", "restart", "birdnet-go.service"], { superuser: "try" });
            } else if (containerStatus.containerId) {
                // For standalone Docker container
                // Stop current container
                await cockpit.spawn(["docker", "stop", containerStatus.containerId]);
                
                // Get current container configuration
                const configJson = await cockpit.spawn(["docker", "inspect", containerStatus.containerId]);
                const config = JSON.parse(configJson)[0];
                
                // Remove old container
                await cockpit.spawn(["docker", "rm", containerStatus.containerId]);
                
                // Create new container with same configuration but new image
                const createArgs = [
                    "docker", "run", "-d",
                    "--name", config.Name.replace('/', ''),
                    "--restart", "unless-stopped"
                ];
                
                // Preserve port mappings
                if (config.HostConfig?.PortBindings) {
                    Object.entries(config.HostConfig.PortBindings).forEach(([containerPort, hostPorts]: [string, any]) => {
                        if (Array.isArray(hostPorts)) {
                            hostPorts.forEach((binding: any) => {
                                createArgs.push("-p", `${binding.HostPort}:${containerPort.split('/')[0]}`);
                            });
                        }
                    });
                }
                
                // Preserve volume mounts
                if (config.Mounts) {
                    config.Mounts.forEach((mount: any) => {
                        if (mount.Type === 'bind') {
                            createArgs.push("-v", `${mount.Source}:${mount.Destination}`);
                        }
                    });
                }
                
                // Preserve environment variables
                if (config.Config?.Env) {
                    config.Config.Env.forEach((env: string) => {
                        // Skip PATH and other default envs
                        if (!env.startsWith('PATH=') && !env.startsWith('HOME=')) {
                            createArgs.push("-e", env);
                        }
                    });
                }
                
                createArgs.push(imageName);
                
                // Create and start new container
                await cockpit.spawn(createArgs);
            }
            
            // Refresh status after upgrade
            await refreshStatus();
            await checkForUpdates();
            
        } catch (error) {
            console.error("Error upgrading BirdNET-Go:", error);
            alert("Failed to upgrade BirdNET-Go. Please check the logs.");
        } finally {
            setUpgrading(false);
        }
    };

    const fetchAppLogs = async () => {
        if (!selectedLogFile) return;
        
        try {
            const logPath = `/home/thakala/birdnet-go-app/data/logs/${selectedLogFile}`;
            const result = await cockpit.spawn(["tail", "-n", "500", logPath]);
            
            // Parse JSON logs
            const parsedLogs = result.trim().split('\n')
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(log => log !== null)
                .reverse(); // Show newest first
            
            setAppLogs(parsedLogs);
        } catch (error) {
            console.error("Error fetching app logs:", error);
            setAppLogs([]);
        }
    };

    const formatLogTime = (timestamp: string): string => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const getLogLevelColor = (level: string): string => {
        switch(level?.toUpperCase()) {
            case 'ERROR': return '#c9190b';
            case 'WARN': return '#f0ab00';
            case 'INFO': return '#0066cc';
            case 'DEBUG': return '#6a6e73';
            default: return '#151515';
        }
    };

    const filteredLogs = appLogs.filter(log => {
        // Filter by log level
        if (logLevelFilter !== 'all' && log.level?.toUpperCase() !== logLevelFilter.toUpperCase()) {
            return false;
        }
        
        // Filter by search text
        if (logSearchText && !JSON.stringify(log).toLowerCase().includes(logSearchText.toLowerCase())) {
            return false;
        }
        
        return true;
    });


    return (
        <Page>
            <PageSection>
                <Grid hasGutter>
            <GridItem span={12}>
                <Card>
                    <CardTitle>BirdNET-Go Management</CardTitle>
                    <CardBody>
                        <Alert
                            variant="info"
                            title={ cockpit.format(_("Running on $0"), hostname) }
                        />
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem span={12}>
                <Card>
                    <CardTitle>Actions</CardTitle>
                    <CardBody>
                        <Flex>
                            <FlexItem>
                                <Button 
                                    variant="secondary" 
                                    onClick={refreshStatus}
                                    isLoading={loading}
                                >
                                    Refresh Status
                                </Button>
                            </FlexItem>
                            
                            {/* Systemd controls */}
                            {systemdStatus.exists && (
                                <FlexItem>
                                    {!systemdStatus.running && (
                                        <Button 
                                            variant="primary" 
                                            onClick={startSystemdService}
                                        >
                                            Start Service
                                        </Button>
                                    )}
                                    {systemdStatus.running && (
                                        <Button 
                                            variant="secondary" 
                                            onClick={stopSystemdService}
                                        >
                                            Stop Service
                                        </Button>
                                    )}
                                    <Button 
                                        variant="secondary" 
                                        onClick={restartSystemdService}
                                        style={{ marginLeft: '0.5rem' }}
                                    >
                                        Restart Service
                                    </Button>
                                    {!systemdStatus.enabled && (
                                        <Button 
                                            variant="secondary" 
                                            onClick={enableSystemdService}
                                            style={{ marginLeft: '0.5rem' }}
                                        >
                                            Enable at Boot
                                        </Button>
                                    )}
                                </FlexItem>
                            )}
                            
                            {/* Docker controls - only show if no systemd */}
                            {!systemdStatus.exists && (
                                <>
                                    <FlexItem>
                                        {containerStatus.exists && !containerStatus.running && (
                                            <Button 
                                                variant="primary" 
                                                onClick={startContainer}
                                                isDisabled={!dockerStatus.running}
                                            >
                                                Start Container
                                            </Button>
                                        )}
                                        {containerStatus.exists && containerStatus.running && (
                                            <Button 
                                                variant="secondary" 
                                                onClick={stopContainer}
                                            >
                                                Stop Container
                                            </Button>
                                        )}
                                        {containerStatus.exists && (
                                            <Button 
                                                variant="secondary" 
                                                onClick={restartContainer}
                                                isDisabled={!dockerStatus.running}
                                                style={{ marginLeft: '0.5rem' }}
                                            >
                                                Restart Container
                                            </Button>
                                        )}
                                    </FlexItem>
                                    <FlexItem>
                                        {!containerStatus.exists && containerStatus.imagePresent && (
                                            <Button 
                                                variant="primary" 
                                                onClick={createContainer}
                                                isDisabled={!dockerStatus.running}
                                            >
                                                Create Container
                                            </Button>
                                        )}
                                        {!containerStatus.imagePresent && dockerStatus.available && (
                                            <Button 
                                                variant="primary" 
                                                onClick={pullImage}
                                                isDisabled={!dockerStatus.running}
                                            >
                                                Pull BirdNET-Go Image
                                            </Button>
                                        )}
                                    </FlexItem>
                                </>
                            )}
                            
                            {/* Common controls */}
                            {(containerStatus.running || systemdStatus.running) && (
                                <FlexItem>
                                    <Button 
                                        variant="secondary" 
                                        onClick={() => window.open('http://' + window.location.hostname + ':8080', '_blank')}
                                    >
                                        Open Web Interface
                                    </Button>
                                </FlexItem>
                            )}
                        </Flex>
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem sm={12} md={6} lg={4}>
                <Card>
                    <CardTitle>Docker Status</CardTitle>
                    <CardBody>
                        <Alert
                            variant={getDockerStatusVariant()}
                            title={getDockerStatusText()}
                        />
                        {dockerStatus.version && (
                            <p><strong>Version:</strong> {dockerStatus.version}</p>
                        )}
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem sm={12} md={6} lg={4}>
                <Card>
                    <CardTitle>BirdNET-Go Status</CardTitle>
                    <CardBody>
                        <Alert
                            variant={getContainerStatusVariant()}
                            title={getContainerStatusText()}
                        />
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr',
                            gap: '0.5rem 2rem',
                            marginTop: '1rem'
                        }}>
                            {/* Left Column */}
                            <div>
                                {systemdStatus.exists && (
                                    <>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Type:</strong> Systemd Service</p>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Service:</strong> birdnet-go.service</p>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Status:</strong> {systemdStatus.status}</p>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Boot:</strong> {systemdStatus.enabled ? 'Enabled' : 'Disabled'}</p>
                                    </>
                                )}
                                {!systemdStatus.exists && containerStatus.status && (
                                    <p style={{ marginBottom: '0.5rem' }}><strong>Status:</strong> {containerStatus.status}</p>
                                )}
                                {!systemdStatus.exists && containerStatus.containerId && (
                                    <p style={{ marginBottom: '0.5rem' }}><strong>Container ID:</strong> {containerStatus.containerId.substring(0, 12)}</p>
                                )}
                                {(containerStatus.running || systemdStatus.running) && (
                                    <p style={{ marginBottom: '0.5rem' }}><strong>Web Interface:</strong> <a href={`http://${window.location.hostname}:8080`} target="_blank" rel="noopener noreferrer">http://{window.location.hostname}:8080</a></p>
                                )}
                            </div>
                            
                            {/* Right Column */}
                            <div>
                                {healthStatus && (
                                    <>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Health:</strong> <span style={{ 
                                            color: healthStatus.status === 'healthy' ? '#3e8635' : healthStatus.status === 'degraded' ? '#f0ab00' : '#c9190b',
                                            fontWeight: 'bold'
                                        }}>{healthStatus.status?.toUpperCase()}</span></p>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Uptime:</strong> {(() => {
                                            const uptime = healthStatus.uptime;
                                            const regex = /(\d+)h|(\d+)m|(\d+(?:\.\d+)?)s/g;
                                            const matches = [...uptime.matchAll(regex)];
                                            
                                            let hours = 0, minutes = 0, seconds = 0;
                                            
                                            matches.forEach(match => {
                                                if (match[0].includes('h')) hours = parseInt(match[1]);
                                                else if (match[0].includes('m')) minutes = parseInt(match[2]);
                                                else if (match[0].includes('s')) seconds = Math.floor(parseFloat(match[3]));
                                            });
                                            
                                            const parts = [];
                                            if (hours > 0) parts.push(`${hours}h`);
                                            if (minutes > 0) parts.push(`${minutes}m`);
                                            if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
                                            
                                            return parts.join(' ');
                                        })()}</p>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Database:</strong> <span style={{ 
                                            color: healthStatus.database_status === 'connected' ? '#3e8635' : '#c9190b',
                                            fontWeight: 'bold'
                                        }}>{healthStatus.database_status}</span>
                                        {healthStatus.database_error && (
                                            <span style={{ color: '#c9190b', fontSize: '0.875rem', marginLeft: '0.5rem' }}>
                                                ({healthStatus.database_error})
                                            </span>
                                        )}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem sm={12} md={6} lg={4}>
                <Card>
                    <CardTitle>Version Management</CardTitle>
                    <CardBody>
                        {versionInfo.current && (
                            <>
                                <p><strong>Current Version:</strong> {versionInfo.current}</p>
                                <p><strong>Build Date:</strong> {versionInfo.buildDate ? new Date(versionInfo.buildDate).toLocaleDateString() : 'Unknown'}</p>
                                
                                {versionInfo.checkingUpdate && (
                                    <p style={{ color: '#6a6e73', fontStyle: 'italic' }}>Checking for updates...</p>
                                )}
                                
                                {versionInfo.latest && !versionInfo.checkingUpdate && (
                                    <>
                                        {versionInfo.current?.includes('nightly') ? (
                                            <>
                                                {versionInfo.latestNightly && (
                                                    <p><strong>Latest Nightly:</strong> {versionInfo.latestNightly}</p>
                                                )}
                                                {versionInfo.updateAvailable ? (
                                                    <Alert
                                                        variant="info"
                                                        title="Newer nightly build available"
                                                        actionLinks={
                                                            <Button
                                                                variant="link"
                                                                isInline
                                                                onClick={() => window.open(versionInfo.releaseUrl, '_blank')}
                                                            >
                                                                View Container Registry
                                                            </Button>
                                                        }
                                                    />
                                                ) : (
                                                    <Alert
                                                        variant="success"
                                                        title="Running latest nightly build"
                                                        isInline
                                                        isPlain
                                                    />
                                                )}
                                                {versionInfo.nightlyTags && versionInfo.nightlyTags.length > 0 && (
                                                    <div style={{ marginTop: '0.5rem' }}>
                                                        <p style={{ fontSize: '0.875rem', color: '#6a6e73', marginBottom: '0.25rem' }}>
                                                            Recent nightly builds:
                                                        </p>
                                                        <ul style={{ fontSize: '0.875rem', marginLeft: '1rem', marginTop: '0' }}>
                                                            {versionInfo.nightlyTags.slice(0, 3).map(tag => (
                                                                <li key={tag} style={{ color: '#6a6e73' }}>
                                                                    <code>{tag}</code>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <p><strong>Latest Stable:</strong> {versionInfo.latest}</p>
                                                {versionInfo.updateAvailable && (
                                                    <Alert
                                                        variant="info"
                                                        title="Update available"
                                                        actionLinks={
                                                            <>
                                                                {versionInfo.releaseUrl && (
                                                                    <Button
                                                                        variant="link"
                                                                        isInline
                                                                        onClick={() => window.open(versionInfo.releaseUrl, '_blank')}
                                                                    >
                                                                        View Release Notes
                                                                    </Button>
                                                                )}
                                                            </>
                                                        }
                                                    />
                                                )}
                                                {!versionInfo.updateAvailable && (
                                                    <Alert
                                                        variant="success"
                                                        title="You are running the latest stable version"
                                                        isInline
                                                        isPlain
                                                    />
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                                
                                {versionInfo.updateError && (
                                    <Alert
                                        variant="warning"
                                        title={versionInfo.updateError}
                                        isInline
                                        isPlain
                                    />
                                )}
                                
                                <Flex style={{ marginTop: '1rem', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Button
                                        variant="secondary"
                                        onClick={checkForUpdates}
                                        isDisabled={versionInfo.checkingUpdate || upgrading}
                                    >
                                        Check for Updates
                                    </Button>
                                    {versionInfo.current?.includes('nightly') && versionInfo.updateAvailable && (
                                        <Button
                                            variant="primary"
                                            onClick={upgradeBirdNetGo}
                                            isDisabled={upgrading || !dockerStatus.running}
                                            isLoading={upgrading}
                                        >
                                            {upgrading ? 'Pulling Latest Nightly...' : 'Upgrade to Latest Nightly'}
                                        </Button>
                                    )}
                                    {versionInfo.updateAvailable && !versionInfo.current?.includes('nightly') && (
                                        <Button
                                            variant="primary"
                                            onClick={upgradeBirdNetGo}
                                            isDisabled={upgrading || !dockerStatus.running}
                                            isLoading={upgrading}
                                        >
                                            {upgrading ? 'Upgrading...' : 'Upgrade to Latest Stable'}
                                        </Button>
                                    )}
                                </Flex>
                                <p style={{ marginTop: '1rem' }}>
                                    <a href="https://github.com/tphakala/birdnet-go/releases" target="_blank" rel="noopener noreferrer">
                                        View all releases on GitHub
                                    </a>
                                    {' | '}
                                    <a href="https://github.com/tphakala/birdnet-go/pkgs/container/birdnet-go" target="_blank" rel="noopener noreferrer">
                                        View container registry
                                    </a>
                                </p>
                            </>
                        )}
                        {!versionInfo.current && (
                            <Alert
                                variant="info"
                                title="Version information will be available when BirdNET-Go is running"
                                isInline
                                isPlain
                            />
                        )}
                    </CardBody>
                </Card>
            </GridItem>

            {containerStatus.exists && (
                <GridItem span={12}>
                    <Card>
                        <CardTitle>Docker Container Logs</CardTitle>
                        <CardBody>
                            {containerLogs ? (
                                <pre style={{ 
                                    backgroundColor: '#f4f4f4', 
                                    padding: '1rem', 
                                    borderRadius: '4px',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    fontFamily: 'monospace',
                                    fontSize: '0.875rem',
                                    lineHeight: '1.5'
                                }}>
                                    {containerLogs}
                                </pre>
                            ) : (
                                <Alert 
                                    variant="info" 
                                    title="No logs available" 
                                />
                            )}
                            <Flex style={{ marginTop: '1rem' }}>
                                <FlexItem>
                                    <Button 
                                        variant="secondary" 
                                        onClick={fetchLogs}
                                        size="sm"
                                    >
                                        Refresh Logs
                                    </Button>
                                </FlexItem>
                                <FlexItem>
                                    <small style={{ color: '#6a6e73', lineHeight: '2.5' }}>
                                        {containerStatus.running ? 'Auto-refreshing every 5 seconds' : 'Container not running'}
                                    </small>
                                </FlexItem>
                            </Flex>
                        </CardBody>
                    </Card>
                </GridItem>
            )}

            {containerStatus.running && logFiles.length > 0 && (
                <GridItem span={12}>
                    <Card>
                        <CardTitle>BirdNET-Go Application Logs</CardTitle>
                        <CardBody>
                            <Flex style={{ marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                                <FlexItem>
                                    <Select
                                        isOpen={logSelectOpen}
                                        onToggle={() => setLogSelectOpen(!logSelectOpen)}
                                        onSelect={(_, value) => {
                                            setSelectedLogFile(value as string);
                                            setLogSelectOpen(false);
                                        }}
                                        toggle={(toggleRef) => (
                                            <MenuToggle 
                                                ref={toggleRef} 
                                                onClick={() => setLogSelectOpen(!logSelectOpen)}
                                                isExpanded={logSelectOpen}
                                                style={{ minWidth: '200px' }}
                                            >
                                                {selectedLogFile || 'Select log file'}
                                            </MenuToggle>
                                        )}
                                    >
                                        <SelectList>
                                            {logFiles.map(file => (
                                                <SelectOption key={file} value={file}>
                                                    {file}
                                                </SelectOption>
                                            ))}
                                        </SelectList>
                                    </Select>
                                </FlexItem>
                                
                                <FlexItem>
                                    <ToggleGroup aria-label="Log level filter">
                                        <ToggleGroupItem 
                                            text="All" 
                                            buttonId="all"
                                            isSelected={logLevelFilter === 'all'}
                                            onChange={() => setLogLevelFilter('all')}
                                        />
                                        <ToggleGroupItem 
                                            text="Error" 
                                            buttonId="error"
                                            isSelected={logLevelFilter === 'ERROR'}
                                            onChange={() => setLogLevelFilter('ERROR')}
                                        />
                                        <ToggleGroupItem 
                                            text="Warn" 
                                            buttonId="warn"
                                            isSelected={logLevelFilter === 'WARN'}
                                            onChange={() => setLogLevelFilter('WARN')}
                                        />
                                        <ToggleGroupItem 
                                            text="Info" 
                                            buttonId="info"
                                            isSelected={logLevelFilter === 'INFO'}
                                            onChange={() => setLogLevelFilter('INFO')}
                                        />
                                        <ToggleGroupItem 
                                            text="Debug" 
                                            buttonId="debug"
                                            isSelected={logLevelFilter === 'DEBUG'}
                                            onChange={() => setLogLevelFilter('DEBUG')}
                                        />
                                    </ToggleGroup>
                                </FlexItem>
                                
                                <FlexItem flex={{ default: 'flex_1' }}>
                                    <SearchInput 
                                        placeholder="Search logs..."
                                        value={logSearchText}
                                        onChange={(_, value) => setLogSearchText(value)}
                                        onClear={() => setLogSearchText('')}
                                    />
                                </FlexItem>
                                
                                <FlexItem>
                                    <Button 
                                        variant="secondary" 
                                        onClick={fetchAppLogs}
                                        size="sm"
                                    >
                                        Refresh
                                    </Button>
                                </FlexItem>
                            </Flex>
                            
                            <div style={{ 
                                backgroundColor: '#1e1e1e', 
                                padding: '1rem', 
                                borderRadius: '4px',
                                maxHeight: '500px',
                                overflowY: 'auto',
                                fontFamily: 'monospace',
                                fontSize: '0.875rem',
                                lineHeight: '1.6'
                            }}>
                                {filteredLogs.length > 0 ? (
                                    filteredLogs.map((log, index) => (
                                        <div key={index} style={{ 
                                            borderBottom: '1px solid #3c3c3c',
                                            paddingBottom: '0.5rem',
                                            marginBottom: '0.5rem',
                                            color: '#e0e0e0'
                                        }}>
                                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.25rem' }}>
                                                <span style={{ color: '#9ca3af' }}>{formatLogTime(log.time)}</span>
                                                <span style={{ 
                                                    color: getLogLevelColor(log.level),
                                                    fontWeight: 'bold',
                                                    minWidth: '50px'
                                                }}>
                                                    {log.level}
                                                </span>
                                                {log.service && (
                                                    <span style={{ color: '#60a5fa' }}>[{log.service}]</span>
                                                )}
                                            </div>
                                            <div style={{ color: '#f3f4f6', marginLeft: '1rem' }}>
                                                {log.msg}
                                            </div>
                                            {Object.entries(log).filter(([key]) => 
                                                !['time', 'level', 'msg', 'service'].includes(key)
                                            ).length > 0 && (
                                                <div style={{ 
                                                    marginTop: '0.25rem', 
                                                    marginLeft: '2rem',
                                                    fontSize: '0.8rem',
                                                    color: '#9ca3af'
                                                }}>
                                                    {Object.entries(log)
                                                        .filter(([key]) => !['time', 'level', 'msg', 'service'].includes(key))
                                                        .map(([key, value]) => (
                                                            <span key={key} style={{ marginRight: '1rem' }}>
                                                                <span style={{ color: '#60a5fa' }}>{key}:</span> {JSON.stringify(value)}
                                                            </span>
                                                        ))
                                                    }
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
                                        {logSearchText || logLevelFilter !== 'all' 
                                            ? 'No logs match the current filters'
                                            : 'No logs available'}
                                    </div>
                                )}
                            </div>
                            
                            <Flex style={{ marginTop: '0.5rem' }}>
                                <FlexItem>
                                    <small style={{ color: '#6a6e73' }}>
                                        Showing {filteredLogs.length} of {appLogs.length} log entries • Auto-refreshing every 3 seconds
                                    </small>
                                </FlexItem>
                            </Flex>
                        </CardBody>
                    </Card>
                </GridItem>
            )}
                </Grid>
            </PageSection>
        </Page>
    );
};
