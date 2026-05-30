// Ambient declarations for side-effect stylesheet imports.
//
// These imports (see src/index.tsx) exist purely to pull stylesheets into the
// bundle; the esbuild SCSS plugin handles them at build time. TypeScript itself
// never resolves them, and TypeScript 6 promotes an untyped side-effect import
// to a hard error (TS2882: "Cannot find module or type declarations for
// side-effect import of ..."). Declaring the wildcard modules keeps tsc quiet
// without affecting the build.
declare module '*.scss';
declare module '*.css';
