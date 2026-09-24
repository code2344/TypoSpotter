import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: {
    __TYPOSPOTTER_VERSION__: JSON.stringify(packageJson.version)
  },
  test: {
    environment: "node"
  }
});
