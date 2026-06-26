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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Card, CardBody, CardTitle } from '@patternfly/react-core/dist/esm/components/Card/index.js';
import { Grid, GridItem } from '@patternfly/react-core/dist/esm/layouts/Grid/index.js';
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { Flex, FlexItem } from '@patternfly/react-core/dist/esm/layouts/Flex/index.js';
import { Page, PageSection } from '@patternfly/react-core/dist/esm/components/Page/index.js';
import { Select, SelectOption, SelectList } from '@patternfly/react-core/dist/esm/components/Select/index.js';
import { MenuToggle } from '@patternfly/react-core/dist/esm/components/MenuToggle/index.js';
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup/index.js';
import { SearchInput } from '@patternfly/react-core/dist/esm/components/SearchInput/index.js';

import cockpit from 'cockpit';

import {
    BIRDNET_METRICS_PORT,
    BIRDNET_PORT,
    CONTAINER_NAME,
    DEFAULT_CONFIG_DIR,
    DEFAULT_DATA_DIR,
    DEFAULT_LOG_DIR,
    getHealthUrl,
    getImageRef,
    getWebInterfaceUrl,
    GITHUB_PACKAGES_URL,
    GITHUB_REGISTRY_PAGE_URL,
    GITHUB_RELEASES_LATEST_URL,
    GITHUB_RELEASES_PAGE_URL,
    SERVICE_NAME,
} from './config';
import type { ContainerStatus, DockerStatus, HealthStatus, LogEntry, SystemdStatus, VersionInfo } from './types';
import { detectDeployment } from './deployment/detect';
import { getDriver } from './deployment/driver';
import { recreateContainer } from './deployment/recreate';
import { runtimeBin } from './deployment/runtime';
import type { Deployment } from './deployment/types';
import { PortCard } from './components/PortCard';
import {
    capitalize,
    filterLogs,
    formatLogTime,
    formatUptime,
    getContainerStatusVariant,
    getDockerStatusVariant,
    getLogLevelColor,
    isBinaryInstallation,
    isValidLogFile,
    safeJsonParse,
    supportsAutomaticUpgrade,
} from './utils';

const _ = cockpit.gettext;

export const Application = () => {
    const [deployment, setDeployment] = useState<Deployment>({
        kind: 'none',
        runtime: null,
        running: false,
        imagePresent: false,
        dockerAvailable: false,
        dockerRunning: false,
        hostPort: 8080,
        internalPort: 8080,
    });
    const [loading, setLoading] = useState(true);
    const [containerLogs, setContainerLogs] = useState<string>('');
    const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

    // BirdNET-Go application logs state
    const [appLogs, setAppLogs] = useState<LogEntry[]>([]);
    const [selectedLogFile, setSelectedLogFile] = useState<string>('analysis.log');
    const [logFiles, setLogFiles] = useState<string[]>([]);
    const [logSelectOpen, setLogSelectOpen] = useState(false);
    const [logLevelFilter, setLogLevelFilter] = useState<string>('all');
    const [logSearchText, setLogSearchText] = useState<string>('');

    // Version management state
    const [versionInfo, setVersionInfo] = useState<VersionInfo>({
        current: '',
        buildDate: '',
        updateAvailable: false,
        checkingUpdate: false,
    });
    const [upgrading, setUpgrading] = useState(false);
    const [restarting, setRestarting] = useState(false);

    // Use ref to avoid infinite re-renders while accessing current versionInfo
    const versionInfoRef = useRef(versionInfo);
    useEffect(() => {
        versionInfoRef.current = versionInfo;
    }, [versionInfo]);

    const driver = getDriver(deployment);
    const isSystemdKind = deployment.kind.endsWith('-systemd');
    const dockerStatus: DockerStatus = {
        available: deployment.dockerAvailable,
        running: deployment.dockerRunning,
        ...(deployment.dockerVersion !== undefined && { version: deployment.dockerVersion }),
    };
    const containerStatus: ContainerStatus = {
        exists: deployment.kind.startsWith('docker'),
        running: deployment.running,
        imagePresent: deployment.imagePresent,
        isCompose: deployment.kind === 'docker-compose',
        ...(deployment.containerId !== undefined && { containerId: deployment.containerId }),
        ...(deployment.statusText !== undefined && { status: deployment.statusText }),
        ...(deployment.composeProject !== undefined && { composeProject: deployment.composeProject }),
        ...(deployment.composeService !== undefined && { composeService: deployment.composeService }),
        ...(deployment.composeWorkingDir !== undefined && { composeWorkingDir: deployment.composeWorkingDir }),
    };
    const systemdStatus: SystemdStatus = {
        exists: isSystemdKind,
        running: isSystemdKind && deployment.running,
        enabled: deployment.systemdEnabled ?? false,
        ...(deployment.systemdStatusText !== undefined && { status: deployment.systemdStatusText }),
    };

    const fetchLogs = useCallback(async () => {
        if (!containerStatus.exists || !containerStatus.containerId) {
            setContainerLogs('');
            return;
        }

        try {
            const logs = await cockpit.spawn([
                runtimeBin(deployment.runtime),
                'logs',
                '--tail',
                '200',
                containerStatus.containerId,
            ]);
            setContainerLogs(logs);
        } catch (error) {
            console.error('Error fetching logs:', error);
            setContainerLogs('Error fetching logs');
        }
    }, [containerStatus.exists, containerStatus.containerId, deployment.runtime]);

    const fetchLogFiles = useCallback(async () => {
        try {
            const result = await cockpit.spawn(['ls', '-1', DEFAULT_LOG_DIR]);
            const files = result
                .trim()
                .split('\n')
                .filter(file => file.endsWith('.log'));
            setLogFiles(files);
            if (files.length > 0 && !files.includes(selectedLogFile)) {
                setSelectedLogFile(files[0]);
            }
        } catch (error) {
            console.error('Error fetching log files:', error);
            setLogFiles([]);
        }
    }, [selectedLogFile]);

    const fetchHealthStatus = useCallback(async () => {
        if (!containerStatus.running && !systemdStatus.running) {
            setHealthStatus(null);
            return;
        }

        try {
            // Use curl through cockpit.spawn to bypass CSP restrictions
            const result = await cockpit.spawn([
                'curl',
                '-s', // Silent mode
                '-m',
                '5', // 5 second timeout
                getHealthUrl(window.location.hostname),
            ]);

            if (result) {
                const data = safeJsonParse<HealthStatus | null>(result, null, 'health status response');
                if (data) {
                    setHealthStatus(data);
                    // Update version info
                    setVersionInfo(prev => {
                        if (prev.current === data.version && prev.buildDate === data.build_date) {
                            return prev;
                        }
                        return {
                            ...prev,
                            current: data.version,
                            buildDate: data.build_date,
                        };
                    });
                } else {
                    console.warn('Health check returned invalid JSON, clearing health status');
                    setHealthStatus(null);
                }
            } else {
                console.error('Health check returned empty response');
                setHealthStatus(null);
            }
        } catch (error) {
            console.error('Error fetching health status:', error);
            setHealthStatus(null);
        }
    }, [containerStatus.running, systemdStatus.running]);

    const fetchAppLogs = useCallback(async () => {
        if (!selectedLogFile) return;

        // Validate the selected log file to prevent path traversal
        if (!isValidLogFile(selectedLogFile, logFiles)) {
            console.error('Invalid log file name:', selectedLogFile);
            setAppLogs([]);
            return;
        }

        try {
            const logPath = `${DEFAULT_LOG_DIR}/${selectedLogFile}`;
            const result = await cockpit.spawn(['tail', '-n', '500', logPath]);

            // Parse JSON logs
            const parsedLogs = result
                .trim()
                .split('\n')
                .map(line => {
                    try {
                        return JSON.parse(line) as LogEntry;
                    } catch {
                        return null;
                    }
                })
                .filter((log): log is LogEntry => log !== null)
                .reverse(); // Show newest first

            setAppLogs(parsedLogs);
        } catch (error) {
            console.error('Error fetching app logs:', error);
            setAppLogs([]);
        }
    }, [selectedLogFile, logFiles]);

    const checkForUpdates = useCallback(async () => {
        setVersionInfo(prev => {
            const next = { ...prev, checkingUpdate: true };
            delete next.updateError;
            return next;
        });

        try {
            const currentVersion = versionInfoRef.current.current?.replace('v', '');
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
                        'curl',
                        '-s',
                        '-m',
                        '10',
                        '-H',
                        'Accept: application/vnd.github+json',
                        GITHUB_PACKAGES_URL,
                    ]);

                    if (packageResult) {
                        const versions = safeJsonParse<{ metadata?: { container?: { tags?: string[] } } }[]>(
                            packageResult,
                            [],
                            'GitHub Container Registry versions'
                        );

                        // If parsing failed or returned empty, fall through to catch block
                        if (!versions.length) {
                            throw new Error('Failed to parse container registry response');
                        }

                        const nightlyTags: string[] = [];
                        let latestNightlyDate = 0;
                        let latestNightlyTag = '';

                        // Extract nightly tags and find the most recent one
                        versions.forEach((version: { metadata?: { container?: { tags?: string[] } } }) => {
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
                            releaseUrl: GITHUB_REGISTRY_PAGE_URL,
                        }));
                    }
                } catch (registryError) {
                    console.error('Error fetching registry data:', registryError);
                    // Fallback to simple nightly check
                    setVersionInfo(prev => ({
                        ...prev,
                        latest: 'nightly (development build)',
                        updateAvailable: false,
                        checkingUpdate: false,
                        releaseNotes: 'Nightly builds contain the latest development features and fixes',
                        releaseUrl: GITHUB_REGISTRY_PAGE_URL,
                    }));
                }
            } else {
                // For stable versions, check against GitHub releases
                const result = await cockpit.spawn(['curl', '-s', '-m', '10', GITHUB_RELEASES_LATEST_URL]);

                if (result) {
                    const release = safeJsonParse<{ tag_name?: string; html_url?: string; body?: string }>(
                        result,
                        {},
                        'GitHub latest release'
                    );

                    // If parsing failed or returned an empty object, treat as an error
                    if (!release.tag_name) {
                        setVersionInfo(prev => ({
                            ...prev,
                            checkingUpdate: false,
                            updateError: 'Failed to check for updates: invalid API response',
                        }));
                        return;
                    }

                    const latestStable = release.tag_name.replace('v', '');

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
                        ...(latestStable != null && { latest: latestStable }),
                        updateAvailable,
                        checkingUpdate: false,
                        ...(release.body != null && { releaseNotes: release.body }),
                        ...(release.html_url != null && { releaseUrl: release.html_url }),
                    }));
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            setVersionInfo(prev => ({
                ...prev,
                checkingUpdate: false,
                updateError: 'Failed to check for updates',
            }));
        }
    }, []);

    const refreshStatus = useCallback(async () => {
        setLoading(true);
        const d = await detectDeployment(window.location.hostname);
        setDeployment(d);
        await fetchHealthStatus();
        setLoading(false);
    }, [fetchHealthStatus]);

    useEffect(() => {
        Promise.resolve()
            .then(() => {
                refreshStatus();
            })
            .catch(err => {
                console.error('Error in refreshStatus effect:', err);
            });
    }, [refreshStatus]);

    // Fetch logs when container status changes
    useEffect(() => {
        Promise.resolve()
            .then(() => {
                fetchLogs();
            })
            .catch(err => {
                console.error('Error in fetchLogs effect:', err);
            });
    }, [fetchLogs]);

    // Auto-refresh logs every 5 seconds if container is running
    useEffect(() => {
        if (containerStatus.running) {
            const interval = setInterval(() => {
                fetchLogs();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [containerStatus.running, fetchLogs]);

    // Fetch log files when container is running
    useEffect(() => {
        if (containerStatus.running) {
            Promise.resolve()
                .then(() => {
                    fetchLogFiles();
                })
                .catch(err => {
                    console.error('Error in fetchLogFiles effect:', err);
                });
        }
    }, [containerStatus.running, fetchLogFiles]);

    // Fetch health status when container is running
    useEffect(() => {
        if (containerStatus.running) {
            Promise.resolve()
                .then(() => {
                    fetchHealthStatus();
                })
                .catch(err => {
                    console.error('Error in fetchHealthStatus effect:', err);
                });
        }
    }, [containerStatus.running, fetchHealthStatus]);

    // Auto-refresh health status every 10 seconds
    useEffect(() => {
        if (containerStatus.running) {
            const interval = setInterval(() => {
                fetchHealthStatus();
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [containerStatus.running, fetchHealthStatus]);

    // Fetch app logs when selected log file changes
    useEffect(() => {
        if (selectedLogFile && containerStatus.running) {
            Promise.resolve()
                .then(() => {
                    fetchAppLogs();
                })
                .catch(err => {
                    console.error('Error in fetchAppLogs effect:', err);
                });
        }
    }, [selectedLogFile, containerStatus.running, fetchAppLogs]);

    // Auto-refresh app logs every 3 seconds if container is running
    useEffect(() => {
        if (containerStatus.running && selectedLogFile) {
            const interval = setInterval(() => {
                fetchAppLogs();
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [containerStatus.running, selectedLogFile, fetchAppLogs]);

    // Check for updates when version info is available
    useEffect(() => {
        if (versionInfo.current && !versionInfo.latest && !versionInfo.checkingUpdate && !versionInfo.updateError) {
            Promise.resolve()
                .then(() => {
                    checkForUpdates();
                })
                .catch(err => {
                    console.error('Error in checkForUpdates effect:', err);
                });
        }
    }, [versionInfo, checkForUpdates]);

    const dockerStatusVariant = () => getDockerStatusVariant(dockerStatus);

    const containerStatusVariant = () => getContainerStatusVariant(systemdStatus, containerStatus);

    const getDockerStatusText = () => {
        if (!dockerStatus.available) return _('Docker not available');
        if (!dockerStatus.running) return _('Docker service not running');
        return _('Docker service running');
    };

    const getContainerStatusText = () => {
        // Check systemd first
        if (systemdStatus.exists) {
            const serviceType = containerStatus.exists ? '(Docker systemd)' : '(binary systemd)';
            if (systemdStatus.running) return _(`BirdNET-Go service running ${serviceType}`);
            return _(`BirdNET-Go service stopped ${serviceType}`);
        }

        // Then check Docker Compose
        if (containerStatus.isCompose) {
            if (containerStatus.running) return _('BirdNET-Go running (Docker Compose)');
            return _('BirdNET-Go stopped (Docker Compose)');
        }

        // Then check standalone Docker
        if (!containerStatus.imagePresent) return _('BirdNET-Go Docker image not found');
        if (!containerStatus.exists) return _('No BirdNET-Go container found');
        if (!containerStatus.running) return _('BirdNET-Go container stopped');
        return _('BirdNET-Go container running');
    };

    const onStart = async () => {
        try {
            await driver.start();
            await refreshStatus();
        } catch (e) {
            console.error('Error starting BirdNET-Go:', e);
        }
    };

    const onStop = async () => {
        try {
            await driver.stop();
            await refreshStatus();
        } catch (e) {
            console.error('Error stopping BirdNET-Go:', e);
        }
    };

    const onRestart = async () => {
        setRestarting(true);
        try {
            await driver.restart();
            await refreshStatus();
        } catch (e) {
            console.error('Error restarting BirdNET-Go:', e);
        } finally {
            setRestarting(false);
        }
    };

    const createContainer = async () => {
        try {
            await cockpit.spawn([
                runtimeBin(deployment.runtime),
                'run',
                '-d',
                '--name',
                CONTAINER_NAME,
                '-p',
                `${BIRDNET_PORT}:${BIRDNET_PORT}`,
                '-p',
                `${BIRDNET_METRICS_PORT}:${BIRDNET_METRICS_PORT}`,
                '-v',
                `${DEFAULT_CONFIG_DIR}:/config`,
                '-v',
                `${DEFAULT_DATA_DIR}:/data`,
                getImageRef(),
            ]);
            await refreshStatus();
        } catch (error) {
            console.error('Error creating container:', error);
        }
    };

    const pullImage = async () => {
        try {
            await cockpit.spawn([runtimeBin(deployment.runtime), 'pull', getImageRef()]);
            await refreshStatus();
        } catch (error) {
            console.error('Error pulling image:', error);
        }
    };

    const enableSystemdService = async () => {
        try {
            await cockpit.spawn(['systemctl', 'enable', SERVICE_NAME], { superuser: 'try' });
            await refreshStatus();
        } catch (error) {
            console.error('Error enabling systemd service:', error);
        }
    };

    const upgradeBirdNetGo = async () => {
        setUpgrading(true);

        try {
            // Check if Docker is available first
            if (!dockerStatus.available) {
                alert('No container runtime is available. Please install Docker or Podman to upgrade BirdNET-Go.');
                return;
            }

            if (!dockerStatus.running) {
                alert('The container runtime is not running. Please start Docker or Podman first.');
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

            const imageName = getImageRef(imageTag);

            // Pull the new image
            const bin = runtimeBin(deployment.runtime);
            await cockpit.spawn([bin, 'pull', imageName]);

            if (systemdStatus.exists) {
                // For systemd service that runs Docker, just restart the service
                // The service will pull and run the latest image
                await cockpit.spawn(['systemctl', 'restart', SERVICE_NAME], { superuser: 'try' });
            } else if (containerStatus.containerId) {
                // Recreate the standalone container on the new image, reproducing its
                // device/network/restart/mount flags. If the container carries settings
                // that cannot be safely reproduced, leave it running and guide the user.
                const result = await recreateContainer(bin, containerStatus.containerId, {
                    image: imageName,
                    internalPort: 8080,
                });
                if (result.kind === 'unsupported') {
                    alert(`Could not upgrade automatically. ${result.instructions}`);
                    return;
                }
            }

            // Refresh status after upgrade
            await refreshStatus();
            await checkForUpdates();
        } catch (error) {
            console.error('Error upgrading BirdNET-Go:', error);
            alert('Failed to upgrade BirdNET-Go. Please check the logs.');
        } finally {
            setUpgrading(false);
        }
    };

    const filteredLogs = filterLogs(appLogs, logLevelFilter, logSearchText);

    return (
        <Page className="no-masthead-sidebar">
            <PageSection hasBodyWrapper={false} className="ct-pagesection-mobile">
                <Grid hasGutter>
                    <GridItem span={12}>
                        <h2 className="pf-v6-c-card__title-text">BirdNET-Go Service Management</h2>
                    </GridItem>

                    <GridItem span={12}>
                        <Card>
                            <CardTitle>Service Controls</CardTitle>
                            <CardBody>
                                {containerStatus.isCompose && (
                                    <Alert
                                        variant="warning"
                                        title="Docker Compose deployment detected"
                                        isInline
                                        className="pf-v6-u-mb-md"
                                    >
                                        This container is managed by Docker Compose. For best results, use
                                        docker-compose commands in the{' '}
                                        {containerStatus.composeWorkingDir || 'compose project'} directory. Basic
                                        controls below may work but compose-specific operations should be done via CLI.
                                    </Alert>
                                )}
                                <Flex>
                                    <FlexItem>
                                        <Button variant="secondary" onClick={refreshStatus} isLoading={loading}>
                                            Refresh Status
                                        </Button>
                                    </FlexItem>

                                    {/* Systemd controls */}
                                    {systemdStatus.exists && (
                                        <FlexItem>
                                            {!systemdStatus.running && (
                                                <Button variant="primary" onClick={onStart}>
                                                    Start Service
                                                </Button>
                                            )}
                                            {systemdStatus.running && (
                                                <Button variant="secondary" onClick={onStop}>
                                                    Stop Service
                                                </Button>
                                            )}
                                            <Button
                                                variant="secondary"
                                                onClick={onRestart}
                                                isLoading={restarting}
                                                style={{ marginLeft: '0.5rem' }}
                                            >
                                                {restarting ? 'Restarting...' : 'Restart Service'}
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
                                                        onClick={onStart}
                                                        isDisabled={!dockerStatus.running}
                                                    >
                                                        Start Container
                                                    </Button>
                                                )}
                                                {containerStatus.exists && containerStatus.running && (
                                                    <Button variant="secondary" onClick={onStop}>
                                                        Stop Container
                                                    </Button>
                                                )}
                                                {containerStatus.exists && (
                                                    <Button
                                                        variant="secondary"
                                                        onClick={onRestart}
                                                        isDisabled={!dockerStatus.running || restarting}
                                                        isLoading={restarting}
                                                        style={{ marginLeft: '0.5rem' }}
                                                    >
                                                        {restarting ? 'Restarting...' : 'Restart Container'}
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
                                                onClick={() =>
                                                    window.open(getWebInterfaceUrl(window.location.hostname), '_blank')
                                                }
                                            >
                                                Open Web Interface
                                            </Button>
                                        </FlexItem>
                                    )}
                                </Flex>
                            </CardBody>
                        </Card>
                    </GridItem>

                    <GridItem xl={6} lg={6} md={12}>
                        <Card>
                            <CardTitle>BirdNET-Go Status</CardTitle>
                            <CardBody>
                                <Alert variant={containerStatusVariant()} title={getContainerStatusText()} />
                                <div className="pf-v6-u-display-grid u-grid-template-columns-1fr-1fr pf-v6-u-gap-md pf-v6-u-mt-md">
                                    {/* Left Column */}
                                    <div>
                                        {systemdStatus.exists && (
                                            <>
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>Type:</strong>{' '}
                                                    {containerStatus.exists
                                                        ? 'Docker (systemd managed)'
                                                        : 'Binary (systemd managed)'}
                                                </p>
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>Service:</strong> {SERVICE_NAME}
                                                </p>
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>Status:</strong> {systemdStatus.status}
                                                </p>
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>Boot:</strong>{' '}
                                                    {systemdStatus.enabled ? 'Enabled' : 'Disabled'}
                                                </p>
                                            </>
                                        )}
                                        {!systemdStatus.exists && containerStatus.isCompose && (
                                            <p style={{ marginBottom: '0.5rem' }}>
                                                <strong>Type:</strong> Docker Compose
                                            </p>
                                        )}
                                        {!systemdStatus.exists && containerStatus.composeProject && (
                                            <p style={{ marginBottom: '0.5rem' }}>
                                                <strong>Compose Project:</strong> {containerStatus.composeProject}
                                            </p>
                                        )}
                                        {!systemdStatus.exists && containerStatus.composeService && (
                                            <p style={{ marginBottom: '0.5rem' }}>
                                                <strong>Compose Service:</strong> {containerStatus.composeService}
                                            </p>
                                        )}
                                        {!systemdStatus.exists && containerStatus.status && (
                                            <p style={{ marginBottom: '0.5rem' }}>
                                                <strong>Status:</strong> {containerStatus.status}
                                            </p>
                                        )}
                                        {!systemdStatus.exists &&
                                            containerStatus.containerId &&
                                            !containerStatus.isCompose && (
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>Container ID:</strong>{' '}
                                                    {containerStatus.containerId.substring(0, 12)}
                                                </p>
                                            )}
                                        {(containerStatus.running || systemdStatus.running) && (
                                            <p style={{ marginBottom: '0.5rem' }}>
                                                <strong>Web Interface:</strong>{' '}
                                                <a
                                                    href={getWebInterfaceUrl(window.location.hostname)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    {getWebInterfaceUrl(window.location.hostname)}
                                                </a>
                                            </p>
                                        )}
                                    </div>

                                    {/* Right Column */}
                                    <div>
                                        {healthStatus && (
                                            <>
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>Health:</strong>{' '}
                                                    <span
                                                        style={{
                                                            color:
                                                                healthStatus.status === 'healthy'
                                                                    ? '#3e8635'
                                                                    : healthStatus.status === 'degraded'
                                                                      ? '#f0ab00'
                                                                      : '#c9190b',
                                                            fontWeight: 'bold',
                                                        }}
                                                    >
                                                        {capitalize(healthStatus.status)}
                                                    </span>
                                                </p>
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>database:</strong>{' '}
                                                    <span
                                                        style={{
                                                            color:
                                                                healthStatus.database_status === 'connected'
                                                                    ? '#3e8635'
                                                                    : '#c9190b',
                                                            fontWeight: 'bold',
                                                        }}
                                                    >
                                                        {capitalize(healthStatus.database_status)}
                                                    </span>
                                                    {healthStatus.database_error && (
                                                        <span
                                                            style={{
                                                                color: '#c9190b',
                                                                fontSize: '0.875rem',
                                                                marginLeft: '0.5rem',
                                                            }}
                                                        >
                                                            ({capitalize(healthStatus.database_error)})
                                                        </span>
                                                    )}
                                                </p>
                                                <p style={{ marginBottom: '0.5rem' }}>
                                                    <strong>Uptime:</strong> {formatUptime(healthStatus.uptime)}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    </GridItem>

                    <GridItem xl={6} lg={6} md={12}>
                        <Card>
                            <CardTitle>Version Management</CardTitle>
                            <CardBody>
                                {versionInfo.current && (
                                    <>
                                        <p>
                                            <strong>Current Version:</strong> {versionInfo.current}
                                        </p>
                                        <p>
                                            <strong>Build Date:</strong>{' '}
                                            {versionInfo.buildDate
                                                ? new Date(versionInfo.buildDate).toLocaleDateString()
                                                : 'Unknown'}
                                        </p>

                                        {versionInfo.checkingUpdate && (
                                            <p style={{ color: '#6a6e73', fontStyle: 'italic' }}>
                                                Checking for updates...
                                            </p>
                                        )}

                                        {versionInfo.latest && !versionInfo.checkingUpdate && (
                                            <div>
                                                {versionInfo.current?.includes('nightly') ? (
                                                    <>
                                                        {versionInfo.latestNightly && (
                                                            <p>
                                                                <strong>Latest Nightly:</strong>{' '}
                                                                {versionInfo.latestNightly}
                                                            </p>
                                                        )}
                                                        {versionInfo.updateAvailable ? (
                                                            <Alert
                                                                variant="info"
                                                                title="Newer nightly build available"
                                                                actionLinks={
                                                                    <Button
                                                                        variant="link"
                                                                        isInline
                                                                        onClick={() =>
                                                                            window.open(
                                                                                versionInfo.releaseUrl,
                                                                                '_blank'
                                                                            )
                                                                        }
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
                                                        {versionInfo.nightlyTags &&
                                                            versionInfo.nightlyTags.length > 0 && (
                                                                <div style={{ marginTop: '0.5rem' }}>
                                                                    <p
                                                                        style={{
                                                                            fontSize: '0.875rem',
                                                                            color: '#6a6e73',
                                                                            marginBottom: '0.25rem',
                                                                        }}
                                                                    >
                                                                        Recent nightly builds:
                                                                    </p>
                                                                    <ul
                                                                        style={{
                                                                            fontSize: '0.875rem',
                                                                            marginLeft: '1rem',
                                                                            marginTop: '0',
                                                                        }}
                                                                    >
                                                                        {versionInfo.nightlyTags
                                                                            .slice(0, 3)
                                                                            .map(tag => (
                                                                                <li
                                                                                    key={tag}
                                                                                    style={{ color: '#6a6e73' }}
                                                                                >
                                                                                    <code>{tag}</code>
                                                                                </li>
                                                                            ))}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <p>
                                                            <strong>Latest Stable:</strong> {versionInfo.latest}
                                                        </p>
                                                        {versionInfo.updateAvailable && (
                                                            <Alert
                                                                variant="info"
                                                                title="Update available"
                                                                actionLinks={
                                                                    versionInfo.releaseUrl ? (
                                                                        <Button
                                                                            variant="link"
                                                                            isInline
                                                                            onClick={() =>
                                                                                window.open(
                                                                                    versionInfo.releaseUrl,
                                                                                    '_blank'
                                                                                )
                                                                            }
                                                                        >
                                                                            View Release Notes
                                                                        </Button>
                                                                    ) : null
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
                                            </div>
                                        )}

                                        {versionInfo.updateError && (
                                            <Alert variant="warning" title={versionInfo.updateError} isInline isPlain />
                                        )}

                                        <Flex className="pf-v6-u-mt-md pf-v6-u-gap-sm pf-v6-u-flex-wrap pf-v6-u-align-items-center">
                                            <Button
                                                variant="secondary"
                                                onClick={checkForUpdates}
                                                isDisabled={versionInfo.checkingUpdate || upgrading}
                                            >
                                                Check for Updates
                                            </Button>
                                            {versionInfo.current?.includes('nightly') &&
                                                versionInfo.updateAvailable &&
                                                supportsAutomaticUpgrade(systemdStatus, containerStatus) && (
                                                    <Button
                                                        variant="primary"
                                                        onClick={upgradeBirdNetGo}
                                                        isDisabled={upgrading || !dockerStatus.running}
                                                        isLoading={upgrading}
                                                    >
                                                        {upgrading
                                                            ? 'Pulling Latest Nightly...'
                                                            : 'Upgrade to Latest Nightly'}
                                                    </Button>
                                                )}
                                            {versionInfo.updateAvailable &&
                                                !versionInfo.current?.includes('nightly') &&
                                                supportsAutomaticUpgrade(systemdStatus, containerStatus) && (
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
                                        {isBinaryInstallation(systemdStatus, containerStatus) &&
                                            versionInfo.updateAvailable && (
                                                <Alert
                                                    variant="info"
                                                    title="Manual update required for binary installations"
                                                    isInline
                                                    isPlain
                                                    className="pf-v6-u-mt-md"
                                                >
                                                    Automatic upgrades are only available for standalone Docker
                                                    installations. Please download and install the new binary manually
                                                    from the GitHub releases page.
                                                </Alert>
                                            )}
                                        {containerStatus.isCompose && versionInfo.updateAvailable && (
                                            <Alert
                                                variant="info"
                                                title="Manual update required for Docker Compose deployments"
                                                isInline
                                                isPlain
                                                className="pf-v6-u-mt-md"
                                            >
                                                Docker Compose deployments must be updated manually. Navigate to{' '}
                                                {containerStatus.composeWorkingDir || 'your compose directory'} and run:
                                                <code style={{ display: 'block', marginTop: '0.5rem' }}>
                                                    docker-compose pull && docker-compose up -d
                                                </code>
                                            </Alert>
                                        )}
                                        <p style={{ marginTop: '1rem' }}>
                                            <a
                                                href={GITHUB_RELEASES_PAGE_URL}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                View all releases on GitHub
                                            </a>
                                            {' | '}
                                            <a
                                                href={GITHUB_REGISTRY_PAGE_URL}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
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

                    <GridItem xl={6} lg={6} md={12}>
                        <PortCard
                            deployment={deployment}
                            hostname={window.location.hostname}
                            onChanged={refreshStatus}
                        />
                    </GridItem>

                    <GridItem span={12}>
                        <Card>
                            <CardTitle>Docker Status</CardTitle>
                            <CardBody>
                                <Alert variant={dockerStatusVariant()} title={getDockerStatusText()} />
                                {dockerStatus.version && (
                                    <p>
                                        <strong>Version:</strong> {dockerStatus.version}
                                    </p>
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
                                        <pre
                                            className="pf-v6-u-background-color-200 pf-v6-u-p-md pf-v6-u-border-radius-sm pf-v6-u-font-family-monospace pf-v6-u-font-size-sm pf-v6-u-line-height-md"
                                            style={{
                                                maxHeight: '400px',
                                                overflowY: 'auto',
                                                overflowX: 'auto',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                margin: 0,
                                                width: '100%',
                                                maxWidth: '100%',
                                            }}
                                        >
                                            {containerLogs}
                                        </pre>
                                    ) : (
                                        <Alert variant="info" title="No logs available" />
                                    )}
                                    <Flex className="pf-v6-u-mt-md">
                                        <FlexItem>
                                            <Button variant="secondary" onClick={fetchLogs} size="sm">
                                                Refresh Logs
                                            </Button>
                                        </FlexItem>
                                        <FlexItem>
                                            <small style={{ color: '#6a6e73', lineHeight: '2.5' }}>
                                                {containerStatus.running
                                                    ? 'Auto-refreshing every 5 seconds'
                                                    : 'Container not running'}
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
                                    <Flex className="pf-v6-u-mb-md pf-v6-u-gap-md pf-v6-u-flex-wrap">
                                        <FlexItem>
                                            <Select
                                                isOpen={logSelectOpen}
                                                onSelect={(_, value) => {
                                                    const file = value as string;
                                                    if (isValidLogFile(file, logFiles)) {
                                                        setSelectedLogFile(file);
                                                    }
                                                    setLogSelectOpen(false);
                                                }}
                                                toggle={toggleRef => (
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
                                            <Button variant="secondary" onClick={fetchAppLogs} size="sm">
                                                Refresh
                                            </Button>
                                        </FlexItem>
                                    </Flex>

                                    <div className="application-logs-container pf-v6-u-p-md pf-v6-u-border-radius-sm pf-v6-u-font-family-monospace pf-v6-u-font-size-sm pf-v6-u-line-height-lg">
                                        {filteredLogs.length > 0 ? (
                                            filteredLogs.map((log, index) => (
                                                <div key={index} className="log-entry">
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            gap: '1rem',
                                                            marginBottom: '0.25rem',
                                                        }}
                                                    >
                                                        <span className="log-timestamp">{formatLogTime(log.time)}</span>
                                                        <span
                                                            className="log-level"
                                                            style={{
                                                                color: getLogLevelColor(log.level),
                                                            }}
                                                        >
                                                            {log.level}
                                                        </span>
                                                        {log.service && (
                                                            <span className="log-service">[{log.service}]</span>
                                                        )}
                                                    </div>
                                                    <div className="log-message" style={{ marginLeft: '1rem' }}>
                                                        {log.msg}
                                                    </div>
                                                    {Object.entries(log).filter(
                                                        ([key]) => !['time', 'level', 'msg', 'service'].includes(key)
                                                    ).length > 0 && (
                                                        <div
                                                            className="log-fields"
                                                            style={{
                                                                marginTop: '0.25rem',
                                                                marginLeft: '2rem',
                                                            }}
                                                        >
                                                            {Object.entries(log)
                                                                .filter(
                                                                    ([key]) =>
                                                                        !['time', 'level', 'msg', 'service'].includes(
                                                                            key
                                                                        )
                                                                )
                                                                .map(([key, value]) => (
                                                                    <span key={key} style={{ marginRight: '1rem' }}>
                                                                        <span className="log-field-key">{key}:</span>{' '}
                                                                        {JSON.stringify(value)}
                                                                    </span>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="log-empty">
                                                {logSearchText || logLevelFilter !== 'all'
                                                    ? 'No logs match the current filters'
                                                    : 'No logs available'}
                                            </div>
                                        )}
                                    </div>

                                    <Flex className="pf-v6-u-mt-sm">
                                        <FlexItem>
                                            <small className="log-stats">
                                                Showing {filteredLogs.length} of {appLogs.length} log entries •
                                                Auto-refreshing every 3 seconds
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
