import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Last call for pre-IPO holders",
  description:
    "PreStocks pre-IPO tokens must be converted into the public stock token before the deadline or they expire worthless.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
