import { currentUser } from '../src/oauth/session.js';
import { kvGet, keys } from '../src/oauth/kv.js';
import { projectsKeyedBy, projectsKnownFor, recordConnectedProject } from '../src/oauth/ai-keys.js';
import { readConfigJson } from '../src/oauth/member-access.js';

/**
 * The projects somebody is on.
 *
 * Three lists, because a project reaches a person three ways: they saved a key
 * against it, they lent it access, or they connected an assistant to it. Nobody
 * cares which — they asked what they can open.
 *
 * Deliberately not part of the per-project function: this is the one question
 * that cannot name a project in its own address.
 */
/**
 * Adding a project somebody already has.
 *
 * The list gathers projects teamctx happens to know about, which leaves out the
 * ordinary case: a repository that already holds a project and a person who can
 * read it. Nothing is created and nothing is written into the repository — the
 * address is simply remembered, once teamctx has confirmed the project is
 * really there and that this person can read it.
 */
async function addExisting({ req, res, user }) {
  const slug = String(req.body?.project || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) {
    return res.status(400).json({ error: 'Give it as owner/repo, the way GitHub writes it.' });
  }
  if (!user.token) {
    return res.status(400).json({
      error: 'Adding a project reads the repository, so it needs a GitHub sign-in. '
        + 'Ask its manager to invite you by email instead.',
    });
  }
  try {
    await readConfigJson({ owner, repo, token: user.token });
  } catch {
    return res.status(404).json({
      error: `${owner}/${repo} either has no teamctx project in it, or your GitHub account cannot see it.`,
    });
  }
  if (user.email) await recordConnectedProject({ email: user.email, owner, repo });
  return res.status(200).json({ project: { slug: `${owner}/${repo}`, owner, repo } });
}

export default async function handler(req, res) {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'Not signed in.',
      signIn: `/signin?returnTo=${encodeURIComponent('/projects')}`,
    });
  }

  if (req.method === 'POST') return addExisting({ req, res, user });

  const slugs = [...new Set([
    ...(await projectsKeyedBy({ email: user.email, githubId: user.id })),
    ...(user.id ? (await kvGet(keys.lentProjects(user.id)))?.projects || [] : []),
    ...(user.email ? await projectsKnownFor(user.email) : []),
  ])].sort();

  res.status(200).json({
    // A GitHub sign-in can make a repository; a Google one cannot, and the page
    // should not offer it something that ends in a refusal.
    me: { name: user.name || user.login || user.email || 'you', canCreate: !!user.token },
    projects: slugs.map(slug => {
      const [owner, repo] = String(slug).split('/');
      return { slug, owner, repo };
    }),
  });
}
