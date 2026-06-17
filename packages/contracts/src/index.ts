// @tlf/contracts — single source of truth for the API contract.
//
// Consumed as TypeScript source (no build step): package.json `main`/`types`/
// `exports` all point at this file, so both apps compile the `.ts` directly.
// `.js` specifiers below are required by the package's NodeNext resolution.
export * from './todo.schema.js';
export * from './error.schema.js';
