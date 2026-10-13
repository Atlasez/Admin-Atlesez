const adminPageNames = [
  "workspace",
  "member-profile",
  "member-tasks",
  "task-detail",
  "task-templates",
  "member-calendar",
  "portal",
  "getting-started",
  "action-center",
  "notifications",
  "atlas",
  "semi-platform",
  "applications",
  "application-interview",
  "articles",
  "operations",
  "progress",
  "calendar",
  "genres",
  "manage",
  "workflow",
  "review",
  "reports",
  "analytics",
  "editor",
  "guide",
  "rules",
  "introductions",
  "procedures",
  "profile-requests",
  "project-profile-requests",
  "publication-runs",
  "secretariat",
  "co-working",
  "permissions",
  "member-management",
  "genre-roles",
  "operations-statistics",
  "developer",
  "audit-log",
  "update-history",
  "onboarding-demo",
  "ui-prototype",
  "portal-prototype",
  "student-council",
  "thinking-cafe",
] as const;

export const ADMIN_PAGE_PATHS = adminPageNames.map(
  (name) => `/admin/${name}` as const,
);

const adminPagePathSet = new Set(
  ADMIN_PAGE_PATHS.flatMap((path) => [path, `${path}/`]),
);

const uiPrototypeNames = [
  "editor-header",
  "editor-header-admin",
  "editor-header-codex",
  "editor-header-compare",
  "editor-header-focus",
  "editor-header-jreast",
  "editor-toolbar",
  "learning-content",
  "welcome-screens",
  "welcome-login",
  "welcome-not-found",
  "welcome-auth-error",
  "welcome-server-error",
  "welcome-logged-out",
  "welcome-operations-error",
] as const;

/** Nested UI prototypes. Full global admins only; not a top-level nav item. */
export const globalAdminPrototypePaths = uiPrototypeNames.flatMap((name) => {
  const path = `/admin/ui-prototype/${name}`;
  return [path, `${path}/`];
});

// Nested pages stay out of the top-level navigation list while still passing
// through the admin Worker page gate.
const adminNestedPagePathSet = new Set([
  "/admin/editor/outline",
  "/admin/editor/outline/",
  "/admin/member-profile/edit",
  "/admin/member-profile/edit/",
  ...globalAdminPrototypePaths,
]);

export const isAdminPagePath = (pathname: string) =>
  adminPagePathSet.has(pathname) || adminNestedPagePathSet.has(pathname);
