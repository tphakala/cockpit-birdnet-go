// Test stub for the Cockpit host API.
//
// At runtime the `cockpit` module is the global API injected by Cockpit, and
// the production build resolves the bare `cockpit` import via tsconfig paths to
// pkg/lib/cockpit.js. Tests do not run inside Cockpit, so vitest aliases the
// `cockpit` import to this stub (see vitest.config.ts). It only needs enough
// surface for <Application/> to mount.

const pending = <T>(): Promise<T> => new Promise<T>(() => undefined);

const cockpit = {
    // The status probes `await cockpit.spawn(...)`. Returning a promise that
    // never resolves lets the component reach its initial synchronous render
    // without triggering post-render state updates (no act() warnings).
    spawn: () => pending<string>(),
    gettext: (text: string): string => text,
};

export default cockpit;
