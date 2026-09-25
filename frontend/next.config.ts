import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  typescript: { ignoreBuildErrors: false },
  // Workspace sources ship raw TypeScript, so Next compiles them.
  transpilePackages: [
    "@fineprint/core",
    "@fineprint/exec",
    "@lastcall/convert",
    "@lastcall/events",
    "@lastcall/holdings",
    "@lastcall/ledger",
    "@lastcall/sponsor",
  ],
  webpack(config) {
    // Internal specifiers are written the NodeNext way (`./x.js` pointing at
    // files that only exist as `.ts` because the packages have no emit step).
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
