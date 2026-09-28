/**
 * How the workspace talks to teamctx.
 *
 * What this replaces read one repository, configured once as an environment
 * variable, through a proxy holding a token with write access to it. This app
 * serves whoever is signed in, against whichever project they opened, and holds
 * no credential at all: the session cookie goes with the request and the token
 * it stands for never leaves the server.
 */

export class SignedOutError extends Error {
  constructor(signIn) {
    super('Not signed in.');
    this.name = 'SignedOutError';
    this.signIn = signIn;
  }
}

/** The project in the address bar: `/project/<owner>/<repo>`. */
export function projectFromPath(pathname = window.location.pathname) {
  const m = /^\/project\/([^/]+)\/([^/]+)/.exec(pathname);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function call({ owner, repo, action, body }) {
  const res = await fetch(`/api/project/${owner}/${repo}?action=${encodeURIComponent(action)}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Sending somebody to sign in is the server's call, not a guess made here:
  // it knows which ways in this project has and where to come back to.
  if (res.status === 401) throw new SignedOutError(data.signIn || '/signin');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const loadWorkspace = ({ owner, repo }) => call({ owner, repo, action: 'bootstrap' });
