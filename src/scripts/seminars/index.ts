import { renderDashboard, renderWorkspace } from "./member";
import { api, errorMessage, html, loginUrl } from "./shared";

type Session = { signedIn: boolean; email?: string; canReview?: boolean };

const page = document.body.dataset.seminarPage;
const content = document.querySelector<HTMLElement>("[data-page-content]");
const login = document.querySelector<HTMLAnchorElement>("[data-seminar-login]");
if (login) login.href = loginUrl();

const session = api<Session>("/session").then((value) => {
  const account = document.querySelector<HTMLElement>("[data-seminar-account]");
  const operator = document.querySelector<HTMLElement>(
    "[data-seminar-operator]",
  );
  if (login) login.hidden = value.signedIn;
  if (account) account.hidden = !value.signedIn;
  if (operator) operator.hidden = !value.canReview;
  return value;
});

async function renderPage() {
  if (!content) return;
  if (!(await session).signedIn) {
    content.innerHTML = `<div class="seminar-entry"><p>閲覧するにはログインしてください。</p><a class="button" href="${html(loginUrl())}">Googleでログイン</a></div>`;
    return;
  }
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
