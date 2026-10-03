export const ORGANIZATION_CREATOR_LABEL = "Atlasez運営";

export function editorialCreatorName(document: {
  creator_kind?: "person" | "organization";
  created_by?: string;
  created_by_display_name?: string;
}) {
  if (document.creator_kind === "organization")
    return ORGANIZATION_CREATOR_LABEL;
  const name = document.created_by_display_name?.trim();
  if (name) return name;
  const actor = document.created_by?.trim() || "";
  return actor.includes("@")
    ? actor.slice(0, actor.indexOf("@"))
    : actor || "未設定";
}
