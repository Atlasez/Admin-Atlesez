export const APPLICATION_PROJECT_SLUGS = [
  "atlas",
  "thinking-cafe",
  "seminar-platform",
  "student-council-exchange",
  "secretariat",
] as const;

export type ApplicationProjectSlug = (typeof APPLICATION_PROJECT_SLUGS)[number];

const isApplicationProjectSlug = (
  value: string | null | undefined,
): value is ApplicationProjectSlug =>
  typeof value === "string" &&
  (APPLICATION_PROJECT_SLUGS as readonly string[]).includes(value);

/** Supports both the form menu's query URL and public project links. */
export function resolveApplicationProjectSlug(
  pathname: string,
  search: string,
): ApplicationProjectSlug {
  const queryProject = new URLSearchParams(search).get("project");
  if (isApplicationProjectSlug(queryProject)) return queryProject;

  const pathProject = pathname.match(/^\/apply\/([^/]+)\/?$/)?.[1];
  return isApplicationProjectSlug(pathProject) ? pathProject : "atlas";
}
