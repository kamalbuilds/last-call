import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  // Only 400 is used anywhere in the document, so only 400 is fetched.
  weight: ["400"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: ["400"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fineprint.localhost"),
  title: {
    default: "FINEPRINT: the real cost of tokenized pre-IPO stock",
    template: "%s",
  },
  description:
    "Reads the Token-2022 fine print on PreStocks mints: the operative scaled UI multiplier, the uncapped transfer fee and the tier queued to replace it, and the single key that holds every authority. Then prices your size against Forge, EquityZen and Hiive.",
  openGraph: {
    title: "FINEPRINT: the real cost of tokenized pre-IPO stock",
    description:
      "Two of the eight PreStocks mints display wrong to a naive reader, SPACEX by 400% and OPENAI by 48.6%, because the operative scaled UI multiplier is not applied. FINEPRINT reads it from mainnet, times the pending transfer fee increase, and prices your trade against the traditional venues.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${jetbrains.variable}`}>
      <body className={`${newsreader.variable} ${jetbrains.variable} antialiased`}>{children}</body>
    </html>
  );
}
