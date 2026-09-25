import { headers } from "next/headers";
import Image from "next/image";

interface ActionResponse {
  icon: string;
  title: string;
  description: string;
  label: string;
}

function isActionResponse(value: unknown): value is ActionResponse {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r["icon"] === "string" && typeof r["title"] === "string" && typeof r["description"] === "string" && typeof r["label"] === "string";
}

/** A rendered preview of the XAI Blink, built from a live GET against the same action a Blink client calls. */
export async function HomeConvertBlink(): Promise<React.ReactNode> {
  const heads = await headers();
  const host = heads.get("x-forwarded-host") ?? heads.get("host") ?? "";
  const proto = heads.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const siteUrl = host === "" ? "https://last-call-fawn.vercel.app" : `${proto}://${host}`;
  const blinkUrl = `https://dial.to/?action=solana-action:${siteUrl}/api/actions/convert?token=XAI`;

  let action: ActionResponse | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(`${siteUrl}/api/actions/convert?token=XAI`, { cache: "no-store" });
    const payload: unknown = await res.json();
    if (!res.ok || !isActionResponse(payload)) {
      throw new Error(typeof (payload as { message?: unknown })?.message === "string" ? (payload as { message: string }).message : `HTTP ${res.status}`);
    }
    action = payload;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <section aria-label="Convert from anywhere" className="mt-12 min-w-0 sm:mt-16">
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Convert from X, Discord, or any Blink client</p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h2 className="max-w-lg text-xl font-bold leading-snug text-[var(--text)] sm:text-2xl">
            A Blink is a Solana Action wrapped in a link. Paste it anywhere and it renders as a real transaction, not a screenshot.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--text-2)]">
            This one points at the same <code className="num">/api/actions/convert</code> endpoint the button on this page calls.
            Any Blink-aware client (Phantom, dial.to, X) resolves it live and lets a holder sign the conversion without visiting last-call.
          </p>
          <a
            href={blinkUrl}
            target="_blank"
            rel="noreferrer"
            className="num mt-4 inline-block max-w-full break-all text-sm text-[var(--text-2)] underline underline-offset-4"
          >
            {blinkUrl}
          </a>
        </div>

        {action !== null ? (
          <div className="card min-w-0 p-4 sm:p-5" aria-label="Blink preview">
            <div className="flex items-center gap-3">
              <Image
                src="/blink-icon.svg"
                alt=""
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 shrink-0 rounded-md border border-[var(--line)] bg-[var(--panel-2)]"
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-3)]">Solana Action</p>
                <h3 className="truncate text-sm font-bold text-[var(--text)]">{action.title}</h3>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-2)]">{action.description}</p>
            <a href={blinkUrl} target="_blank" rel="noreferrer" className="btn-primary mt-4 block w-full px-4 py-2 text-center text-sm">
              {action.label}
            </a>
          </div>
        ) : (
          <div className="card min-w-0 p-4 sm:p-5" aria-label="Blink preview unavailable">
            <p className="text-sm text-[var(--closed)]">Could not read the live action right now: {error}</p>
            <a href={blinkUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-4 block w-full px-4 py-2 text-center text-sm">
              Open the Blink anyway
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
