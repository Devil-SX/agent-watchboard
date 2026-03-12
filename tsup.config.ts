import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "main/supervisor/server": "src/main/supervisor/server.ts",
    "cli/todo-preview": "src/cli/todo-preview.ts",
    "cli/watchboard": "src/cli/watchboard.ts",
  },
  outDir: "dist-node",
  sourcemap: true,
  format: ["cjs"],
  target: "node22",
  splitting: false,
  clean: true,
  dts: false,
  external: ["node-pty"],
  noExternal: ["chokidar", "commander", "uuid", "ws", "zod"],
  outExtension() {
    return {
      js: ".cjs",
    };
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
