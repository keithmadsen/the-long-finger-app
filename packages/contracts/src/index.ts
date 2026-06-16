// @tlf/contracts — single source of truth for the API contract.
//
// Story 1.1 (walking skeleton) ships only this buildable placeholder so the
// workspace wiring is provable end-to-end. The real contract surface — the
// TypeBox schemas (`todoSchema`, `createTodoBody`, `patchTodoBody`,
// `errorEnvelope`) and their derived types — is authored in Story 1.2.
export const CONTRACTS_PACKAGE = '@tlf/contracts' as const;
