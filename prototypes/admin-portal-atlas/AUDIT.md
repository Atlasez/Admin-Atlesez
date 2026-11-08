# Read-only audit and reference notes

## Scope and source

The prototype is limited to the UI composition of `/admin/portal/` and `/admin/atlas/`. The reference set was captured from the authenticated production UI on 2026-11-09 at 1440×1000, 768×1024, and 390×844. Baseline files are kept outside the repository because the authenticated screenshots contain a member identity. No screenshot with that identity is committed.

During this work, `admin/main` advanced from `5074c1a3` to `9922e9f6`, which removes the portal's マイページ navigation link and squares several portal corners. The captured authenticated page still showed that link and rounded calendar/task surfaces. This prototype follows the captured page reference; the source-versus-live difference is documented here for review and no existing page was changed.

The prototype is standalone: local HTML, CSS, JavaScript, and a copied Atlasez logo. It does not load the Astro app, call ADMIN APIs, read credentials, or write user data. Non-prototype ADMIN links open the current production URL in a new tab for visual reference.

## Impeccable audit

Impeccable's read-only `detect` command was used. The source scan covered the two existing Astro pages and reported that its element-level rules do not run on `.astro` input. The authenticated live page was not available to the CLI; a direct public URL scan returned no findings because it did not have the browser's session. Treat those results as a limited audit rather than proof that the authenticated page has no issues.

Findings were reviewed against `DESIGN.md`, `ADMIN_UI_UX_GOAL_PROMPT.md`, and the live reference screenshots:

| Finding                                                                                                                            | Classification                                                                                           | Disposition                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The portal's hidden `.my-intake` block has a 3px blue left border. The UI goal explicitly flags thick blue side rules.             | Genuine defect in existing source, but the block is hidden and outside this request's static page scope. | No production source change. If that block becomes visible, propose a neutral 1px border as a separate reviewable change.                                                                                                                   |
| Portal summary actions set `outline: 0` on `:focus-visible`.                                                                       | Genuine keyboard focus defect in existing source.                                                        | The prototype uses a 2px focus ring. Existing pages remain untouched.                                                                                                                                                                       |
| The authenticated production Atlas screenshot wraps Japanese function labels in two columns at 390px.                              | Genuine mobile readability defect in the captured interface.                                             | Prototype stacks function tiles at widths ≤520px. The current `admin/main` Astro source already has a one-column rule at this breakpoint, so this also records a live-build/source discrepancy.                                             |
| Project cards use a blue top accent; portal retains five summary metrics; Atlas keeps four categorized horizontal function groups. | Intentional design choices explicitly required by the request.                                           | Preserved.                                                                                                                                                                                                                                  |
| Portal and Atlas H1 sizes exceed `DESIGN.md`'s general 32px maximum.                                                               | Documentation conflict with the approved page reference.                                                 | Keep the reference scale in this preservation-first prototype. Proposed scoped exception: allow the existing page-specific H1 scale on `/admin/portal/` and `/admin/atlas/`; do not change `DESIGN.md` or other pages as part of this work. |
| Screenshots show horizontal top navigation and no permanent sidebar.                                                               | Intentional navigation pattern.                                                                          | Preserved at desktop and tablet; the existing-style menu control exposes the same links on mobile.                                                                                                                                          |

Subjective recommendations to turn tiles into dashboard cards, add a sidebar, reduce heading sizes, or replace the dark neutral palette were rejected because they change approved structure or identity.

## Prototype changes

- Recreated the portal's horizontal ADMIN navigation, page heading and application CTA, first-visit links, five-item metrics strip, grouped project cards, calendar/task columns, and app download footer.
- Recreated Atlas's breadcrumb, heading/back link, and four categorized function groups with the existing 3/4/4/1 tile grouping.
- Kept desktop and tablet category/tile geometry close to the reference. At mobile width, Atlas tiles use one column to avoid clipped or split Japanese words.
- Added visible keyboard focus, reduced-motion support, local mobile navigation, local search, local notification disclosure, and an in-page display-size control. These interactions are prototypes and do not call the ADMIN application.
- Used generic sample account text instead of copying the member name visible in the authenticated reference.

## Not changed

No files under `src/` or `public/` were changed (the one prototype logo is a copied asset under this folder). No live routes, permissions, API contracts, database/schema, authentication behavior, build/deployment configuration, or unrelated page was changed. The prototype is not deployed or merged.
