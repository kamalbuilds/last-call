import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocView } from "@/components/doc-view";
import { docSlugs, getDoc } from "@/lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return docSlugs().filter((s) => s !== "index").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = getDoc((await params).slug);
  return { title: doc ? `${doc.title} | LAST CALL docs` : "LAST CALL docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "index" || getDoc(slug) === null) notFound();
  return <DocView slug={slug} />;
}
