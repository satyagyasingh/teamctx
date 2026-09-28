import { readTree, writeTree, writeTreeMd, readProject, readContributions, writeRoleFile } from './storage.js';
import { applyOps } from './ops.js';
import { isProjectLevel, resolveTarget } from './project-level.js';
import { recompileInheritors } from './recompile.js';
import { serializeToMd, generateRoleFile } from './context.js';

/**
 * Writing a set of operations into a project's shared context.
 *
 * Three callers arrive here: a contribution the policy lets through, a queued
 * contribution a manager approved, and the workspace on the web. All three have
 * to do the same five things, in the same order, or the repository ends up
 * inconsistent in ways nothing would notice for a while — a tree updated but
 * its markdown stale, a project changed without the workstreams that inherit it
 * being recompiled, a role file still describing yesterday.
 *
 * Contributing and approving each held their own copy of this, down to an
 * identical helper defined twice. They agreed today. Nothing made them keep
 * agreeing.
 */

export function workstreamDisplayName(id, workstream, config) {
  if (isProjectLevel(id)) return config.project || workstream.name || 'project';
  return config.workstreams?.find(w => w.id === id)?.name || workstream.name || config.project;
}

export async function landOperations({
  targetId, operations, contributionId, author, config, teamctxDir,
} = {}) {
  const tree = readTree(targetId, teamctxDir);
  const updated = applyOps(tree, operations || [], contributionId);
  const contributions = readContributions(teamctxDir);
  // The inherited half, or nothing when the target *is* the project: rendering
  // the project above itself prints every node twice, under a heading that says
  // it came from somewhere else.
  const project = isProjectLevel(targetId) ? null : readProject(teamctxDir);

  writeTree(targetId, updated, teamctxDir);
  writeTreeMd(
    targetId,
    serializeToMd(updated, workstreamDisplayName(targetId, updated, config), author, contributions, { project }),
    teamctxDir,
  );

  // A change to the project changes what every workstream inherits, and a
  // compiled page does not re-read the project on its own.
  if (isProjectLevel(targetId)) {
    recompileInheritors({ project: updated, config, contributions, teamctxDir });
  }

  const rolesRegenerated = [];
  for (const role of (config.roles || []).filter(r => resolveTarget(r.workstream) === targetId)) {
    const md = await generateRoleFile(updated, role, config.project, config, contributions, { project });
    writeRoleFile(role.slug, md, teamctxDir);
    rolesRegenerated.push(role.slug);
  }

  return { updated, rolesRegenerated };
}
