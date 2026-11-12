import {
  phaseLabels,
  recruitmentLabels,
  seminarNumber,
} from "../../lib/seminar-fields";
import { api, html, publicDetails, urlFor, type CatalogItem } from "./shared";

type Membership = { number: number; title: string; isHost: boolean };

export async function renderDetail(content: HTMLElement, signedIn: boolean) {
  const value = new URLSearchParams(location.search).get("number") ?? "";
  if (!/^\d{1,10}$/.test(value))
    throw new Error("ゼミ番号を確認してください。");
  const item = await api<CatalogItem>(`/${Number(value)}`);
  let isMember = false;
  if (signedIn) {
    try {
      const dashboard = await api<{ memberships: Membership[] }>("/dashboard");
      isMember = dashboard.memberships.some(
        (member) => member.number === item.number,
      );
    } catch {
      // 公開詳細は表示し、参加者用の導線だけを省略する。
    }
  }
  document.title = `${item.title} | ゼミプラットフォーム`;
  content.innerHTML = `
    <header class="seminar-page-head">
      <p class="seminar-meta">ゼミ番号 ${seminarNumber(item.number)}</p>
      <h1>${html(item.title)}</h1>
      <p class="seminar-meta">${recruitmentLabels[item.recruitment]} ・ ${phaseLabels[item.phase]}</p>
      ${item.details.theme ? `<p>テーマ：${html(item.details.theme)}</p>` : ""}
      <div class="seminar-actions">
        ${item.acceptingApplications ? `<a class="button" href="${urlFor("join", item.number)}">このゼミに参加申請する</a>` : `<span class="seminar-state">現在、参加申請を受け付けていません。</span>`}
        ${isMember ? `<a class="button button-secondary" href="${urlFor("workspace", item.number)}">参加者用ページを開く</a>` : ""}
        <a class="button button-secondary" href="/seminars/">ゼミ一覧へ</a>
      </div>
    </header>
    <section class="seminar-block" aria-labelledby="public-information-heading">
      <h2 id="public-information-heading">ゼミの情報</h2>
      ${publicDetails(item)}
    </section>`;
}
