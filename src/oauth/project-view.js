import { GithubSession } from '../adapters/github.js';
import { runWithSession } from '../session-context.js';
import { readConfig } from '../storage.js';
import { memberByEmail } from '../../cli/commands/member.core.js';
import { scopeFor } from '../member-scope.js';
import { managerKeys, matchesActor } from '../review.js';
import { kvGet, keys } from './kv.js';

/**
 * Opening a project on the web, for whoever asked to.
 *
 * Everything the workspace shows is already in the repository. What this
 * settles is who is asking, what they may see of it, and which credential it is
 * read with — the answers every reader needs and none of them should decide for
 * itself.
 */

export class ProjectViewError extends Error {
  constructor(message) {
    super(message);
    this.code = 'PROJECT_VIEW_DENIED';
  }
}

/**
 * The credential and identity to read a project with.
 *
 * A GitHub sign-in reads with its own token, as everything else on this server
 * does. A Google sign-in has none, so it reads through the credential the
 * project lends — and only once the roster confirms the address, which is the
 * same check the connector makes.
 */
async function accessFor({ owner, repo, user }) {
  if (user.token) {
    return {
      ghToken: user.token,
      actor: {
        key: `github:${user.id}`,
        name: user.name || user.login,
        login: user.login || null,
        email: user.email ? String(user.email).toLowerCase() : null,
        source: 'github',
      },
    };
  }
  if (!user.email) throw new ProjectViewError('Your sign-in did not come with a verified email address.');
  const lent = await kvGet(keys.projectGhCred(owner, repo));
  if (!lent?.token) {
    throw new ProjectViewError(
      `${owner}/${repo} has not lent GitHub access, so it cannot be read on behalf of a Google sign-in. `
      + 'Its manager can turn that on from the settings page.');
  }
  // The roster check happens once the project is open, against the config this
  // page reads anyway — the connector's own check, without a second fetch.
  return {
    ghToken: lent.token,
    actor: {
      key: `git:${String(user.email).toLowerCase()}`,
      name: user.name,
      login: null,
      email: String(user.email).toLowerCase(),
      source: 'google',
    },
    checkRoster: true,
  };
}

/**
 * Open a project for somebody, and hand the caller what it decided.
 *
 * Everything that reads a project on the web goes through here: the credential
 * it is read with, whether the caller manages it, whether the roster lets them
 * in at all, and which parts of the work they can see. Written once because a
 * second reader with its own copy of these four answers is a second reader that
 * can disagree with the first about who may see what.
 *
 * The body runs inside the session, so `readConfig`, `readTree` and the rest
 * hit the repository buffer rather than a disk that is not there.
 */
export async function openProject({ owner, repo, user }, body) {
  const { ghToken, actor, checkRoster } = await accessFor({ owner, repo, user });
  const session = new GithubSession({ owner, repo, ghToken });
  try {
    await session.prefetch();
  } catch (e) {
    throw new ProjectViewError(`${owner}/${repo} could not be read: ${e.message}`);
  }

  return runWithSession(session, async () => {
    const config = readConfig();
    // Matched against the gate itself, never `canApprove`: that answers yes to
    // everyone on a project with no gate, and matches a legacy display-name gate
    // against a name the caller chose for themselves — and this answer decides
    // whether the roster check below runs at all.
    const isManager = managerKeys(config).some(k => matchesActor(k, actor));
    // A sign-in with no GitHub account of its own reads through the credential
    // the project lends, so the roster is what stands in front of it. Without
    // this, any Google account anywhere could read any project that lends one.
    if (checkRoster && !isManager && !memberByEmail(config.members, actor.email)) {
      throw new ProjectViewError(
        `${actor.email} is not on the ${owner}/${repo} roster. `
        + 'Ask the manager to add that exact address, or sign in with the one they invited.');
    }
    const allowed = scopeFor(config, actor, { isManager });
    return body({ config, actor, isManager, allowed, session, owner, repo });
  });
}
