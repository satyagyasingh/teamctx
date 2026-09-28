import { currentUser } from '../../../src/oauth/session.js';
import { readWorkspace } from '../../../src/oauth/workspace.js';
import { ProjectViewError } from '../../../src/oauth/project-view.js';

/**
 * The JSON the project workspace reads and writes through.
 *
 * One function with an `action`, not a handler per verb: Vercel turns every file
 * under `api/` into a serverless function and the plan allows twelve, so a
 * workspace that grew a function per button would spend the budget on routing.
 *
 * The browser never holds a credential. It sends the session cookie this server
 * set; the GitHub token it stands for stays here, exactly as it does for every
 * page the server renders.
 */

const ACTIONS = {
  async bootstrap({ owner, repo, user }) {
    return readWorkspace({ owner, repo, user });
  },
};

export default async function handler(req, res) {
  const owner = String(req.query.owner || '');
  const repo = String(req.query.repo || '');
  const action = String(req.query.action || 'bootstrap');

  const user = await currentUser(req);
  if (!user) {
    // The app asks for this before it draws anything, so a signed-out reader is
    // told where to go rather than shown an empty workspace.
    return res.status(401).json({
      error: 'Not signed in.',
      signIn: `/signin?returnTo=${encodeURIComponent(`/project/${owner}/${repo}`)}`,
    });
  }

  const run = ACTIONS[action];
  if (!run) return res.status(400).json({ error: `Unknown action "${action}".` });

  try {
    res.status(200).json(await run({ owner, repo, user, req }));
  } catch (e) {
    if (e instanceof ProjectViewError) return res.status(403).json({ error: e.message });
    res.status(500).json({ error: e.message || String(e) });
  }
}
