/**
 * Issuer eligibility terms, quoted verbatim from each issuer's own terms page.
 * Pages fetched and wording confirmed on 2026-09-25. Static on purpose: these
 * are legal documents, not chain state, so they are quoted and linked, never paraphrased as fact.
 */
export interface IssuerTerms {
  issuer: "prestocks" | "xstock" | "ondo";
  name: string;
  summary: string;
  url: string;
  /** Each quote with the page it was copied from. */
  quotes: { text: string; source: string }[];
}

export const ISSUER_TERMS: IssuerTerms[] = [
  {
    issuer: "prestocks",
    name: "PreStocks",
    summary: "Not for U.S. persons. A long Prohibited Jurisdictions list, including the United States, Singapore and Russia. Tokens are subject to freezing, forced transfer and burning.",
    url: "https://prestocks.notion.site/terms-of-service",
    quotes: [
      { text: "I am not a U.S. person.", source: "https://prestocks.notion.site/terms-of-service" },
      { text: "The Services are not offered to, and must not be accessed or used by, any person or entity that is a citizen or resident of, incorporated in, or physically located within the following jurisdictions (“Prohibited Jurisdictions”): Afghanistan, Albania, Belarus, [...] Russia, Serbia, Singapore, Somalia, South Sudan, Sudan, Syria, Ukraine (including Crimea and any other region subject to international sanctions), United States, Venezuela, Yemen, and Zimbabwe", source: "https://prestocks.notion.site/terms-of-service" },
      { text: "All blockchain transfers via the Services are secondary transfers effected outside the United States and are not primary offerings to U.S. persons.", source: "https://prestocks.notion.site/terms-of-service" },
      { text: "Tokens are subject to [...] the measures described in Monitoring, Compliance, and Enforcement, including freezing, forced transfer, burning", source: "https://prestocks.notion.site/terms-of-service" },
    ],
  },
  {
    issuer: "xstock",
    name: "xStocks (Backed Finance)",
    summary: "Not registered under the U.S. Securities Act. May not be offered, sold or delivered to U.S. persons.",
    url: "https://xstocks.fi/documents/xstocks-terms-of-service.pdf",
    quotes: [
      { text: "xStocks are not registered under the U.S. Securities Act of 1933 or with any securities regulatory authority of any State or other jurisdiction of the US and (i) may not be offered, sold or delivered within the US to, or for the account or benefit of U.S. Persons, and (ii) may be offered, sold or otherwise delivered at any time only to transferees that are Non-U.S Persons.", source: "https://xstocks.fi/documents/xstocks-terms-of-service.pdf" },
    ],
  },
  {
    issuer: "ondo",
    name: "Ondo Stocks (Ondo Global Markets)",
    summary: "Offered only outside the United States to eligible non-U.S. persons after onboarding. Sanctioned jurisdictions and sanctions-list persons are excluded.",
    url: "https://ondo.finance/ondo-stocks",
    quotes: [
      { text: "Ondo Stocks are offered only outside the United States and only to eligible non-U.S. persons.", source: "https://ondo.finance/ondo-stocks" },
      { text: "you are not a resident, national, or agent of Iran, Cuba, North Korea, Syria, or the Crimean Region of the Ukraine or any other country or jurisdiction to which the United States embargoes goods or imposes similar sanctions", source: "https://docs.ondo.finance/legal/terms-of-service" },
    ],
  },
];
