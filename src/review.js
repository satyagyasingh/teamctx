import { applyOps } from './ops.js';

export function applyQueueItem(workstream, item) {
  return applyOps(workstream, item.operations || [], item.id);
}

export function buildRejected(item, rejectedBy, reason) {
  return {
    ...item,
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    rejectedBy,
    reason: reason || null,
  };
}

/**
 * Does `ref` name this actor?
 *
 * `ref` is a stable identity reference, in one of two forms:
 *
 *   github:12345 / git:a@b.com   the actor key — survives renames
 *   @login                       a GitHub login
 *
 * Display names are deliberately not accepted here. They are settable by their
 * owner (`teamctx config name`), so authorising on one would let anyone claim
 * the manager's name and pass. See canApprove for the legacy path.
 */
export function matchesActor(ref, actor) {
  if (!ref || !actor) return false;
  const r = String(ref).trim().toLowerCase();
  if (!r) return false;
  if (r.startsWith('@')) {
    const login = String(actor.login || '').toLowerCase();
    return !!login && r.slice(1) === login;
  }
  if (r.includes(':')) {
    return r === String(actor.key || '').toLowerCase();
  }
  return false;
}

/**
 * Every identity the manager is known by.
 *
 * One person has more than one, and which one they present depends on how they
 * connected: a clone resolves them from `git config` as `git:<email>`, the
 * hosted server resolves them from GitHub OAuth as `github:<id>`, and a member
 * signing in with Google arrives as neither. Matching a single stored key meant
 * the person who set a project up from their laptop was refused by their own
 * manager gate the moment they reached it from a chat client.
 *
 * `managerKey` (singular) stays readable so existing projects keep working; it
 * is simply the first entry.
 */
export function managerKeys(config) {
  const list = Array.isArray(config?.managerKeys) ? config.managerKeys : [];
  const single = config?.managerKey;
  const all = [...(single ? [single] : []), ...list]
    .map(k => String(k || '').trim())
    .filter(Boolean);
  return [...new Set(all)];
}

/** True when `config.manager` is a legacy display name rather than an identity. */
export function isLegacyManagerRef(config) {
  return managerKeys(config).length === 0 && !!config?.manager;
}

/**
 * May this caller approve or reject?
 *
 * `managerKey` holds a stable identity and is what new projects write. The
 * older `manager` field holds a display name; it keeps working so existing
 * projects do not break on upgrade, but it is only as strong as the name being
 * unforgeable — which it no longer is. `isLegacyManagerRef` lets callers warn.
 */
export function canApprove(config, { actor, displayName } = {}) {
  const keys = managerKeys(config);
  const legacy = config?.manager;

  if (keys.length === 0 && !legacy) return true;   // no gate configured

  if (keys.length > 0) {
    // Never fall back to a name here: that is the hole this closes.
    return keys.some(k => matchesActor(k, actor));
  }
  return !!displayName && displayName === legacy;
}
