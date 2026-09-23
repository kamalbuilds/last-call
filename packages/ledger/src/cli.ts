import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLedger } from "./index.js";

const ledger = await buildLedger();
for (const token of ledger.tokens) {
  console.log(
    `${token.symbol} supply=${token.supply} pool=${token.poolHeld.toFixed(2)} wallets=${token.unconvertedInWallets.toFixed(2)} holders=${token.holders.length}/${token.holderCount} status=${token.status}`,
  );
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "ledger.json"), JSON.stringify(ledger, null, 2) + "\n");
console.log(`wrote ${join(outDir, "ledger.json")} with ${ledger.tokens.length} tokens`);
