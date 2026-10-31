// Vitest looks for test files everywhere in the repository. One of those places is the CPython
// clone the worker keeps in data/, and that clone is not our code: it brings its own browser
// tests, which fail because they need Playwright, which we do not have.
//
// So data/ is excluded. Everything else keeps the normal defaults.

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "data/**"],
  },
});
