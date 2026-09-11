const adminPageNames = [
  "workspace",
  "member-profile",
  "member-tasks",
  "member-calendar",
  "portal",
  "action-center",
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
  "student-council",
  "thinking-cafe",
] as const;

export const ADMIN_PAGE_PATHS = adminPageNames.map(
  (name) => `/admin/${name}` as const,
);

const adminPagePathSet = new Set(
  ADMIN_PAGE_PATHS.flatMap((path) => [path, `${path}/`]),
);

// Nested pages stay out of the top-level navigation list while still passing
// through the admin Worker page gate.
const adminNestedPagePathSet = new Set([
  "/admin/editor/outline",
  "/admin/editor/outline/",
  "/admin/member-profile/edit",
  "/admin/member-profile/edit/",
  "/admin/ui-prototype/editor-header",
  "/admin/ui-prototype/editor-header/",
  "/admin/ui-prototype/editor-header-admin",
  "/admin/ui-prototype/editor-header-admin/",
  "/admin/ui-prototype/editor-header-codex",
  "/admin/ui-prototype/editor-header-codex/",
  "/admin/ui-prototype/editor-header-compare",
  "/admin/ui-prototype/editor-header-compare/",
  "/admin/ui-prototype/editor-header-focus",
  "/admin/ui-prototype/editor-header-focus/",
  "/admin/ui-prototype/editor-header-jreast",
  "/admin/ui-prototype/editor-header-jreast/",
  "/admin/ui-prototype/editor-toolbar",
  "/admin/ui-prototype/editor-toolbar/",
  "/admin/ui-prototype/learning-content",
  "/admin/ui-prototype/learning-content/",
]);

export const isAdminPagePath = (pathname: string) =>
  adminPagePathSet.has(pathname) || adminNestedPagePathSet.has(pathname);
