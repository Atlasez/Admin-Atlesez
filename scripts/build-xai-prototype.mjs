import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.env.ATLASEZ_BUILD_TARGET !== "admin") process.exit(0);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prototypeRoot = path.join(repositoryRoot, "prototypes", "xai");
const prototypeOutput = path.join(prototypeRoot, "dist");
const deployedOutput = path.join(repositoryRoot, "dist", "xai-prototype");
const astroCli = path.join(
  repositoryRoot,
  "node_modules",
  "astro",
  "bin",
  "astro.mjs",
);

const result = spawnSync(process.execPath, [astroCli, "build"], {
  cwd: prototypeRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    BASE_PATH: "/xai-prototype/",
    OUT_DIR: "./dist",
  },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

await rm(deployedOutput, { recursive: true, force: true });
await mkdir(path.dirname(deployedOutput), { recursive: true });
await cp(prototypeOutput, deployedOutput, { recursive: true });
console.log(`Built independent xAI prototype at ${deployedOutput}`);
