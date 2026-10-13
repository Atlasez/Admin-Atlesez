import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  base: process.env.BASE_PATH ?? "/",
  srcDir: "./src",
  publicDir: "./public",
  outDir: process.env.OUT_DIR ?? "./dist",
  build: { format: "directory" },
  server: { host: "127.0.0.1", port: 4331 },
  vite: {
    tsconfig: false,
    build: {
      // Keep the required space in `blur(20px) saturate(1.4)`. Lightning CSS
      // drops it, and the declaration is then invalid.
      cssMinify: false,
      rolldownOptions: {
        tsconfig: false,
      },
    },
  },
});
