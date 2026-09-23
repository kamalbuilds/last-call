/**
 * The shared contract, re-exported from the package that owns it.
 *
 * `packages/core/src/types.ts` is the single definition of every shape below and is
 * owned by the orchestrator. Nothing here redeclares any of it.
 *
 * Types only. This module erases completely and emits no runtime import.
 */
export type * from "@fineprint/core";
