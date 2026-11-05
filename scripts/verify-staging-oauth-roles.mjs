import { chromium } from "@playwright/test";
import { createInterface } from "node:readline/promises";

const rawOrigin = process.env.ADMIN_STAGING_BASE_URL;
if (!rawOrigin) {
  throw new Error(
    "Set ADMIN_STAGING_BASE_URL to the exact dedicated atlasez-admin-staging workers.dev origin.",
  );
}

let stagingUrl;
try {
  stagingUrl = new URL(rawOrigin);
} catch {
  throw new Error("ADMIN_STAGING_BASE_URL must be a valid HTTPS origin.");
}

const allowedHost = /^atlasez-admin-staging\.[a-z0-9-]+\.workers\.dev$/i;
if (
  stagingUrl.protocol !== "https:" ||
  stagingUrl.username ||
  stagingUrl.password ||
  stagingUrl.port ||
  stagingUrl.pathname !== "/" ||
  stagingUrl.search ||
  stagingUrl.hash ||
  !allowedHost.test(stagingUrl.hostname)
) {
  throw new Error(
    "Target rejected. Use only the dedicated atlasez-admin-staging.<account>.workers.dev origin; production and custom routes are forbidden.",
  );
}

const origin = stagingUrl.origin;
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error(
    "Run this interactive OAuth check from a dedicated terminal.",
  );
}

const buildResponse = await fetch(`${origin}/build-info.json`, {
  redirect: "error",
});
if (!buildResponse.ok) throw new Error("Could not read staging build-info.");
const buildInfo = await buildResponse.json();
if (buildInfo?.target !== "admin")
  throw new Error("The target does not identify as an ADMIN build.");
console.log(
  `Staging build: target=${buildInfo.target}, commit=${String(buildInfo.commit ?? "unknown")}`,
);

const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const browser = await chromium.launch({ headless: false });
const memberContext = await browser.newContext();
const reviewerContext = await browser.newContext();
const contexts = [memberContext, reviewerContext];

const requestJson = async (context, path) => {
  const response = await context.request.get(`${origin}${path}`, {
    failOnStatusCode: false,
  });
  let payload = null;
  if (response.ok()) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }
  return { status: response.status(), payload };
};

const waitForAuthenticatedStatus = async (context) => {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const result = await requestJson(context, "/api/user/status");
    if (result.status === 200 && typeof result.payload?.email === "string")
      return result;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return requestJson(context, "/api/user/status");
};

try {
  for (const context of contexts) {
    const page = await context.newPage();
    const login = new URL("/auth/google/login", origin);
    login.searchParams.set("returnTo", "/admin/portal/");
    await page.goto(login.href, { waitUntil: "domcontentloaded" });
  }

  console.log(
    "Two isolated browser contexts are open. Complete Google OAuth in each using only the approved synthetic account shown by the Google account chooser. Do not enter credentials in this terminal; no cookies or storage state are saved.",
  );
  await terminal.question(
    "After both logins return to staging, press Enter here. ",
  );

  const memberStatus = await waitForAuthenticatedStatus(memberContext);
  const reviewerStatus = await waitForAuthenticatedStatus(reviewerContext);
  const identitiesAreDistinct =
    typeof memberStatus.payload?.email === "string" &&
    typeof reviewerStatus.payload?.email === "string" &&
    memberStatus.payload?.email?.trim().toLowerCase() !==
      reviewerStatus.payload?.email?.trim().toLowerCase();
  const memberStageIsActive =
    memberStatus.payload?.stage === "MEMBER" &&
    Array.isArray(memberStatus.payload?.applicationProjects) &&
    memberStatus.payload.applicationProjects.includes("atlas");
  const reviewerStageIsActive =
    reviewerStatus.payload?.stage === "MEMBER" &&
    Array.isArray(reviewerStatus.payload?.applicationProjects) &&
    reviewerStatus.payload.applicationProjects.includes("atlas");

  const memberAccess = await requestJson(memberContext, "/api/admin/my-access");
  const memberAtlasCanManage =
    memberAccess.payload?.projects?.find((project) => project.id === "atlas")
      ?.canManage === true;
  const memberIsLeastPrivilege =
    memberAccess.status === 200 &&
    memberAccess.payload?.allSubjects === false &&
    memberAccess.payload?.isManager === false &&
    !memberAtlasCanManage;
  const memberApplications = await memberContext.request.get(
    `${origin}/api/admin/applications?project=atlas`,
    { failOnStatusCode: false },
  );
  const memberApplicationListDenied = memberApplications.status() === 403;

  const reviewerAccess = await requestJson(
    reviewerContext,
    "/api/admin/my-access",
  );
  const reviewerProjects = Array.isArray(reviewerAccess.payload?.projects)
    ? reviewerAccess.payload.projects
    : [];
  const reviewerAtlasCanManage =
    reviewerProjects.find((project) => project.id === "atlas")?.canManage ===
    true;
  const reviewerHasNoOtherManagerProject = reviewerProjects.every(
    (project) => project.id === "atlas" || project.canManage !== true,
  );
  const reviewerIsProjectScoped =
    reviewerAccess.status === 200 &&
    reviewerAccess.payload?.allSubjects === false &&
    reviewerAtlasCanManage &&
    reviewerHasNoOtherManagerProject;
  const reviewerOtherProjectDenied = await reviewerContext.request.get(
    `${origin}/api/admin/applications?project=student-council-exchange`,
    { failOnStatusCode: false },
  );
  const reviewerOtherProjectAccessDenied =
    reviewerOtherProjectDenied.status() === 403;

  const results = {
    memberStatusHttp: memberStatus.status,
    reviewerStatusHttp: reviewerStatus.status,
    memberAuthenticated: memberStatus.status === 200,
    reviewerAuthenticated: reviewerStatus.status === 200,
    identitiesAreDistinct,
    memberStageIsActive,
    reviewerStageIsActive,
    memberIsLeastPrivilege,
    memberApplicationListDenied,
    reviewerIsProjectScoped,
    reviewerOtherProjectAccessDenied,
  };
  console.log(JSON.stringify(results, null, 2));
  if (
    Object.entries(results).some(([key, result]) =>
      key.endsWith("Http") ? result !== 200 : result !== true,
    )
  )
    process.exitCode = 1;
} finally {
  terminal.close();
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
