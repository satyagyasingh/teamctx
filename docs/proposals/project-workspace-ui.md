# Proposal: the project workspace, ported from the standalone UI

**Status:** Proposed — mapping only, nothing built · **Serves:** Managers and members
who open a project on the web · **Depends on:** the read-only project view (#101),
one sign-in screen (`fix/consistent-signin`)

The standalone app at `git-for-non-tech-teams` (Vite 6 + React 19, `src/App.jsx`
1,848 lines, `src/index.css` 961 lines) is the interface this product is meant to
have. It was built against an older teamctx and its own data plane. The ask is to
bring that interface over **as it is** — the same markup, the same stylesheet, the
same interactions — so that a person lands on their project list, opens a project,
and can do there everything the standalone app offers.

Settings and New project are not touched. They keep working as they do until the
ported workspace is behaving correctly, and only then is anything retired.

This document maps every piece of that interface onto what teamctx can back today,
names what it cannot back, and lists what has to be added for the port to be
honest rather than a shell.

## The one decision that shapes everything else

The standalone app is a client-side React bundle. teamctx's web layer is HTML
strings assembled in `api/oauth-server.js` — no build step, no bundler, no client
JavaScript anywhere in the repository today.

**Recommendation: bring the React app over as a built bundle, and do not re-type
its screens as server-rendered HTML.** Half of what is being asked for is
behaviour that only exists on the client — the ask panel sliding in, the role
drawer, the list/columns toggle, click-to-explain, the proposal review, the
expanding log rows. Re-implementing those against server-rendered pages means
writing a second, hand-rolled front end that will drift from the original, which
is the thing this port exists to avoid. Vite's output is static files: it adds a
build step, but it costs **no serverless functions**.

The page that serves it stays server-rendered and session-authenticated, so the
bundle never sees a token: teamctx mints the session, the page boots the app with
the project it is allowed to read.

### The objections, and why none of them hold

Three things argue for re-typing the screens as server-rendered HTML instead.
None survives contact with this repository.

- **"It would bloat the CLI."** It would not. `files` in `package.json`
  whitelists `cli`, `src` and `mcp`. React and Vite are devDependencies, the
  bundle lives outside that list, and `npm i -g teamctx` is unchanged.
- **"It needs a second test harness."** Both repositories are on vitest 2.1.9.
  The standalone app's tests port as they are, jsdom is a per-file
  `@vitest-environment` annotation, and the 1,835 server tests are untouched.
- **"The browser would hold a token."** It would not. The app calls teamctx's own
  endpoints with the session cookie; GitHub tokens stay server-side exactly as
  they are today.

What is left against it is a build step and two idioms in one repository until
Settings moves — a preference, not a requirement. What is left for it is that the
interface arrives identical by construction rather than by transcription.
Re-typing roughly 650 lines of JSX as template strings costs about twice the new
code, needs a route, a handler and tests for every interaction the app does in
place, and still cannot promise the same feel: a round trip loses scroll, focus
and panel state.

## Serverless budget

Vercel Hobby allows 12 functions per deployment. teamctx deploys 5 today
(`ask`, `context/[role]`, `contribute`, `mcp/[owner]/[repo]`, `oauth-server`).

The standalone app carries 6 of its own (`claude`, `github`, `role-apply`,
`role-contribute`, `role-prompt`, `role-propose`). Porting them one for one puts
the deployment at 11 — inside the cap, but with no room, and each of them assumes
a single repository configured by environment variable.

**Recommendation: one new function, `api/project/[owner]/[repo].js`, with an
`action` parameter**, the way `api/github.js` already works in the standalone app.
Everything the workspace needs is a read or a write against one project the caller
is already authorised for, and one function keeps the budget at 6 of 12.

## What maps cleanly

| In the standalone UI | Backed in teamctx by | Notes |
|---|---|---|
| Header: title, repo chip, **Ask** | `readProjectView` project/owner/repo | Chip becomes the project name |
| Sidebar: workstream list | `listAllWorkstreams`, scoped by `scopeFor`/`inScope` | teamctx has many workstreams natively; the standalone app only ever had one |
| Sidebar: `merged·total` counts | `contributions.jsonl`, grouped by `workstream` | Each record already carries its workstream |
| Sidebar: member chips per workstream | `config.members` + `membersOn` | Already computed for the read-only page |
| Sidebar footer: "signed in as …", Admin tag | The session, `managerKeys`/`matchesActor` | Real identity, not a typed name |
| Context tree: list view, column view | `readTree` per workstream | Direct |
| Click-to-explain on a statement | `api/ask.js` | Same grounded call |
| Ask panel + answer | `api/ask.js` | Direct |
| Contribute box → typed diff | `contributeCore` | Returns `{summary, operations}` in the same shape |
| Proposal review, OpCard diff | The operations from `contributeCore` | Rendering ports unchanged |
| Contribution log, expanding rows | `readContributions` | Direct; teamctx records author, source and `tagged` |
| "Bring your team context to Claude / ChatGPT / Gemini" | Compiled role context | Clipboard only, no backend |
| Your role drawer: role details | `config.roles` | Direct |
| Role page `/context/:slug` | `api/context/[role].js` | Exists, but serves a markdown **download**; the port needs it rendered |
| "No roles defined" screen | Project with an empty `roles` | Direct |

## What does not map, and the answer for each

Every mismatch below has one rule applied to it: **solve it inside a slot the
interface already has.** A workstream row, a modal, a block in the main column, a
button label — reuse the component, change what fills it. Nothing here asks for a
screen the standalone app does not already draw, because the moment we invent one
the port stops being the same product.

### 1. Identity is typed in, not proven

`MeNamePrompt` asks for a name and lets the visitor pick their own role from a
dropdown, then keeps both in `localStorage`. Ported as-is, anyone could claim any
role and contributions would carry a self-declared name.

**Solution.** The server boots the app with `me = { name, role, isManager }` taken
from the session and the roster, so the modal has nothing to ask and never opens.
Its two states are already answered elsewhere: not signed in is the sign-in screen
we just built, and no role yet becomes the existing `NoRolesScreen` with its text
changed to "your manager has not given you a role yet" — same component, same
placement. The sidebar footer keeps rendering `signed in as {me}` exactly as it
does; the string now comes from the session. The name is never editable in the
workspace: it is the roster's, and changing it is a manager action.

### 2. One tree, where teamctx has two levels

The standalone app holds a single workstream read from `shared.json`.

**Solution.** The project becomes the **first row of the existing sidebar list**,
drawn with the same `ws-item` markup and carrying the project's name, with the
`admin-tag` style reused as a small "project" marker. Selecting it renders
`project.json` through the same `TreeView`/`ColumnView`. Inheritance — a
workstream showing the project context above its own — already has a home: the
**context drawer**, which exists to show the compiled view a person hands to their
assistant. No new component, and the two-level model stops being invisible.

### 3. Self-approval, where teamctx has a review policy

There, the contributor reviews their own proposal and merges it. Here
`needsReview` decides: add-only work may land immediately, anything else queues
for a manager.

**Solution.** `contributeCore` already returns `willQueue` — the UI reads it
rather than guessing. The same `ProposalReview` renders either way; only the
primary button's label changes, "approve & merge" or "send for review", with the
secondary staying "reject (keep logged)". For the manager, pending items from
other people render as a **stack of the same `ProposalReview` cards** in the block
where a proposal already appears, above the contribute box, fed by
`listPendingReviews` and cleared through `approveReview`/`rejectReview`. The
sidebar row for a workstream with items waiting gains a count in the `counts`
span it already has. The queue arrives without a single new screen.

### 4. Writes go direct to GitHub, with a SHA guard

The standalone app PUTs `shared.json` through the Contents API using a
server-side PAT, and compares SHAs to catch a teammate who wrote first
(`StalenessError` → the staleness banner).

**Solution.** One endpoint, `api/project/[owner]/[repo].js`, runs `contributeCore`
inside a `GithubSession` — the same path the MCP server uses, so the review
policy, provenance and role regeneration hold exactly as they do from the CLI.
The client keeps sending the revision it last saw; the server compares it against
the head of `.teamctx/` before committing and answers 409 on a mismatch. **Keep
the staleness banner and its refresh-in-place behaviour** — it is good UX and the
trigger is the only thing that changes.

### 5. Model dropdowns, with superseded ids

The picker offers `claude-opus-4-8` and friends, chosen per call.

**Solution.** Keep the `model-picker` markup in both places it appears. The
server fills its options from the provider the project's key actually resolves to,
with the project default pre-selected. One available model means a select with one
option — same control, honest contents — and when multi-provider support lands
(`docs/proposals/provider-agnostic-ai.md`) the list grows on its own.

### 6. "Reset data"

Clears `localStorage` in a single-user demo. Against a git repository it has no
meaning, and a two-tap destructive button next to real data is worse than absent.

**Solution.** Drop the button, keep the footer row that holds it — it already
carries `signed in as …`. For a manager the freed space takes a quiet link to
Settings, which is the only place that shape of action belongs.

### 7. Integrations tiles that do nothing

Slack, Drive, OneDrive, Dropbox, Notion, Teams — decorative in the original, with
no code behind them.

**Solution.** Keep them; they are part of the look, and they are not fiction —
each has a proposal in this directory (`import-slack.md`, `import-notion.md`,
`import-gdrive.md`, `import-dropbox.md`, `import-m365.md`, `import-coda.md`).
Render them greyed and non-interactive with "not connected yet" on hover, and let
a tile light up when its connector ships. This is the rule the sign-in screen now
follows: a thing that cannot be used stays visible and says why.

### 8. "+ add workstream", hidden whenever GitHub backs the app

**Solution.** Show it to managers, hide it from everyone else — the same
condition the sidebar already uses for admin-only chrome. It opens the existing
`AddLaneModal` unchanged and calls `useWorkstream`, which is the path the CLI and
the assistant already take. For a member the button stays hidden, exactly as it is
today.

### 9. Seed and demo mode

`?seed=statslateral` and `src/seeds/` exist to fill an empty localStorage.

**Solution.** Drop both. A project that is genuinely empty already has a better
answer in teamctx: the founding contribution reads the tree back once it lands.

### 10. There is no project list to copy

The standalone app was one deployment pointed at one repository, so it never drew
a list of projects. The screen the port starts from does not exist in the source.

**Solution.** Compose it from the components that do. The list is the sidebar's
`ws-item` row lifted into a single column on `paper` — name, the `counts` span,
member `team-chip`s — inside the same `card`. Nothing invented, and a person
moving from the list into a project sees the row they clicked become the row in
the sidebar.

### 11. Two visual systems, one product

The workspace brings paper, Fraunces and a teal accent. Settings, New project and
the sign-in screen are the current shell: system fonts, the bar nav. Somebody
crossing between them sees two products.

**Solution.** Accept the seam for now, deliberately and in one direction: the
workspace keeps its own header and sidebar and links back to Settings, and the two
are never mixed inside one page. Settings is explicitly out of scope until the
workspace is behaving correctly — at which point the same tokens and fonts move
into `shell()` and the seam closes in one change rather than in pieces.

### 12. The role page is a download, not a page

`api/context/[role].js` returns the role markdown as a file attachment, which the
CLI and the docs rely on.

**Solution.** Leave it alone. The ported `RolePage` mounts at
`/project/:owner/:repo/role/:slug`, where it has the project context it needs
anyway. Nothing that depends on the download changes.

## What teamctx has that the interface has no slot for

These are not extras — they are what teamctx does that the older app did not, and
each needs a home before the workspace can replace the read-only page.

### Tasks

The standalone app has no concept of a task, so `my_brief` — arguably the thing a
member opens the web for — would have nowhere to appear.

**Solution.** One more `block` in the main column, below Context, drawn with the
existing `log` / `log-row` markup: an expanding row per task with the `chip` for
its workstream, the owner beside it, and the `status` span the log already styles
for merged and logged. A member's own tasks sort first. `listTasksFiltered`,
`setTaskStatus` and `assignTask` back it; `compileTask` fills the expanded body
with the prompt a person actually acts on.

### The manager's queue

Covered in §3 — the same `ProposalReview` card, stacked.

### Snapshots

No slot, and forcing one would cost a screen the port does not have.

**Solution.** Out of scope for this port; they stay in the CLI and the assistant.
When they do come to the web, the header's repo chip is the natural place for a
"viewing: current / a snapshot" control, beside the project name.

### Decisions

The role drawer's "Open Decisions (Yours to Make)" is an AI call over the role
markdown in the standalone app — inferred, not recorded.

**Solution.** Ship the panel as it is, so the UI is complete, and re-point it at
the decision objects when they land; the drawer keeps its markup either way. It is
the natural home for them, and the work is already on the roadmap.

## What must be there for the port to be honest

1. Identity and role from the session and the roster — never typed in.
2. Scope enforced on the server, so a member's sidebar cannot list a workstream
   they are not on. `readProjectView` already does this; the workspace reads
   through it.
3. Every write through `contributeCore`, so the review policy, provenance and
   role regeneration hold exactly as they do from the CLI and the assistant.
4. A Tasks block, for the reason above.
5. Conflict handling on commit, surfaced as the existing staleness banner.
6. The read-only project page is replaced, not kept beside the workspace. Its
   data function, `readProjectView`, is what the workspace reads through, so the
   scope rules it already enforces come with it.

## Build order

Nothing here is a staged rollout. There are no users yet, so the branch is built
to done and deployed once — the order below is what depends on what, not a
schedule of releases.

| Step | What lands |
|---|---|
| 1 | Vite build wired into the deployment, `index.css` and the components vendored, the workspace booting on real project data at `/project/:owner/:repo` |
| 2 | Read paths: tree in both views, contribution log, role drawer, context copy, ask |
| 3 | Write path: contribute, the proposal card, apply or queue by policy, the staleness banner on a commit conflict |
| 4 | What the interface had no slot for: the tasks block, the manager's queue as stacked proposal cards, the project row above the workstreams |
| 5 | The project list rebuilt in the same visual language, and the read-only page retired |

Settings and New project are untouched throughout — not out of caution, but
because they are the one part of the web layer that already works and is not
being redesigned here. Once the workspace is built, they port into it page by
page, and the two-visual-systems seam (§11) closes with them.
