// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Application } from './app';
import { detectDeployment } from './deployment/detect';
import type { Deployment } from './deployment/types';

vi.mock('./deployment/detect', () => ({
    detectDeployment: vi.fn(),
}));

afterEach(cleanup);

const mockDeployment = (over: Partial<Deployment>): Deployment => ({
    kind: 'docker-standalone',
    runtime: 'docker',
    running: false,
    imagePresent: false,
    dockerAvailable: false,
    dockerRunning: false,
    hostPort: 8080,
    internalPort: 8080,
    ...over,
});

describe('<Application />', () => {
    beforeEach(() => {
        vi.mocked(detectDeployment).mockReset();
    });

    it('mounts and renders the service management heading', async () => {
        vi.mocked(detectDeployment).mockResolvedValue(mockDeployment({}));
        render(<Application />);

        expect(await screen.findByRole('heading', { name: 'BirdNET-Go Service Management' })).toBeDefined();
    });

    it('renders Podman status and log cards when runtime is podman', async () => {
        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'docker-standalone',
                runtime: 'podman',
                running: true,
                imagePresent: true,
                containerId: 'podman123',
                dockerAvailable: true,
                dockerRunning: true,
                dockerVersion: '5.1.0',
            })
        );
        render(<Application />);

        expect(await screen.findByText('Podman Status')).toBeDefined();
        expect(await screen.findByText('Podman Container Logs')).toBeDefined();
        expect(await screen.findByText('Podman service running')).toBeDefined();
    });

    it('renders Docker status and log cards when runtime is docker', async () => {
        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'docker-standalone',
                runtime: 'docker',
                running: true,
                imagePresent: true,
                containerId: 'docker123',
                dockerAvailable: true,
                dockerRunning: true,
                dockerVersion: '27.0.0',
            })
        );
        render(<Application />);

        expect(await screen.findByText('Docker Status')).toBeDefined();
        expect(await screen.findByText('Docker Container Logs')).toBeDefined();
        expect(await screen.findByText('Docker service running')).toBeDefined();
    });

    it('renders Podman Compose notices and types when runtime is podman with compose', async () => {
        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'docker-compose',
                runtime: 'podman',
                running: true,
                imagePresent: true,
                containerId: 'podmancompose123',
                composeProject: 'birdnet-prod',
                composeService: 'birdnet',
                composeWorkingDir: '/opt/birdnet',
                dockerAvailable: true,
                dockerRunning: true,
            })
        );
        render(<Application />);

        expect(await screen.findByText('Podman Compose deployment detected')).toBeDefined();
        expect(await screen.findByText(/BirdNET-Go running \(Podman Compose\)/)).toBeDefined();
    });

    it('renders systemd service status correctly for Podman systemd (running and stopped)', async () => {
        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'docker-systemd',
                runtime: 'podman',
                running: true,
                imagePresent: true,
                containerId: 'podman-sys-123',
                dockerAvailable: true,
                dockerRunning: true,
            })
        );
        const { unmount } = render(<Application />);
        expect(await screen.findByText('BirdNET-Go service running (Podman systemd)')).toBeDefined();
        unmount();

        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'docker-systemd',
                runtime: 'podman',
                running: false,
                imagePresent: true,
                containerId: 'podman-sys-123',
                dockerAvailable: true,
                dockerRunning: true,
            })
        );
        render(<Application />);
        expect(await screen.findByText('BirdNET-Go service stopped (Podman systemd)')).toBeDefined();
    });

    it('renders systemd service status correctly for Docker systemd (running and stopped)', async () => {
        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'docker-systemd',
                runtime: 'docker',
                running: true,
                imagePresent: true,
                containerId: 'docker-sys-123',
                dockerAvailable: true,
                dockerRunning: true,
            })
        );
        const { unmount } = render(<Application />);
        expect(await screen.findByText('BirdNET-Go service running (Docker systemd)')).toBeDefined();
        unmount();

        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'docker-systemd',
                runtime: 'docker',
                running: false,
                imagePresent: true,
                containerId: 'docker-sys-123',
                dockerAvailable: true,
                dockerRunning: true,
            })
        );
        render(<Application />);
        expect(await screen.findByText('BirdNET-Go service stopped (Docker systemd)')).toBeDefined();
    });

    it('renders systemd service status correctly for binary systemd (running and stopped)', async () => {
        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'native-systemd',
                runtime: null,
                running: true,
                imagePresent: false,
                dockerAvailable: false,
                dockerRunning: false,
            })
        );
        const { unmount } = render(<Application />);
        expect(await screen.findByText('BirdNET-Go service running (binary systemd)')).toBeDefined();
        unmount();

        vi.mocked(detectDeployment).mockResolvedValue(
            mockDeployment({
                kind: 'native-systemd',
                runtime: null,
                running: false,
                imagePresent: false,
                dockerAvailable: false,
                dockerRunning: false,
            })
        );
        render(<Application />);
        expect(await screen.findByText('BirdNET-Go service stopped (binary systemd)')).toBeDefined();
    });
});
