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

## What does not map, and what to do about it

**1. Identity is typed in, not proven.** The standalone app asks for a name in a
modal (`MeNamePrompt`) and lets the visitor pick their own role from a dropdown;
it remembers both in `localStorage`. teamctx knows who somebody is — GitHub or
Google, matched against the roster.
*Do not port this screen.* Porting it would let any visitor claim any role and
would attribute contributions to a self-declared name. Identity comes from the
session; the role comes from the roster. This is the one place where the UI must
differ, and it differs by deleting a screen, not adding one.

**2. One tree versus two levels.** The standalone app reads a single
`shared.json` and holds exactly one workstream. teamctx has a project tree that
every workstream inherits. The sidebar gains a **project-level entry above the
workstreams**; everything else renders unchanged.

**3. Approve-and-merge versus the review queue.** In the standalone app the
person who contributes reviews their own proposal and merges it. In teamctx the
review policy decides: an add-only contribution may land immediately, anything
else queues for a manager. The proposal screen ports as-is for whoever may apply
the change; for everybody else the same screen says the work was sent for review,
and the manager sees those queued items in the same OpCard rendering.
*This is the largest behavioural difference in the port and the one worth
agreeing on before code is written.*

**4. Writes go through `contributeCore`, not through file PUTs.** The standalone
app writes `shared.json` straight to the GitHub Contents API with a server-side
PAT and guards collisions with a SHA check (`StalenessError`, the staleness
banner). teamctx writes through a session buffer, applies the review policy,
appends provenance and regenerates role files. The staleness banner should be
kept — it is good UX — but wired to a commit conflict rather than a SHA compare.

**5. Model dropdowns.** The standalone app lets the visitor pick a Claude model
per call, with ids that have since been superseded. teamctx resolves a provider
and model from the key saved for the project or the person. Keep the control,
drive it from what the project's key actually supports, and drop the hardcoded
list.

**6. "Reset data".** Clears `localStorage` in a single-user demo. There is no
such thing here — the data is a git repository. Drop the button.

**7. Integrations tiles** (Slack, Drive, OneDrive, Dropbox, Notion, Teams).
Decorative in the original: no code behind them. They can be copied pixel for
pixel, but they will do nothing, and a tile that looks like a connector invites
somebody to click it. Either keep them with a "coming soon" affordance or leave
them out — *your call*.

**8. "+ add workstream".** Hidden in the standalone app whenever it is backed by
GitHub. Creating a workstream in teamctx is a manager action through the CLI or
the assistant. Either keep it hidden, or add a manager-only endpoint — *your
call*, and out of scope until the rest is behaving.

**9. Seed/demo mode** (`?seed=statslateral`, `src/seeds/`). Not portable and not
wanted in a product deployment.

## What teamctx has that the UI has no place for

Copying the interface as-is leaves these with nowhere to appear. They are not
optional extras — they are what teamctx does that the older app did not.

- **Tasks.** Open and done, owner, the compiled prompt a person acts on. The
  standalone app has no concept of a task. The workspace needs a Tasks block, or
  `my_brief` has no home on the web.
- **The manager's queue.** Reviewing other people's contributions, which the
  single-user app never had to show.
- **Members and agents**, scope, lent access, agent tokens — these stay in
  Settings, which this port does not touch.
- **Snapshots.**
- **Decisions as first-class objects**, in flight. The role drawer's "Open
  Decisions (Yours to Make)" is generated by an AI call over the role markdown in
  the standalone app; once decisions are objects, that panel should read them
  instead of asking a model to infer them. The drawer is the natural home.

## What must be there for the port to be honest

1. Identity and role from the session and the roster — never typed in.
2. Scope enforced on the server, so a member's sidebar cannot list a workstream
   they are not on. `readProjectView` already does this; the workspace reads
   through it.
3. Every write through `contributeCore`, so the review policy, provenance and
   role regeneration hold exactly as they do from the CLI and the assistant.
4. A Tasks block, for the reason above.
5. Conflict handling on commit, surfaced as the existing staleness banner.
6. The read-only project page stays until the workspace reaches parity, and the
   route only flips when it does.

## Suggested phasing

| Phase | What lands | Done when |
|---|---|---|
| 0 | Vite build, `index.css` and the components vendored in, served behind `/project/:owner/:repo/workspace` | The page renders with real project data, read-only |
| 1 | Tree (list + columns), contribution log, role drawer, context copy, ask | Parity with the standalone app's read paths |
| 2 | Contribute → proposal → apply or queue, staleness banner | A member and a manager can both contribute, under the policy |
| 3 | Tasks block, the manager's queue in the same rendering | `my_brief` has a home on the web |
| 4 | Route flip: `/project/:owner/:repo` becomes the workspace | Nothing in phases 1–3 is outstanding |

Settings and New project are untouched throughout, and are only revisited once
the workspace has been behaving correctly for long enough to trust it.
