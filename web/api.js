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

/**
 * A contribution, in two halves.
 *
 * `propose` asks what it means and writes nothing. `apply` hands back what was
 * shown, so the model is not asked twice and what lands is what somebody
 * approved. `discard` keeps the contribution on the record without it.
 */
export const proposeContribution = ({ owner, repo, workstream, text }) =>
  call({ owner, repo, action: 'propose', body: { workstream, text } });

export const applyContribution = ({ owner, repo, workstream, text, summary, operations }) =>
  call({ owner, repo, action: 'apply', body: { workstream, text, summary, operations } });

export const discardContribution = ({ owner, repo, workstream, text }) =>
  call({ owner, repo, action: 'discard', body: { workstream, text } });

export const approveQueued = ({ owner, repo, id, only = null }) =>
  call({ owner, repo, action: 'approve', body: { id, ...(only ? { only } : {}) } });

export const rejectQueued = ({ owner, repo, id, reason }) =>
  call({ owner, repo, action: 'reject', body: { id, reason } });

export const markTask = ({ owner, repo, id, status }) =>
  call({ owner, repo, action: 'task', body: { id, status } });

/**
 * The projects somebody can open.
 *
 * The app this came from was one deployment pointed at one repository, so it
 * never drew this screen — there was nothing to choose between.
 */
export async function loadProjects() {
  const res = await fetch('/api/projects');
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new SignedOutError(data.signIn || '/signin');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const askProject = ({ owner, repo, workstream, question, role }) =>
  call({ owner, repo, action: 'ask', body: { workstream, question, role } });

export const loadRole = ({ owner, repo, slug }) =>
  call({ owner, repo, action: 'role', body: { slug } });

/** Remember a project this person already has, once teamctx can see it. */
export async function addExistingProject(project) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new SignedOutError(data.signIn || '/signin');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
