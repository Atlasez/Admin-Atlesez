#!/usr/bin/env node
/** GitHub Pagesと同じBASE_PATH配下でdistを配信するE2E用静的サーバー。 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 4321);
const base =
  `/${(process.env.BASE_PATH ?? "").replace(/^\/+|\/+$/g, "")}`.replace(
    /^\/$/,
    "",
  );
const root = join(process.cwd(), "dist");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
};

async function resolveFile(pathname) {
  const relative = pathname.slice(base.length).replace(/^\/+/, "");
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root)) return null;
  try {
    const info = await stat(candidate);
    return info.isDirectory() ? join(candidate, "index.html") : candidate;
  } catch {
    if (!extname(candidate)) {
      try {
        await stat(`${candidate}.html`);
        return `${candidate}.html`;
      } catch {
        return null;
      }
    }
    return null;
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (base && url.pathname === base) {
    response.writeHead(308, { location: `${base}/${url.search}` });
    response.end();
    return;
  }
  if (base && !url.pathname.startsWith(`${base}/`)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const file = (await resolveFile(url.pathname)) ?? join(root, "404.html");
  try {
    const body = await readFile(file);
    response.writeHead(file.endsWith("404.html") ? 404 : 200, {
      "content-type": mime[extname(file)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`E2E server: http://127.0.0.1:${port}${base}/`);
});
