import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Local runs read PYTH_API_KEY from the repo-root .env; hosted builds set it in their own env.
if (process.env.PYTH_API_KEY === undefined && existsSync("../.env")) {
  const key = parseEnv(readFileSync("../.env", "utf8")).PYTH_API_KEY;
  if (key !== undefined) process.env.PYTH_API_KEY = key;
}

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
    "@lastcall/pyth",
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
