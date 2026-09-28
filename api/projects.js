import { currentUser } from '../src/oauth/session.js';
import { kvGet, keys } from '../src/oauth/kv.js';
import { projectsKeyedBy, projectsKnownFor } from '../src/oauth/ai-keys.js';

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
export default async function handler(req, res) {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'Not signed in.',
      signIn: `/signin?returnTo=${encodeURIComponent('/projects')}`,
    });
  }

  const slugs = [...new Set([
    ...(await projectsKeyedBy({ email: user.email, githubId: user.id })),
    ...(user.id ? (await kvGet(keys.lentProjects(user.id)))?.projects || [] : []),
    ...(user.email ? await projectsKnownFor(user.email) : []),
  ])].sort();

  res.status(200).json({
    me: { name: user.name || user.login || user.email || 'you' },
    projects: slugs.map(slug => {
      const [owner, repo] = String(slug).split('/');
      return { slug, owner, repo };
    }),
  });
}
