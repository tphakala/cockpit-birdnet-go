// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { PortCard } from './PortCard';
import type { Deployment } from '../deployment/types';

afterEach(cleanup);

const dep = (over: Partial<Deployment>): Deployment => ({
    kind: 'docker-standalone',
    runtime: 'docker',
    running: true,
    imagePresent: true,
    dockerAvailable: true,
    dockerRunning: true,
    containerId: 'abc',
    hostPort: 8080,
    internalPort: 8080,
    ...over,
});

describe('PortCard', () => {
    it('shows the current port', async () => {
        render(<PortCard deployment={dep({})} hostname="localhost" onChanged={() => {}} />);
        // Use findAllByText because "8080" appears in both the current-port paragraph
        // and the quick-set button, making findByText (single-match) throw.
        const matches = await screen.findAllByText(/8080/);
        expect(matches.length).toBeGreaterThan(0);
    });

    it('shows a guided-manual notice for compose deployments', async () => {
        render(
            <PortCard
                deployment={dep({ kind: 'docker-compose', composeWorkingDir: '/srv/bng' })}
                hostname="localhost"
                onChanged={() => {}}
            />
        );
        expect(await screen.findByText(/compose/i)).toBeTruthy();
    });

    it('disables apply when the deployment cannot change its port', async () => {
        render(
            <PortCard deployment={dep({ kind: 'none', running: false })} hostname="localhost" onChanged={() => {}} />
        );
        const applyButton = await screen.findByRole('button', { name: /apply/i });
        expect(applyButton.hasAttribute('disabled')).toBe(true);
    });

    it('disables apply when the entered port equals the current port', async () => {
        render(<PortCard deployment={dep({})} hostname="localhost" onChanged={() => {}} />);
        const applyButton = await screen.findByRole('button', { name: /apply/i });
        expect(applyButton.hasAttribute('disabled')).toBe(true);
    });
});
