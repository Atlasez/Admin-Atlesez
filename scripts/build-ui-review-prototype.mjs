import { access, cp, mkdir, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.env.ATLASEZ_BUILD_TARGET !== "admin") process.exit(0);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prototypeRoot = path.join(
  repositoryRoot,
  "prototypes",
  "admin-ui-review",
);
const prototypeOutput = path.join(prototypeRoot, "dist");
const deployedOutput = path.join(
  repositoryRoot,
  "dist",
  "admin",
  "ui-review-prototype",
);
const prototypeNodeModules = path.join(prototypeRoot, "node_modules");
const rootNodeModules = path.join(repositoryRoot, "node_modules");
const astroCli = path.join(
  repositoryRoot,
  "node_modules",
  "astro",
  "bin",
  "astro.mjs",
);

try {
  await access(path.join(prototypeNodeModules, "astro/tsconfigs/strict.json"));
} catch {
  await access(path.join(rootNodeModules, "astro/tsconfigs/strict.json"));
  try {
    await symlink(
      rootNodeModules,
      prototypeNodeModules,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    await access(
      path.join(prototypeNodeModules, "astro/tsconfigs/strict.json"),
    );
  }
}

const result = spawnSync(process.execPath, [astroCli, "build"], {
  cwd: prototypeRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    BASE_PATH: "/admin/ui-review-prototype/",
    OUT_DIR: "./dist",
  },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

await rm(deployedOutput, { recursive: true, force: true });
await mkdir(path.dirname(deployedOutput), { recursive: true });
await cp(prototypeOutput, deployedOutput, { recursive: true });
console.log(`Built ADMIN UI review prototype at ${deployedOutput}`);
