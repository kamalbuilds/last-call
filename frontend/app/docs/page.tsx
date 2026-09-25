import type { Metadata } from "next";
import { DocView } from "@/components/doc-view";

export const metadata: Metadata = { title: "Docs | LAST CALL" };

export default function DocsIndex() {
  return <DocView slug="index" />;
}
