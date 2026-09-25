import Image from "next/image";
import type { Post } from "@/lib/evidence-posts";

const CAPTURED = "2026-09-25";

function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** A document pinned to the board: exhibit letter, pin, and an optional tilt on wide screens. */
export function Pinned({
  exhibit,
  kind,
  date,
  tilt = 0,
  className = "",
  children,
}: {
  exhibit: string;
  kind: string;
  date: string;
  tilt?: -1 | 0 | 1;
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  const rotate = tilt === -1 ? "lg:-rotate-[0.6deg]" : tilt === 1 ? "lg:rotate-[0.5deg]" : "";
  return (
    <article className={`relative min-w-0 break-inside-avoid ${rotate} ${className}`}>
      <span aria-hidden="true" className="absolute -top-1.5 left-6 z-10 size-3 rounded-full border border-[var(--text-3)] bg-[var(--panel-2)]" />
      <div className="card min-w-0 overflow-hidden">
        <p className="num flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--text-3)]">
          <span className="text-[var(--text)]">Exhibit {exhibit}</span>
          <span className="font-sans">{kind}</span>
          <span className="ml-auto">{date}</span>
        </p>
        {children}
      </div>
    </article>
  );
}

/** Highlights the issuer's own expiry wording inside verbatim post text. */
function markExpiry(text: string): React.ReactNode {
  const parts = text.split(/(expire worthless|expires worthless|the token expires)/);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-transparent text-[var(--closed)]">{p}</mark>
    ) : (
      p
    ),
  );
}

export function PostCard({ post, exhibit, tilt, className }: { post: Post; exhibit: string; tilt?: -1 | 0 | 1; className?: string }): React.ReactNode {
  return (
    <Pinned exhibit={exhibit} kind="Post on X" date={post.createdAt.slice(0, 10)} tilt={tilt} className={className}>
      <div className="p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image src={post.avatar} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[var(--text)]">
              {post.name}
              {post.verified && <span className="ml-2 text-xs font-normal text-[var(--text-3)]">verified</span>}
            </p>
            <p className="num truncate text-sm text-[var(--text-3)]">@{post.handle}</p>
          </div>
        </div>
        {post.text !== null && (
          <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-[var(--text)]">{markExpiry(post.text)}</p>
        )}
        {post.articleTitle !== null && (
          <div className="mt-3 overflow-hidden rounded-md border border-[var(--line)]">
            {post.media !== null && (
              <Image src={post.media.src} alt={post.media.alt} width={post.media.w} height={post.media.h} sizes="(min-width: 1024px) 480px, 100vw" className="h-auto w-full bg-white" />
            )}
            <div className="p-3">
              <p className="text-base font-semibold text-[var(--text)]">{post.articleTitle}</p>
              {post.articleExcerpt !== null && (
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-2)]">&ldquo;{markExpiry(post.articleExcerpt)}&rdquo;</p>
              )}
            </div>
          </div>
        )}
        {post.articleTitle === null && post.media !== null && (
          <Image src={post.media.src} alt={post.media.alt} width={post.media.w} height={post.media.h} sizes="(min-width: 1024px) 480px, 100vw" className="mt-3 h-auto w-full rounded-md border border-[var(--line)]" />
        )}
        <p className="num mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--text-3)]">
          <span>{utcStamp(post.createdAt)}</span>
          <span>{compact(post.views)} views</span>
          <span>{post.likes} likes</span>
          <span>{post.replies} replies</span>
          <a href={post.url} target="_blank" rel="noreferrer" className="ml-auto underline">
            View on x.com
          </a>
        </p>
      </div>
    </Pinned>
  );
}

export function Screenshot({
  exhibit,
  kind,
  src,
  width,
  height,
  alt,
  source,
  note,
  tilt,
  className,
}: {
  exhibit: string;
  kind: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  source: string;
  note?: React.ReactNode;
  tilt?: -1 | 0 | 1;
  className?: string;
}): React.ReactNode {
  return (
    <Pinned exhibit={exhibit} kind={kind} date={`captured ${CAPTURED}`} tilt={tilt} className={className}>
      <figure className="m-0">
        <Image src={src} alt={alt} width={width} height={height} sizes="(min-width: 1024px) 640px, 100vw" className="h-auto w-full" />
        <figcaption className="border-t border-[var(--line)] px-4 py-3 text-xs leading-relaxed text-[var(--text-3)]">
          {note !== undefined && <span className="mb-1 block text-sm text-[var(--text-2)]">{note}</span>}
          <a href={source} target="_blank" rel="noreferrer" className="num break-all underline">
            {source}
          </a>
        </figcaption>
      </figure>
    </Pinned>
  );
}

export function Clipping({
  exhibit,
  outlet,
  author,
  date,
  title,
  href,
  quote,
  tilt,
  className,
}: {
  exhibit: string;
  outlet: string;
  author: string;
  date: string;
  title: string;
  href: string;
  quote: string;
  tilt?: -1 | 0 | 1;
  className?: string;
}): React.ReactNode {
  return (
    <Pinned exhibit={exhibit} kind={outlet} date={date} tilt={tilt} className={className}>
      <div className="p-4">
        <a href={href} target="_blank" rel="noreferrer" className="text-base font-semibold leading-snug text-[var(--text)] underline">
          {title}
        </a>
        <p className="mt-1 text-xs text-[var(--text-3)]">{author}</p>
        <blockquote className="mt-3 border-l border-[var(--closed)] pl-3 text-sm leading-relaxed text-[var(--text-2)]">&ldquo;{quote}&rdquo;</blockquote>
      </div>
    </Pinned>
  );
}
