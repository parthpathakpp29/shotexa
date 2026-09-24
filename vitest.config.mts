import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/tests/unit/**/*.test.ts", "src/tests/benchmark/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
