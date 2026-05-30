// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Application } from './app';

afterEach(cleanup);

describe('<Application />', () => {
    // Guards that the React component tree mounts and renders under the
    // current React + PatternFly versions. The stubbed cockpit.spawn resolves
    // empty, so the component settles into its default states; findByRole
    // awaits that settled render (keeping state updates wrapped in act). This
    // is the regression check that a manual Cockpit smoke test used to be
    // needed for.
    it('mounts and renders the service management heading', async () => {
        render(<Application />);

        expect(await screen.findByRole('heading', { name: 'BirdNET-Go Service Management' })).toBeDefined();
    });
});
