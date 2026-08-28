const adminPageNames = [
  "workspace",
  "member-profile",
  "member-tasks",
  "member-calendar",
  "portal",
  "atlas",
  "semi-platform",
  "applications",
  "articles",
  "operations",
  "progress",
  "calendar",
  "genres",
  "manage",
  "review",
  "reports",
  "analytics",
  "editor",
  "guide",
  "rules",
  "introductions",
  "profile-requests",
  "project-profile-requests",
  "secretariat",
  "co-working",
  "permissions",
  "onboarding-demo",
] as const;

export const ADMIN_PAGE_PATHS = adminPageNames.map(
  (name) => `/admin/${name}` as const,
);

const adminPagePathSet = new Set(
  ADMIN_PAGE_PATHS.flatMap((path) => [path, `${path}/`]),
);

export const isAdminPagePath = (pathname: string) =>
  adminPagePathSet.has(pathname);
