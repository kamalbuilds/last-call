/* Hallmark · component: blink-share-link · genre: editorial · theme: FIDS blue-black
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */
import { ShareNetwork } from "@phosphor-icons/react";

// Small dial.to link that opens this holding's Solana Action (Blink) outside
// the site. The absolute site URL is resolved server-side from headers.
export function BlinkShareLink({
  token,
  siteUrl,
}: {
  token: string;
  siteUrl: string;
}): React.ReactNode {
  if (siteUrl === "") return null;
  return (
    <a
      className="num inline-flex items-center gap-1 text-xs text-[var(--text-2)] underline underline-offset-4 hover:text-[var(--text)] active:scale-[0.97]"
      href={`https://dial.to/?action=solana-action:${siteUrl}/api/actions/convert?token=${token}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Share ${token} conversion as a Blink`}
    >
      <ShareNetwork size={12} aria-hidden="true" />
      Share as Blink
    </a>
  );
}
