import {
  phaseLabels,
  recruitmentLabels,
  seminarFields,
  seminarNumber,
} from "../../lib/seminar-fields";
import { api, errorMessage, html, type CatalogItem } from "./shared";

const results = document.querySelector<HTMLElement>(
  "[data-seminar-catalog-results]",
);
const query = document.querySelector<HTMLInputElement>(
  "[data-seminar-catalog-query]",
);
const count = document.querySelector<HTMLElement>(
  "[data-seminar-catalog-count]",
);

const groups = [
  { status: "open", id: "seminar-open" },
  { status: "paused", id: "seminar-paused" },
  { status: "closed", id: "seminar-closed" },
] as const;

function seminarCard(item: CatalogItem) {
  const theme = item.details.theme?.trim();
  const phase = item.phase === "unknown" ? "" : phaseLabels[item.phase];
  const details = seminarFields
    .filter(({ key }) => item.details[key]?.trim())
    .map(
      ({ key, label }) =>
        `<div><dt>${label}</dt><dd>${html(item.details[key])}</dd></div>`,
    )
    .join("");

  return `<li class="seminar-catalog-card">
    <article class="seminar-catalog-card-body">
      <span class="seminar-catalog-number">ゼミ番号 ${seminarNumber(item.number)}</span>
      <h3>${html(item.title)}</h3>
      ${theme ? `<p class="seminar-catalog-theme">テーマ：${html(theme)}</p>` : ""}
      <span class="seminar-catalog-badges">
        <span class="seminar-catalog-badge">${recruitmentLabels[item.recruitment]}</span>
        ${phase ? `<span class="seminar-catalog-phase">開催状況：${phase}</span>` : ""}
      </span>
      ${details ? `<details class="seminar-catalog-expanded"><summary>内容を確認</summary><dl class="seminar-details">${details}</dl></details>` : ""}
    </article>
  </li>`;
}

function matchesQuery(item: CatalogItem, value: string) {
  if (!value) return true;
  const searchable = [
    item.title,
    seminarNumber(item.number),
    ...Object.values(item.details),
  ]
    .join(" ")
    .toLocaleLowerCase("ja");
  return searchable.includes(value.toLocaleLowerCase("ja"));
}

function renderCatalog(items: CatalogItem[]) {
  if (!results) return;
  const value = query?.value.trim() ?? "";
  const filtered = items.filter((item) => matchesQuery(item, value));
  if (count)
    count.textContent = value
      ? `${filtered.length}件が見つかりました。`
      : `${filtered.length}件のゼミを掲載しています。`;

  results.innerHTML = groups
    .map(({ status, id }) => {
      const entries = filtered.filter((item) => item.recruitment === status);
      const label = recruitmentLabels[status];
      return `<section class="seminar-catalog-group" aria-labelledby="${id}-heading">
        <header class="seminar-catalog-group-heading">
          <h2 id="${id}-heading">${label}</h2>
          <span class="seminar-muted">${entries.length}件</span>
        </header>
        ${
          entries.length
            ? `<ul class="seminar-catalog-list">${entries.map(seminarCard).join("")}</ul>`
            : `<p class="seminar-catalog-empty">該当するゼミはありません。</p>`
        }
      </section>`;
    })
    .join("");
}

if (results) {
  void api<{ seminars: CatalogItem[] }>()
    .then(({ seminars }) => {
      const ordered = [...seminars].sort((a, b) => b.number - a.number);
      renderCatalog(ordered);
      query?.addEventListener("input", () => renderCatalog(ordered));
    })
    .catch((error) => {
      if (count) count.textContent = "";
      results.innerHTML = `<p class="seminar-error" role="alert">${html(errorMessage(error))}</p>`;
    })
    .finally(() => results.removeAttribute("aria-busy"));
}
