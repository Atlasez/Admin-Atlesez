import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  base: process.env.BASE_PATH ?? "/",
  srcDir: "./src",
  publicDir: "./public",
  outDir: process.env.OUT_DIR ?? "./dist",
  build: { format: "directory" },
});
