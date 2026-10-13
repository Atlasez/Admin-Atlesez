# ADMIN operations UI prototype

Static before/after prototype for the ADMIN portal and notifications screens. It is not wired into the ADMIN Worker, D1, or the production pages. Fonts, colors, and control styles follow the current light theme in `src/styles/tokens.css`.

## View

From this directory:

```sh
npm install
npm run dev
```

Astro serves `http://127.0.0.1:4331/`.

| Screen                  | URL                      |
| ----------------------- | ------------------------ |
| Index                   | `/`                      |
| Portal, current         | `/portal/before/`        |
| Portal, proposal        | `/portal/after/`         |
| Notifications, current  | `/notifications/before/` |
| Notifications, proposal | `/notifications/after/`  |
| Action center, current  | `/action-center/before/` |
| Action center, proposal | `/action-center/after/`  |

## Check

```sh
npm run check
npm run build
npm test
```

Playwright builds the site, checks the proposal against the current screens, and writes desktop (1280) and mobile (375) screenshots to `screenshots/`.

The proposal keeps 「応募フォームへ」 as the existing primary button. It does not change radius, the menu button chrome, or the 「表示設定」 control style. On viewports at or below 620px, that control and logout move into the existing menu so the header is one row.

The portal notice keeps its blue left border and drops that edge from 3px to 2px, with a lighter fill. The action-center proposal keeps the current dialog fonts and layout. Only the panel surface changes: the same dark base at 78% opacity, a 20px blur with saturation, and a 1px light edge. `prefers-reduced-transparency: reduce` and browsers without `backdrop-filter` use the solid panel color.
