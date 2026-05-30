// Test stub for the Cockpit host API.
//
// At runtime the `cockpit` module is the global API injected by Cockpit, and
// the production build resolves the bare `cockpit` import via tsconfig paths to
// pkg/lib/cockpit.js. Tests do not run inside Cockpit, so vitest aliases the
// `cockpit` import to this stub (see vitest.config.ts). It only needs enough
// surface for <Application/> to mount.

const cockpit = {
    // The status probes `await cockpit.spawn(...)`. Resolving to an empty
    // string lets the component's effects settle into their default ("not
    // available") states, so tests exercise the full render path rather than
    // just the initial synchronous shell. Tests await the settled render with
    // async queries (findBy*), which keeps React state updates wrapped in act.
    spawn: () => Promise.resolve(''),
    gettext: (text: string): string => text,
};

export default cockpit;
