import type { Metadata } from "next";
import { HomeClient } from "@/components/home-client";

export const metadata: Metadata = {
  title: "Last call for pre-IPO holders",
};

export default function HomePage(): React.ReactNode {
  return <HomeClient />;
}
