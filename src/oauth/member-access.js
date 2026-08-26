import { kvGet, keys } from './kv.js';
import { memberByEmail } from '../../cli/commands/member.core.js';
import { actorFromMember } from '../actor.js';

/**
 * Let someone with no GitHub account act on a project.
 *
 * A member who signed in with Google brings a verified email and nothing else —
 * no GitHub token, so no session can be built from them and a private repo is
 * unreachable. The project lends its own credential instead.
 *
 * Two checks stand in front of that credential, and neither is optional:
 *
 *   1. The credential is stored under `owner/repo` and looked up by the
 *      `owner`/`repo` in the request URL, so it can only ever serve the project
 *      it was stored for. Those come straight off the URL and are not otherwise
 *      checked — safe until now only because every call ran on the caller's own
 *      token and GitHub 404s a stranger. A lent credential removes that
 *      accident, so the pinning is what replaces it.
 *   2. The verified address must appear on the roster. Without it, any Google
 *      account anywhere would be a member of every project that lends a
 *      credential.
 */
export class MemberAccessError extends Error {
  constructor(message) {
    super(message);
    this.code = 'MEMBER_ACCESS_DENIED';
  }
}

async function readConfigJson({ owner, repo, token, ref }) {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/.teamctx/config.json`);
  if (ref) url.searchParams.set('ref', ref);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new MemberAccessError(
      `The credential this project lends can no longer read ${owner}/${repo} (GitHub said ${res.status}).`);
  }
  const body = await res.json();
  try {
    return JSON.parse(Buffer.from(body.content || '', 'base64').toString('utf8'));
  } catch {
    throw new MemberAccessError(`${owner}/${repo} has no readable .teamctx/config.json.`);
  }
}

export async function resolveGoogleMember({ googleUser, owner, repo, ref }) {
  const cred = await kvGet(keys.projectGhCred(owner, repo));
  if (!cred?.token) {
    throw new MemberAccessError(
      `${owner}/${repo} has not lent GitHub access, so it cannot accept members without a GitHub account yet. `
      + 'The manager can turn this on from the teamctx settings page.');
  }

  const config = await readConfigJson({ owner, repo, token: cred.token, ref });
  const member = memberByEmail(config.members, googleUser.email);
  if (!member) {
    // Naming the address is deliberate: signing in with the wrong Google
    // account is the likely mistake, and "you are not a member" without saying
    // who it thinks you are gives nobody anything to act on.
    throw new MemberAccessError(
      `${googleUser.email} is not on the ${owner}/${repo} roster. `
      + 'Ask the manager to add that exact address, or sign in with the one they invited.');
  }

  return { ghToken: cred.token, actor: actorFromMember(member, googleUser), member };
}
