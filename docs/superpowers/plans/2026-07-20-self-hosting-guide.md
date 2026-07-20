# Plan: Self-hosting guide

**Branch:** `feat/self-hosting-guide` (off `main`, no code dependencies)
**Roadmap:** "Later" — infrastructure enablement
**PR shape:** Single docs-only PR.

---

## Goal

Make it painless for someone who is *not* a teamctx contributor to stand up
their own teamctx (CLI + Vercel web layer) end-to-end without hitting
undocumented friction.

Today the top-level README has a "Self-hosting (web layer)" section with six
setup steps. It's enough to skim but thin: no troubleshooting, no verification
steps, no "here's how you know it worked" between steps, no diagram of what
runs where. That's the gap.

## In scope (this PR)

- New `docs/self-hosting.md` — the full guide. Long-form is fine; this doc
  exists to be linked to and read once.
- README's existing "Self-hosting (web layer)" section gets trimmed to a
  short summary + link to `docs/self-hosting.md`. Keep the routes list and
  the security-model bullets on the README (they're useful at a glance);
  move the 6-step setup into the guide.
- CHANGELOG entry under `[Unreleased] Added`.

Content of the new guide, in order:

1. **What Vercel actually hosts** — one paragraph + a small
   ASCII/mermaid diagram of Local CLI ↔ private GitHub repo ↔ Vercel ↔
   teammates. Grounds the reader.
2. **When you need self-hosting (and when you don't)** — one paragraph.
   Vercel is optional; it's for teams with non-CLI users.
3. **Prerequisites** — Node 18+, git, Vercel CLI, Anthropic API key,
   GitHub account. Same as today, but with links to install pages.
4. **Setup, step by step** — same six steps as the README today, plus:
   - Expected output at each step (so the reader knows if something's off).
   - A one-liner **verification** after each step (`teamctx status`,
     `curl <deploy-url>/context/<role>`, etc.).
   - Placeholder markers in copy-paste blocks (`YOUR_USERNAME`,
     `sk-ant-your-key-here`).
5. **Troubleshooting** — the failure modes that are foreseeable from the
   code (grounded, not speculative):
   - `.env.local` not picked up (wrong CWD).
   - `/context/<role>` returns 404 → role file not generated / not pushed
     to the branch Vercel deploys.
   - `/contribute` submit returns 500 → `GITHUB_TOKEN` or `GITHUB_REPO`
     missing on Vercel, or PAT scopes wrong (needs Contents: read+write).
   - `/ask` returns 500 → `ANTHROPIC_API_KEY` missing on Vercel.
   - `teamctx pull` finds nothing → pending submissions land on `main`
     of the private repo; verify commits arrived (`git pull` first).
   - `vercel env pull .env.local` overwriting an existing key — how to
     merge, not clobber.
6. **Security model** — the same 5 bullets that are in the README today,
   kept verbatim so nothing is lost in the trim.
7. **What to change if you don't want Vercel** — one short paragraph:
   the web layer is 3 serverless handlers in `api/`; anything that runs
   Node functions with git-repo access can host them. Not a full port
   guide, just an honest "here's the door".

## Out of scope

- **Docker/Kubernetes recipes.** Would need to be written and tested;
  separate PR if there's demand.
- **Cloudflare Pages / Netlify / self-hosted Node port.** Same reason —
  speculative until someone tries it.
- **Automated setup script.** `setup` command already exists for the
  GitHub-repo-creation half; automating the Vercel half is its own PR.
- **Screenshots.** Nice-to-have; add later if the text alone isn't clear.
- **Video walkthrough.**

## File-by-file plan

1. `docs/self-hosting.md` — new file with the seven sections above.
2. `README.md` — replace the current 6-step block with a short summary
   pointing to the guide. Keep the routes list and security bullets on
   the README as at-a-glance context.
3. `CHANGELOG.md` — one entry under `[Unreleased] Added`.

## Commit-by-commit breakdown

Small, reviewable commits. All DCO signed-off, single author.

1. `docs: add self-hosting guide with setup, verification, troubleshooting`
2. `docs: trim README self-hosting section, link to full guide`
3. `docs: CHANGELOG entry for self-hosting guide`

## Testing plan

Docs-only PR — no automated tests. Manual verification:

- Every command in the guide runs without syntax error (dry-check).
- All links (README → guide, guide → external docs) resolve.
- Verification one-liners actually produce meaningful output (checked
  against the real CLI on this machine where possible).
- Full test suite still green (should be untouched — sanity check).

## Success criteria

- Someone who has never used teamctx can follow `docs/self-hosting.md` and
  end up with a working `/context/<role>` URL — without needing to read
  source code or ask a question.
- The README's self-hosting section stays scannable (short, links out).
- The troubleshooting section covers the actual foreseeable failures, not
  invented ones. If a real user hits a new failure, it becomes a follow-up
  PR to the guide.
