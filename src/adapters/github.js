/**
 * GitHub-backed storage adapter for hosted MCP.
 *
 * Every function here takes the same `dir` handle that fs storage takes, but
 * `dir` is expected to be `{ __backend: 'github', owner, repo, ref?, ghToken }`.
 *
 * Reads: GitHub Contents API. Memoized per-request via a small cache keyed on
 *        `${owner}/${repo}@${ref || 'default'}:${path}`.
 * Writes: single-file via Contents API (PUT), multi-file atomic via Git Data
 *         API (blobs → tree → commit → update ref). One git commit per tool
 *         call. On 409 (stale SHA) refresh + retry once.
 */

export function isGithubCtx(dir) {
  return typeof dir === 'object' && dir !== null && dir.__backend === 'github';
}

const NOT_IMPLEMENTED = (name) => () => {
  throw new Error(`github adapter: ${name} not yet implemented — hosted MCP is under construction`);
};

// ---- Read side (stubbed; wired in the next commit) ----
export const readConfig = NOT_IMPLEMENTED('readConfig');
export const readWorkstream = NOT_IMPLEMENTED('readWorkstream');
export const readContributions = NOT_IMPLEMENTED('readContributions');
export const readRoleFile = NOT_IMPLEMENTED('readRoleFile');
export const readSharedMd = NOT_IMPLEMENTED('readSharedMd');
export const readWorkstreamMd = NOT_IMPLEMENTED('readWorkstreamMd');
export const readShared = NOT_IMPLEMENTED('readShared');
export const listWorkstreamIds = NOT_IMPLEMENTED('listWorkstreamIds');
export const readQueueItem = NOT_IMPLEMENTED('readQueueItem');
export const listQueue = NOT_IMPLEMENTED('listQueue');
export const readSnapshot = NOT_IMPLEMENTED('readSnapshot');
export const listSnapshots = NOT_IMPLEMENTED('listSnapshots');
export const resolveSnapshotId = NOT_IMPLEMENTED('resolveSnapshotId');
export const readCurrentSnapshotPointer = NOT_IMPLEMENTED('readCurrentSnapshotPointer');

// ---- Write side (stubbed) ----
export const writeConfig = NOT_IMPLEMENTED('writeConfig');
export const writeWorkstream = NOT_IMPLEMENTED('writeWorkstream');
export const writeShared = NOT_IMPLEMENTED('writeShared');
export const writeSharedMd = NOT_IMPLEMENTED('writeSharedMd');
export const writeWorkstreamMd = NOT_IMPLEMENTED('writeWorkstreamMd');
export const writeRoleFile = NOT_IMPLEMENTED('writeRoleFile');
export const appendContribution = NOT_IMPLEMENTED('appendContribution');
export const writeQueueItem = NOT_IMPLEMENTED('writeQueueItem');
export const deleteQueueItem = NOT_IMPLEMENTED('deleteQueueItem');
export const writeRejected = NOT_IMPLEMENTED('writeRejected');
export const writeSnapshot = NOT_IMPLEMENTED('writeSnapshot');
export const writeCurrentSnapshotPointer = NOT_IMPLEMENTED('writeCurrentSnapshotPointer');
