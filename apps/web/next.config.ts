import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@dejaview/shared"],
  // Types are checked by `npm run typecheck` (tsc) in CI; Next's built-in checker may not support TypeScript 7.
  typescript: { ignoreBuildErrors: true },
};

export default config;
