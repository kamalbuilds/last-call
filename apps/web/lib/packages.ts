/**
 * Access to the sibling packages.
 *
 * All three are resolved workspace dependencies and are imported statically, so a
 * missing or broken package is a build error rather than a silent 503 at request
 * time. That is deliberate: this app's whole claim is that it does not put guessed
 * numbers on screen, and a runtime fallback is how a guessed number gets on screen.
 *
 * This previously deferred @fineprint/cost and @fineprint/exec to a runtime
 * `import(specifier)` carrying webpackIgnore/turbopackIgnore, because neither
 * package existed when this file was written. Both now exist, and that shape had
 * two defects: the ignore hints left the specifier unbundled so Node was handed a
 * raw .ts entry point it cannot load, and the readiness probe required a
 * `tradFiQuotes` function that the cost package never exported (it exports the
 * `TRADFI_VENUES` const). Either one alone made every verdict return 503.
 *
 * Server-only. Nothing here may be imported from a "use client" module.
 */

import * as core from "@fineprint/core";
import * as cost from "@fineprint/cost";
import * as exec from "@fineprint/exec";

export { core, cost, exec };

/**
 * Kept async so the existing API routes call these unchanged. They no longer
 * return null: if a package were missing, the build would have failed already.
 */
export async function loadCost(): Promise<typeof cost> {
  return cost;
}

export async function loadExec(): Promise<typeof exec> {
  return exec;
}

/**
 * The RPC the whole app reads from. Public mainnet unless overridden.
 * RPC_URL is read too because @fineprint/core reads that name.
 */
export function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

/** Host only, for display in the provenance footer. Never shows credentials in a URL. */
export function rpcHost(): string {
  try {
    return new URL(rpcUrl()).host;
  } catch {
    return "invalid SOLANA_RPC_URL";
  }
}
