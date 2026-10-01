import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's "@/*" path alias. Node environment is enough for
// everything under test here: pure calculation modules, repository
// functions in mock mode, and route handlers (Next's Request/Response are
// standard web APIs, available globally in Node 20+, no DOM needed).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
