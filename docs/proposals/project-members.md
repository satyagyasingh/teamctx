# Proposal: project members

**Status:** Proposal (suggestion, not committed) · **Serves:** Managers in control ·
**Rough size:** Small–Medium — phases 1 and 2 are contained; phase 3 is deferred

## Problem

A teamctx project has a manager and, implicitly, everyone with a git clone. It
has no idea who is on the team.

That shows up in three places. Contributions carry whatever `git config
user.name` says, so a name that has never been agreed becomes the record.
Task ownership is a free-text string, so `--owner "Bhumika"` and `--owner
"bhumika"` are two different people. And there is no way for a manager to say
"these five are on this project" — which is the first thing anyone setting up a
team wants to do.

Adding someone to a teamctx project today means telling them to clone the repo.

## Scope of this proposal

**Phase 1 — a members roster, and honest commit attribution.**
**Phase 2 — optionally inviting a member as a GitHub collaborator.**

**Phase 3 — members who are *not* GitHub collaborators — is deliberately out.**
It needs a project-level credential and changes teamctx's security posture; it
is discussed at the end so the decision is recorded, not so it is built.

## What the research settled

**A repo collaborator invite takes a GitHub username, never an email.**
[`PUT /repos/{owner}/{repo}/collaborators/{username}`](https://docs.github.com/en/rest/collaborators/collaborators)
accepts a handle only, and creates an invitation the person must accept. So an
email can never become a GitHub invite. It can only be a teamctx-side identity.

**`gh` already carries the scope needed.** `teamctx setup` shells out to `gh`,
and a normal `gh auth login` yields `repo` — which is what the collaborator
endpoint requires. The CLI path needs no new OAuth work at all.

**The hosted OAuth already requests `repo`** (`src/oauth/provider.test.js`
asserts it), so the hosted path has the scope too.

**Commit attribution is already reachable.** `src/adapters/github.js` builds
its commit as `{ message, tree, parents }`. The Git Data API also accepts
`author` and `committer` as *separate* fields. Setting `author` to the acting
person while the token supplies the committer is the whole of the attribution
problem, and it is a few lines rather than an architecture.

## Phase 1 — members and attribution

### The record

`config.json` gains a `members` array:

```json
{
  "key": "github:1001",
  "name": "Priya Raman",
  "login": "priyar",
  "email": null,
  "addedBy": "github:44",
  "addedAt": "2026-08-25"
}
```

`key` is the same actor key `src/actor.js` already produces — `github:<id>`,
`git:<email>` or `name:<me>`. Reusing it means a member joins up with the
contributions they have already made, and with the `authorKey` grouping that
`teamctx stats` uses. A new identity scheme would fragment both.

### Members are project-wide

Not per-workstream. Workstreams are a view over one context tree in one repo —
anyone who can read the repo can read every workstream, so per-workstream
membership would be a label that enforces nothing. If a real need for scoping
appears later it belongs with roles, which already bind to a workstream.

### Commands

```
teamctx member add <username|email> [--name "…"] [--invite]
teamctx member list
teamctx member rm <key|login|email>
```

**Manager-gated**, via the existing `assertManager` in `review.core.js`. The
roster is who a manager says is on the team; that is exactly the kind of thing
the gate exists for.

MCP: `list_members` (Tier 0), `member_add` and `member_rm` (Tier 2 — they are
gated and change who the project recognises).

### Attribution

`GithubSession.commit()` gains an `author` derived from the acting actor:

```js
author: { name: actor.name, email: emailFor(actor), date: new Date().toISOString() }
```

GitHub needs an email to attribute a commit to an account. For a member with a
`login` the `<id>+<login>@users.noreply.github.com` form is the right one — it
attributes correctly without exposing a private address. For a member added by
email, use it directly.

The local CLI needs nothing: git already records the committer from the clone's
own config.

## Phase 2 — inviting a collaborator

`teamctx member add <username> --invite` also calls the collaborator endpoint.

| Surface | How |
| --- | --- |
| CLI | `gh api -X PUT repos/{owner}/{repo}/collaborators/{login}` — `gh` is already a dependency of `setup` |
| Hosted MCP | the caller's OAuth token, which already carries `repo` |

Three things the implementation has to get right:

- **`--invite` requires a username.** A member added by email cannot be
  invited, and the command should say that rather than fail inside the API
  call.
- **The invite is asynchronous.** It creates an invitation the person must
  accept; the member is *not* a collaborator until they do. `member list`
  should report `invited` distinctly from `collaborator`.
- **Adding the member and inviting them are separate failures.** If the roster
  write succeeds and the invite fails — no `gh`, wrong scope, not an admin of
  the repo — the member should still be added, with the invite reported as
  failed. Rolling back a roster entry because GitHub was unavailable would be
  the wrong trade.

`member add` without `--invite` stays the default. Inviting someone to a
repository is a bigger act than noting them on a roster and should be asked
for.

## Phase 3 — non-collaborator members (deferred)

Recorded because the decision matters, not because it is being built.

The idea is that a member who is *not* a GitHub collaborator still works,
using the manager's credentials for reads and writes while commits attribute
the member.

**Locally this is already true and needs nothing.** A member with a clone uses
their own git; teamctx is not in the credential path at all.

**Hosted, it does not work and cannot without a stored credential.** A session
is built from the caller's own GitHub token; a non-collaborator's token cannot
read a private repo, so there is no session to build. Making it work means
holding a `repo`-scoped credential for the project server-side and using it for
anyone the roster names.

That inverts a property teamctx currently has. The manager gate was hardened
so `review_approve` reads only the authenticated actor and accepts no claimed
identity. If member writes run on a stored manager token, then whoever can edit
`members` in `config.json` — a file in the repo — can write as the manager. The
blast radius is bounded, since members can queue contributions but not approve
them, but it is a real change and should be chosen rather than arrived at.

If it is wanted, the credential should be a **GitHub App installation token**
rather than a stored personal token: scoped to the one repo, short-lived,
revocable from repo settings, and it survives the manager leaving. An OAuth
App's `repo` scope is all-or-nothing across every repository the user can
reach, which is far more authority than this needs.

## Out of scope

- Per-workstream membership (see above).
- Removing a GitHub collaborator. `member rm` takes someone off the roster; it
  does not touch repo access, and conflating the two would make a bookkeeping
  command destructive.
- Roles. A member is a person; a role is a lens on the context. They are
  different things and joining them would make both harder to change.

## Where to start

- `cli/commands/review.core.js` — `assertManager`, and the typed-error pattern
- `cli/commands/task.core.js` — the most recent core/presentation split
- `src/actor.js` — actor keys, which members reuse rather than replace
- `src/adapters/github.js:197` — the commit payload that gains `author`
- `mcp/hosted-isolation.test.js` — where attribution under a session is proved

## Open questions

- **What can an email-only member actually do?** They cannot be invited and
  cannot authenticate to a private repo. Today that leaves them as a roster
  entry: a name for task ownership and for attribution when they contribute
  from a clone. That may be enough, but it should be said out loud rather than
  implied.
- **Should `member add` warn when the login is not a collaborator and
  `--invite` was not passed?** It is the common mistake, and silence makes it
  look like access was granted when it was not.
