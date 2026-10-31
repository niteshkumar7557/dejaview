import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@dejaview/shared"],
  // Types are checked by `npm run typecheck` (tsc) in CI; Next's built-in checker may not support TypeScript 7.
  typescript: { ignoreBuildErrors: true },
  // packages/shared uses NodeNext-style imports ("./api.js" for api.ts). Webpack's extensionAlias resolves
  // them; Turbopack cannot yet, so dev and build run with --webpack.
  webpack(webpackConfig) {
    webpackConfig.resolve ??= {};
    webpackConfig.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return webpackConfig;
  },
};

export default config;
