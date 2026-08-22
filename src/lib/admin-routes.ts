const adminPageNames = [
  "workspace",
  "portal",
  "atlas",
  "semi-platform",
  "applications",
  "articles",
  "operations",
  "calendar",
  "genres",
  "manage",
  "review",
  "reports",
  "editor",
  "guide",
  "introductions",
  "secretariat",
  "co-working",
  "permissions",
] as const;

export const ADMIN_PAGE_PATHS = adminPageNames.map(
  (name) => `/admin/${name}` as const,
);

const adminPagePathSet = new Set(
  ADMIN_PAGE_PATHS.flatMap((path) => [path, `${path}/`]),
);

export const isAdminPagePath = (pathname: string) =>
  adminPagePathSet.has(pathname);
