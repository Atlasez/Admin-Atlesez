import { createServer } from "node:http";
import { renderTikzSource } from "../src/lib/tikz-renderer.mjs";
import { tikzPackageHelp } from "../src/lib/tikz-policy.mjs";

const port = Number(process.env.TIKZ_RENDERER_PORT || 8788);
const host = process.env.TIKZ_RENDERER_HOST || "127.0.0.1";
const token = process.env.TIKZ_RENDERER_TOKEN?.trim() || "";
const maxBodyBytes = 64_000;

const send = (response, status, body) => {
  const value = JSON.stringify(body);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(value),
  });
  response.end(value);
};

const readJson = (request) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(
          Object.assign(new Error("request too large"), { statusCode: 413 }),
        );
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("invalid json"), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });

const authorized = (request) => {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
};

const server = createServer(async (request, response) => {
  if (!authorized(request))
    return send(response, 401, { error: "認証が必要です。" });
  if (request.method === "GET" && request.url === "/healthz")
    return send(response, 200, { ok: true, renderer: "node-tikzjax" });
  if (request.method === "GET" && request.url === "/packages")
    return send(response, 200, tikzPackageHelp());
  if (request.method !== "POST" || request.url !== "/render")
    return send(response, 404, { error: "Not found" });
  try {
    const payload = await readJson(request);
    const result = await renderTikzSource(payload?.source, {
      packages: payload?.packages,
      libraries: payload?.libraries,
    });
    return send(response, 200, result);
  } catch (error) {
    const status = Number(error?.statusCode) || 422;
    return send(response, status >= 400 && status < 500 ? status : 500, {
      error:
        error instanceof Error
          ? error.message
          : "TikZをSVGに変換できませんでした。",
    });
  }
});

server.listen(port, host, () => {
  console.log(`TikZ renderer listening on http://${host}:${port}`);
});
