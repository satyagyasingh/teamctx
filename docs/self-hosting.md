# Self-hosting teamctx

This guide takes you from zero to a working teamctx deployment where your
whole team — including non-technical folks — can read role context and
submit updates from a browser.

Everything here is optional. If your whole team uses the `teamctx` CLI, you
don't need any of this — teamctx works fine as a local-only tool backed by
git. Self-host when you have teammates who will only interact through a
browser.

---

## What actually runs where

teamctx is three moving parts. The web layer is small on purpose.

```
  ┌─────────────────────┐        ┌───────────────────────┐
  │  Local CLI          │        │  Private GitHub repo  │
  │  (you, the manager) │──git──▶│  .teamctx/            │
  │  .env.local + key   │◀─pull──│  (source of truth)    │
  └─────────────────────┘        └───────────┬───────────┘
                                             │ auto-deploys on push
                                             ▼
                                 ┌───────────────────────┐
                                 │  Vercel (public web)  │
                                 │  /context/<role>      │
                                 │  /contribute          │
                                 │  /ask                 │
                                 └───────────┬───────────┘
                                             │ URL shared with team
                                             ▼
                                 ┌───────────────────────┐
                                 │  Teammates' browsers  │
                                 └───────────────────────┘
```

- **Local CLI** — you run `teamctx` on your laptop. Commits and pushes go to
  the private repo. Your Anthropic API key lives in `.env.local` here.
- **Private GitHub repo** — the source of truth. `.teamctx/` (config, shared
  context, role files, contribution log, pending inbox) all lives here.
- **Vercel** — three serverless handlers in `api/` that read from the private
  repo and expose it to your team over HTTPS. No database. Vercel needs
  `ANTHROPIC_API_KEY`, and optionally `GITHUB_TOKEN`+`GITHUB_REPO` if you
  want the `/contribute` form to work.

The three endpoints Vercel serves:

| Route | What it does |
|---|---|
| `/context/<role>` | Downloads the role context markdown as a file |
| `/contribute` | HTML form; writes submissions into `.teamctx/pending/` in your private repo via the GitHub API |
| `/ask` | HTML form; runs an AI query against the shared (and optional role) context |

Manager runs `teamctx pull` locally to fetch pending submissions and process
them.

---

## Prerequisites

- **Node 18+** — check with `node --version`.
- **git** — check with `git --version`.
- **[Vercel CLI](https://vercel.com/docs/cli)** — install with
  `npm install -g vercel`.
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com).
- **GitHub account** — free plan is fine; private repos are unlimited.

---

## Setup

### 1. Create a private GitHub repo

Go to [github.com/new](https://github.com/new) and create a new **private**
repository (name it something like `team-context`). Leave "Add a README" and
"Add .gitignore" **unchecked** — the repo must be empty.

Then clone teamctx and point it at your new private repo:

```bash
git clone https://github.com/StatsLateral/teamctx team-context
cd team-context
git remote set-url origin https://github.com/YOUR_USERNAME/team-context
git push -u origin main
```

Replace `YOUR_USERNAME/team-context` with your actual username and repo name.

**Verify:** open your private repo on GitHub — you should see the teamctx
source code and a `main` branch.

### 2. Install and configure locally

```bash
npm install
npm install -g .          # makes `teamctx` available in your shell
```

Add your Anthropic API key to a `.env.local` file (replace the placeholder):

```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env.local
```

This file is gitignored and stays on your machine only.

**Verify:**

```bash
teamctx --version         # should print the version
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.ANTHROPIC_API_KEY ? 'key loaded' : 'MISSING')"
```

### 3. Initialize teamctx

```bash
teamctx init
```

You'll be prompted for:

- **Project name** — shown on the web forms.
- **Your name/handle** — recorded on your contributions.
- **AI model** — accept the default unless you have a reason.
- **Auto-push** — say `y` (this is the whole point in a self-hosted setup).
- **Vercel deploy URL** — leave blank for now; you'll fill it in after step 4.

This creates `.teamctx/` and commits it to your private repo.

**Verify:**

```bash
teamctx status            # should print your project name and role count
git log --oneline -1      # should show the "chore: initialize teamctx" commit
```

### 4. Deploy to Vercel

Link the repo to a new Vercel project:

```bash
vercel link               # follow prompts — create a new project linked to your private repo
```

Set the required env var:

```bash
vercel env add ANTHROPIC_API_KEY production
```

Paste the same key you put in `.env.local` when prompted.

Deploy:

```bash
vercel --prod
```

Copy the production URL from the output — it'll look like
`https://team-context-xyz.vercel.app`.

**Verify:** open the deploy URL in a browser. The root will 404 (there's no
index page), that's fine. Try `/ask` — you should see the ask form.

### 5. Update your config with the deploy URL

```bash
teamctx config deploy-url https://team-context-xyz.vercel.app
```

This is what makes `teamctx role list` and similar commands print the correct
public URLs to share with teammates.

### 6. Enable web contributions (optional)

Only needed if you want the `/contribute` form to work. It writes into your
private repo via the GitHub API, so it needs a token.

Create a **fine-grained personal access token**:
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
Give it access to your private repo only, with **Contents: read+write**.

Add both env vars to Vercel:

```bash
vercel env add GITHUB_TOKEN production   # paste the PAT
vercel env add GITHUB_REPO production    # e.g. YOUR_USERNAME/team-context
```

Redeploy so the new env vars take effect:

```bash
vercel --prod
```

Then pull the env vars down to your local `.env.local` so `teamctx pull` can
read them:

```bash
vercel env pull .env.local
```

⚠️ **Careful:** `vercel env pull` **overwrites** `.env.local`. If you had
other keys in there (custom overrides, other providers), back it up first:
`cp .env.local .env.local.bak && vercel env pull .env.local`, then merge by
hand.

**Verify:** open `<your-deploy-url>/contribute` in a browser and submit a
test entry. Then locally:

```bash
git pull                  # get the new pending file
teamctx pull              # should list your test submission
```

---

## Keeping context current

Every `teamctx contribute` commits and pushes to your private repo. Vercel's
git integration auto-deploys on push, so the role files at
`/context/<role>` are updated within seconds of you running the CLI.

You can verify a fresh deploy landed:

```bash
curl -sI https://your-project.vercel.app/context/YOUR_ROLE | head -1
# HTTP/2 200
```

---

## Troubleshooting

**`.env.local` not picked up** — the CLI loads `.env.local` from the current
working directory. If you're running `teamctx` from somewhere other than the
project root, the key won't load. Either `cd` into the project or set
`ANTHROPIC_API_KEY` in your shell.

**`/context/<role>` returns 404** — either the role doesn't exist (`teamctx
role list` to check), or the role file hasn't been pushed to the branch
Vercel deploys. Run `git push` and wait for the Vercel deploy to finish (~30
seconds).

**`/contribute` submit returns "Failed to save"** — Vercel logs will show
one of:
- *"GITHUB_TOKEN and GITHUB_REPO must be set"* — you skipped step 6, or the
  env vars aren't in the environment your deployment uses (they were only
  added to `production`; if you're testing on a preview URL, add them there
  too).
- *"401" or "403" from GitHub API* — PAT is missing **Contents: read+write**
  on the target repo, or the PAT has expired.
- *"404 Not Found"* — `GITHUB_REPO` is wrong (should be
  `owner/repo`, no leading slash, no `.git` suffix).

**`/ask` returns "AI not configured on this server"** —
`ANTHROPIC_API_KEY` isn't set on Vercel. Add it with
`vercel env add ANTHROPIC_API_KEY production` and redeploy.

**`/ask` returns "teamctx is not initialized on this server"** — the
deployment doesn't include a `.teamctx/` directory. That means you pushed
the code but not the initialized state. Run `teamctx init` locally, commit,
push, and redeploy.

**`teamctx pull` finds nothing but submissions are landing** — pending
submissions land on `main` of the private repo. Run `git pull` first, then
`teamctx pull`.

**Vercel deploy succeeds but changes don't appear** — Vercel deploys only
push to production automatically when your **production branch** on Vercel
matches the branch you're pushing to. Check your Vercel project settings →
Git → Production Branch (default is `main`).

---

## Security model

- **Source + data** (`.teamctx/`) live in your private GitHub repo — only
  visible to you and anyone you invite as a collaborator.
- **Role files** are served publicly at `/context/<role>` — anyone with the
  URL can download them. Treat these URLs as shareable, not secret.
- `contributions.jsonl` and `config.json` are never served by the endpoints;
  they stay on the Vercel filesystem only, readable only by the deployed
  functions.
- The `/contribute` form is public — no login required. The manager reviews
  and approves all submissions via `teamctx pull` before anything is
  integrated into the shared context.
- The `/ask` form is public too — no login required. It only reads context
  to answer questions; it never writes to your repo.

---

## Not using Vercel

The web layer is three serverless handlers in `api/` — `context/[role].js`,
`contribute.js`, and `ask.js`. Any platform that can run Node functions with
read access to the private repo can host them: Cloudflare Pages Functions,
Netlify Functions, a plain Node server, etc.

You'd need to:

- Replicate the routing in `vercel.json` (three rewrites).
- Ensure `.teamctx/` is available at `process.cwd()` at request time (Vercel
  gets this via the git integration; on other platforms you may need to
  clone the private repo at build time).
- Pass `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO` as env vars.

This isn't a supported/tested path yet — but it isn't a heavy port either.
If you get it working, a PR adding your platform's steps to this guide is
welcome.
