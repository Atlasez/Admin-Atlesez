import { readAdminApiJson } from "../lib/admin-api";
type Access = {
  allSubjects: boolean;
  isManager: boolean;
  canEditArticles: boolean;
  subjects: Array<{ id: string; label: string }>;
  coordinatorSubjects: string[];
  isProjectLeader: boolean;
  projects: Array<{
    id: string;
    name: string;
    role: string;
    canManage: boolean;
  }>;
};
const initialize = () => {
  const root = document.querySelector<HTMLElement>("[data-my-access]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const content = root.querySelector<HTMLElement>("[data-my-access-content]")!,
    message = root.querySelector<HTMLOutputElement>(
      "[data-my-access-message]",
    )!,
    retry = root.querySelector<HTMLButtonElement>("[data-my-access-retry]")!;
  const escape = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  const load = async () => {
    retry.disabled = true;
    root.setAttribute("aria-busy", "true");
    message.value = "";
    try {
      const response = await fetch("/api/admin/my-access", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await readAdminApiJson<Access & { error?: string }>(
        response,
        "権限情報を確認できませんでした。",
      );
      if (!response.ok)
        throw new Error(data.error ?? "権限情報を確認できませんでした。");
      content.innerHTML = `<p>${data.isManager ? "全分野管理者です。" : "自分のタスク・予定・プロフィールを管理できます。"}</p><p>記事の担当範囲: ${data.allSubjects ? "全分野" : data.subjects.map((item) => escape(item.label)).join("、") || "担当分野の登録なし"}</p>${data.canEditArticles ? '<a href="/admin/articles/">編集・フィードバックを開く</a>' : ""}${data.coordinatorSubjects.length ? "<p>公開フローの分野統括担当があります。</p>" : ""}${data.isProjectLeader ? "<p>公開フローの最終審査担当です。</p>" : ""}<ul>${data.projects.map((project) => `<li>${escape(project.name)}: ${escape(project.role)}${project.canManage ? ` — <a href="/admin/manage/?project=${encodeURIComponent(project.id)}">管理を開く</a>` : ""}</li>`).join("") || "<li>参加プロジェクトはありません。</li>"}</ul><p>担当・権限の変更は、所属プロジェクトの運営内運営へ相談してください。公開審査の担当設定は記事の編集権限と別に管理されます。</p>`;
      retry.hidden = true;
    } catch (error) {
      content.replaceChildren();
      message.value =
        error instanceof Error
          ? error.message
          : "権限情報を確認できませんでした。";
      retry.hidden = false;
    } finally {
      retry.disabled = false;
      root.setAttribute("aria-busy", "false");
    }
  };
  retry.addEventListener("click", () => void load());
  void load();
};
document.addEventListener("astro:page-load", initialize);
initialize();
