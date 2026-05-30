// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Application } from './app';

afterEach(cleanup);

describe('<Application />', () => {
    // Guards that the React component tree mounts and renders under the
    // current React + PatternFly versions. The heading is static markup, so
    // it is present on the initial synchronous render regardless of the
    // (stubbed) cockpit.spawn status probes. This is the regression check
    // that a manual Cockpit smoke test used to be needed for.
    it('mounts and renders the service management heading', () => {
        render(<Application />);

        expect(screen.getByRole('heading', { name: 'BirdNET-Go Service Management' })).toBeDefined();
    });
});
