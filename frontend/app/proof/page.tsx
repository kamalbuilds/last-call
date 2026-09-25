import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ProofAccountRow, ProofCheckRow, type ProofCheck } from "@/components/proof-rows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proof | Last call for pre-IPO holders",
};

const XAI_MINT = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const SPACEX_MINT = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
const HOLDER = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";

interface ProofFile {
  generatedAt: string;
  checks: ProofCheck[];
}

function readProof(): { proof: ProofFile | null; error: string | null } {
  try {
    const raw = readFileSync(path.join(process.cwd(), "public", "proof.json"), "utf8");
    const parsed = JSON.parse(raw) as ProofFile;
    if (!Array.isArray(parsed.checks)) return { proof: null, error: "proof.json has no checks array" };
    return { proof: parsed, error: null };
  } catch (err) {
    return { proof: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export default function ProofPage(): React.ReactNode {
  const { proof, error } = readProof();
  const passed = proof?.checks.filter((c) => c.ok).length ?? 0;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <section aria-label="Proof of checks" className="min-w-0">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Public audit trail</p>
        <h1 className="mt-3 max-w-xl text-[28px] font-bold leading-tight text-[var(--text)] sm:text-[40px]">
          Proof, rerun from the repo root.
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--text-2)]">
          Each row below is a real check. The runner executes the command, keeps the last output line, and stamps the time.
        </p>
        {proof !== null && (
          <p className="num mt-3 text-sm text-[var(--text-2)]">
            {passed} of {proof.checks.length} checks passing. Generated at {proof.generatedAt} UTC.
          </p>
        )}
      </section>

      {proof === null ? (
        <section aria-label="Proof unavailable" className="card mt-8 min-w-0 p-4 sm:p-6">
          <p className="text-sm text-[var(--closed)]">
            Proof output is unavailable right now{error !== null ? `: ${error}` : ""}. Rerun the proof script and reload.
          </p>
        </section>
      ) : proof.checks.length === 0 ? (
        <section aria-label="No checks yet" className="card mt-8 min-w-0 p-4 sm:p-6">
          <p className="text-sm text-[var(--text-2)]">No checks recorded yet. Rerun the proof script to fill this board.</p>
        </section>
      ) : (
        <section aria-label="Checks" className="mt-8 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          {proof.checks.map((check) => (
            <ProofCheckRow key={check.name} check={check} />
          ))}
        </section>
      )}

      <section aria-label="Accounts on Solscan" className="mt-12 min-w-0">
        <h2 className="num text-xl font-bold text-[var(--text)]">Accounts on Solscan</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
          The mints and the holder these checks read. Open any address to verify it on Solscan.
        </p>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <ProofAccountRow label="XAI mint" address={XAI_MINT} />
          <ProofAccountRow label="SPACEX mint" address={SPACEX_MINT} />
          <ProofAccountRow label="Holder" address={HOLDER} />
        </div>
      </section>

      <footer className="mt-12 border-t border-[var(--line)] pt-3">
        <p className="num text-xs text-[var(--text-3)]">
          {proof !== null ? `Generated at ${proof.generatedAt} UTC. ` : ""}Run pnpm proof from the repo root to refresh this page.
        </p>
      </footer>
    </main>
  );
}
