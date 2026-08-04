var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.ts
var MAX_DETAILS_LENGTH = 6e3;
var MAX_CONTACT_LENGTH = 320;
var MIN_FORM_FILL_MS = 1200;
var MAX_FORM_OPEN_MS = 2 * 60 * 60 * 1e3;
var ALLOWED_REPORT_TYPES = /* @__PURE__ */ new Set([
  "error",
  "suggestion",
  "reference",
  "other"
]);
var json = /* @__PURE__ */ __name((body, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" }
}), "json");
var text = /* @__PURE__ */ __name((value, maximum) => typeof value === "string" ? value.trim().slice(0, maximum) : "", "text");
async function fingerprint(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(fingerprint, "fingerprint");
async function saveArticleReport(request, env) {
  if (request.headers.get("content-type")?.includes("application/json") !== true) {
    return json({ error: "JSON\u5F62\u5F0F\u3067\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 415);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "\u3053\u306E\u9001\u4FE1\u5143\u304B\u3089\u306F\u53D7\u3051\u4ED8\u3051\u3089\u308C\u307E\u305B\u3093\u3002" }, 403);
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "\u5165\u529B\u5185\u5BB9\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" }, 400);
  }
  if (text(payload.website, 200)) return json({ ok: true }, 201);
  const articleTitle = text(payload.articleTitle, 200);
  const articleUrl = text(payload.articleUrl, 2e3);
  const articleId = text(payload.articleId, 200);
  const reportType = text(payload.reportType, 40);
  const details = text(payload.details, MAX_DETAILS_LENGTH);
  const contact = text(payload.contact, MAX_CONTACT_LENGTH);
  const locale = text(payload.locale, 16) || "ja";
  const openedAt = Number(payload.openedAt);
  if (!articleTitle || !articleUrl || !details || !ALLOWED_REPORT_TYPES.has(reportType)) {
    return json({ error: "\u5FC5\u9808\u9805\u76EE\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 400);
  }
  const elapsed = Date.now() - openedAt;
  if (!Number.isFinite(openedAt) || elapsed < MIN_FORM_FILL_MS || elapsed > MAX_FORM_OPEN_MS) {
    return json(
      { error: "\u30D5\u30A9\u30FC\u30E0\u3092\u958B\u3044\u3066\u304B\u3089\u3001\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002" },
      400
    );
  }
  try {
    const target = new URL(articleUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:")
      throw new Error();
  } catch {
    return json({ error: "\u8A18\u4E8BURL\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 400);
  }
  const reporterHash = await fingerprint(
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-forwarded-for") ?? "local"
  );
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1e3).toISOString();
  const todayAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
  const recentHour = await env.REPORTS.prepare(
    "SELECT COUNT(*) AS count FROM article_reports WHERE reporter_hash = ? AND created_at >= ?"
  ).bind(reporterHash, oneHourAgo).first();
  if ((recentHour?.count ?? 0) >= 3) {
    return json(
      {
        error: "\u77ED\u6642\u9593\u3067\u306E\u9001\u4FE1\u56DE\u6570\u304C\u4E0A\u9650\u306B\u9054\u3057\u307E\u3057\u305F\u3002\u6642\u9593\u3092\u304A\u3044\u3066\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002"
      },
      429
    );
  }
  const recentDay = await env.REPORTS.prepare(
    "SELECT COUNT(*) AS count FROM article_reports WHERE reporter_hash = ? AND created_at >= ?"
  ).bind(reporterHash, todayAgo).first();
  if ((recentDay?.count ?? 0) >= 8) {
    return json({ error: "\u672C\u65E5\u306E\u9001\u4FE1\u56DE\u6570\u304C\u4E0A\u9650\u306B\u9054\u3057\u307E\u3057\u305F\u3002" }, 429);
  }
  const contentHash = await fingerprint(
    `${articleId}
${reportType}
${details}`
  );
  const duplicateSince = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1e3
  ).toISOString();
  const duplicate = await env.REPORTS.prepare(
    "SELECT id FROM article_reports WHERE content_hash = ? AND created_at >= ? LIMIT 1"
  ).bind(contentHash, duplicateSince).first();
  if (duplicate) {
    return json({ error: "\u540C\u3058\u5185\u5BB9\u306E\u5831\u544A\u306F\u3059\u3067\u306B\u53D7\u3051\u4ED8\u3051\u3066\u3044\u307E\u3059\u3002" }, 409);
  }
  await env.REPORTS.prepare(
    `INSERT INTO article_reports
      (id, article_title, article_url, article_id, report_type, details, contact, locale, reporter_hash, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    articleTitle,
    articleUrl,
    articleId || null,
    reportType,
    details,
    contact || null,
    locale,
    reporterHash,
    contentHash,
    (/* @__PURE__ */ new Date()).toISOString()
  ).run();
  return json({ ok: true }, 201);
}
__name(saveArticleReport, "saveArticleReport");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/article-reports") {
      if (request.method !== "POST")
        return json({ error: "POST\u306E\u307F\u5229\u7528\u3067\u304D\u307E\u3059\u3002" }, 405);
      return saveArticleReport(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-L7qf2a/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-L7qf2a/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
