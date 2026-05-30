import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            // `cockpit` is provided by the Cockpit host at runtime; alias it to
            // a stub so component tests can import modules that use it.
            cockpit: fileURLToPath(new URL('./src/__mocks__/cockpit.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        server: {
            deps: {
                // PatternFly components import .css files. Inline them so vite
                // transforms (and stubs) those imports instead of Node trying
                // to load raw .css as ESM.
                inline: [/@patternfly\//],
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.tsx', 'src/types.ts', 'src/__mocks__/**'],
        },
    },
});
