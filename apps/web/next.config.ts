import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 writes an AGENTS.md and a CLAUDE.md into the app on first dev boot.
  // Agent instruction files are not framework output; this app does not accept one.
  agentRules: false,
  typescript: { ignoreBuildErrors: false },
  // @fineprint/core ships raw TypeScript from a workspace path, so Next compiles it.
  transpilePackages: ["@fineprint/core"],
  // @fineprint/cost and /exec have no entry point yet and are resolved at runtime by
  // Node instead of being bundled. See lib/packages.ts.
  serverExternalPackages: ["@fineprint/cost", "@fineprint/exec"],
  webpack(config) {
    /*
      @fineprint/core is authored as TypeScript ESM: its `main` is `src/index.ts` and
      its internal specifiers are written the NodeNext way, `export * from
      "./constants.js"`, pointing at files that only exist as `.ts` because the package
      has no emit step. Neither bundler resolves that on its own, so the `.js` to `.ts`
      alias is declared here rather than by editing a package this app does not own.
      Remove this once @fineprint/core builds to `dist`.
    */
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
