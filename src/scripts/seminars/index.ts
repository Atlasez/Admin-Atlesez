import { renderCatalog } from "./catalog";
import { renderDetail } from "./detail";
import { renderJoinForm, renderProposalForm } from "./forms";
import { renderDashboard, renderWorkspace } from "./member";
import {
  api,
  errorMessage,
  html,
  loginUrl,
  type SeminarSession,
} from "./shared";

const page = document.body.dataset.seminarPage;
const content = document.querySelector<HTMLElement>("[data-page-content]");
const login = document.querySelector<HTMLAnchorElement>("[data-seminar-login]");
if (login) login.href = loginUrl();

const session = api<SeminarSession>("/session")
  .then((value) => {
    const account = document.querySelector<HTMLElement>(
      "[data-seminar-account]",
    );
    const operator = document.querySelector<HTMLElement>(
      "[data-seminar-operator]",
    );
    if (login) login.hidden = value.signedIn;
    if (account) {
      account.hidden = !value.signedIn;
      account.textContent = value.signedIn
        ? `ログイン中${value.email ? `：${value.email}` : ""}`
        : "";
    }
    if (operator) operator.hidden = !value.canReview;
    return value;
  })
  .catch(() => {
    if (login) login.hidden = false;
    const account = document.querySelector<HTMLElement>(
      "[data-seminar-account]",
    );
    if (account) account.hidden = true;
    const operator = document.querySelector<HTMLElement>(
      "[data-seminar-operator]",
    );
    if (operator) operator.hidden = true;
    return { signedIn: false, canReview: false };
  });

async function renderPage() {
  if (!content) return;
  const currentSession = await session;
  if (!currentSession.signedIn && !["catalog", "detail"].includes(page ?? "")) {
    content.innerHTML = `<div class="seminar-entry"><p>閲覧するにはログインしてください。</p><a class="button" href="${html(loginUrl())}">Googleでログイン</a></div>`;
    return;
  }
  if (page === "catalog") return renderCatalog(content);
  if (page === "detail") return renderDetail(content, currentSession.signedIn);
  if (page === "propose") return renderProposalForm(content, currentSession);
  if (page === "join") return renderJoinForm(content, currentSession);
  if (page === "member") return renderDashboard(content);
  if (page === "workspace") {
    await renderWorkspace(content);
    if (location.hash)
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }
}

void renderPage()
  .catch((error) => {
    if (content)
      content.innerHTML = `<p role="alert" class="seminar-error">${html(errorMessage(error))}</p>`;
  })
  .finally(() => content?.removeAttribute("aria-busy"));
