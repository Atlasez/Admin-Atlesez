/** Project slugs and navigation sites used by the ADMIN management pages. */
export const adminManagementProjects = {
  atlas: { site: "atlas", label: "学習サイト「アトラス」" },
  secretariat: { site: "secretariat", label: "Atlasez運営事務局" },
  "seminar-platform": { site: "semi-platform", label: "ゼミプラットフォーム" },
  "student-council-exchange": {
    site: "student-council",
    label: "日本生徒会協会",
  },
  "thinking-cafe": { site: "thinking-cafe", label: "考えるカフェ" },
} as const;

/** Unknown or missing projects retain the established atlas fallback. */
export function resolveAdminManagementProject(
  value: string | null | undefined,
) {
  const candidate = value?.trim().toLowerCase() ?? "";
  return Object.prototype.hasOwnProperty.call(
    adminManagementProjects,
    candidate,
  )
    ? (candidate as keyof typeof adminManagementProjects)
    : "atlas";
}
