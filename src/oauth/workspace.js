import { readConfig, readTree, readContributions } from '../storage.js';
import { listAllWorkstreams } from '../../cli/commands/workstream.core.js';
import { listMembers } from '../../cli/commands/member.core.js';
import { inScope } from '../member-scope.js';
import { PROJECT_LEVEL, isProjectLevel, resolveTarget } from '../project-level.js';
import { openProject } from './project-view.js';

/**
 * What the project workspace boots on.
 *
 * The interface this serves came from an app that held exactly one workstream,
 * read from one file, for one person whose name it asked for in a modal. None of
 * those three assumptions survive here: a project has a tree of its own plus a
 * workstream for each strand of the work, the reader is whoever the session says
 * they are, and what they may see is decided by the roster — not by them.
 *
 * So this hands the app the same shapes it already renders, filled from the
 * project the caller is allowed to read.
 */

/**
 * Project level is `null` in the data and `'project'` on the wire.
 *
 * `null` is a real target everywhere inside teamctx, and deliberately not a
 * reserved string. It is a poor key in JSON and a worse one in a list the
 * browser renders, so it is named at the boundary and nowhere else.
 */
export const PROJECT_KEY = 'project';

export const toTarget = (key) => (key === PROJECT_KEY || key == null ? PROJECT_LEVEL : key);
const toKey = (target) => (isProjectLevel(target) ? PROJECT_KEY : target);

/** Who is on a part of the work. Somebody with no workstreams is on all of them. */
const membersOn = (members, id) => members
  .filter(m => !m.workstreams?.length || m.workstreams.includes(id));

/**
 * The role details the drawer renders.
 *
 * The standalone app read one markdown blob from its config. teamctx keeps the
 * two halves apart — what the role covers and what it does not — because the
 * exclusions are the half people forget. Joined here, not stored joined.
 */
function roleDetails(role) {
  const parts = [];
  if (role.responsibilities) parts.push(String(role.responsibilities));
  if (role.excludes) parts.push(`**Not yours:** ${role.excludes}`);
  return parts.join('\n\n');
}

/** The role this person holds, by the address the manager wrote down. */
function roleFor(config, actor, isManager) {
  if (isManager) return 'admin';
  const email = actor.email ? String(actor.email).toLowerCase() : null;
  if (!email) return null;
  const mine = (config.roles || []).find(r => String(r.email || '').toLowerCase() === email);
  return mine?.slug || null;
}

export async function readWorkspace({ owner, repo, user }) {
  return openProject({ owner, repo, user }, async ({ config, actor, isManager, allowed }) => {
    const members = listMembers({}).filter(m => m.kind !== 'agent');

    // The project sits above the workstreams and is read the same way, so it is
    // the first entry in the same list rather than a second kind of thing.
    const project = readTree(PROJECT_LEVEL);
    const trees = [
      {
        id: PROJECT_KEY,
        name: config.project || `${owner}/${repo}`,
        isProject: true,
        whys: project?.whys || [],
        members: members.map(m => m.name),
      },
      ...(await listAllWorkstreams({}))
        .filter(w => inScope(allowed, w.id))
        .map(w => ({
          id: w.id,
          name: w.name,
          isProject: false,
          whys: readTree(w.id)?.whys || [],
          members: membersOn(members, w.id).map(m => m.name),
        })),
    ];

    // Grouped the way the app holds them: one list per part of the work, keyed
    // the same as the trees, so a contribution and the statements it produced
    // sit under the same id.
    const contributions = Object.fromEntries(trees.map(t => [t.id, []]));
    for (const c of readContributions()) {
      const key = toKey(resolveTarget(c.workstream));
      if (contributions[key]) contributions[key].push(c);
    }

    return {
      me: {
        name: actor.name || actor.email || 'you',
        role: roleFor(config, actor, isManager),
        isManager,
      },
      project: { name: config.project || `${owner}/${repo}`, owner, repo },
      workstreams: trees,
      contributions,
      roles: (config.roles || []).map(r => ({
        slug: r.slug,
        name: r.name,
        details: roleDetails(r),
      })),
      // `null` means everything. A member sees only what the roster put them on.
      scopedTo: allowed ? allowed.map(toKey) : null,
    };
  });
}
