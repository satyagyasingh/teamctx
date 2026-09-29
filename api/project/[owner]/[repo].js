import { currentUser } from '../../../src/oauth/session.js';
import {
  readWorkspace, proposeContribution, applyContribution, discardContribution,
  approveQueued, rejectQueued, markTask, askProject, readRole, addWorkstream,
} from '../../../src/oauth/workspace.js';
import { ProjectViewError } from '../../../src/oauth/project-view.js';
import { ManagerGateError } from '../../../cli/commands/review.core.js';

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

  async propose({ owner, repo, user, body }) {
    const text = String(body?.text || '').trim();
    if (!text) throw new BadRequest('Say something to contribute.');
    return proposeContribution({ owner, repo, user, workstream: body.workstream, text });
  },

  async apply({ owner, repo, user, body }) {
    if (!Array.isArray(body?.operations) || body.operations.length === 0) {
      throw new BadRequest('There is nothing here to apply.');
    }
    return applyContribution({
      owner,
      repo,
      user,
      workstream: body.workstream,
      text: String(body.text || ''),
      summary: String(body.summary || ''),
      operations: body.operations,
    });
  },

  async ask({ owner, repo, user, body }) {
    const question = String(body?.question || '').trim();
    if (!question) throw new BadRequest('Ask something.');
    return askProject({
      owner, repo, user, workstream: body.workstream, question, role: body.role || null,
    });
  },

  async role({ owner, repo, user, body }) {
    if (!body?.slug) throw new BadRequest('Which role?');
    return readRole({ owner, repo, user, slug: String(body.slug) });
  },

  async workstream({ owner, repo, user, body }) {
    const name = String(body?.name || '').trim();
    if (!name) throw new BadRequest('Give it a name.');
    return addWorkstream({ owner, repo, user, name });
  },

  async approve({ owner, repo, user, body }) {
    if (!body?.id) throw new BadRequest('Which one?');
    // `only` is which of the changes to keep. Absent means all of them, which is
    // what approving from the terminal or an assistant has always meant.
    const only = Array.isArray(body.only) ? body.only.map(Number).filter(n => Number.isInteger(n)) : null;
    if (only && only.length === 0) throw new BadRequest('Nothing is selected to approve.');
    return approveQueued({ owner, repo, user, id: String(body.id), only });
  },

  async reject({ owner, repo, user, body }) {
    if (!body?.id) throw new BadRequest('Which one?');
    return rejectQueued({ owner, repo, user, id: String(body.id), reason: body.reason });
  },

  async task({ owner, repo, user, body }) {
    if (!body?.id) throw new BadRequest('Which task?');
    return markTask({ owner, repo, user, id: String(body.id), status: body.status });
  },

  async discard({ owner, repo, user, body }) {
    return discardContribution({
      owner, repo, user, workstream: body?.workstream, text: String(body?.text || ''),
    });
  },
};

class BadRequest extends Error {}

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
    res.status(200).json(await run({ owner, repo, user, req, body: req.body }));
  } catch (e) {
    if (e instanceof BadRequest) return res.status(400).json({ error: e.message });
    // A name that is already taken, or produces no id at all, is something the
    // person can fix — reporting it as a server fault tells them to give up.
    if (e.code === 'WORKSTREAM_SPLIT') return res.status(400).json({ error: e.message });
    // The manager gate and the roster both refuse by throwing. Neither is a
    // fault in the request, so neither is reported as one — and neither is a
    // fault in the server, which is what a 500 would have said.
    if (e instanceof ManagerGateError) return res.status(403).json({ error: e.message });
    if (e instanceof ProjectViewError) return res.status(403).json({ error: e.message });
    res.status(500).json({ error: e.message || String(e) });
  }
}
