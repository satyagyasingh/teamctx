import { managerKeys } from './review.js';

/**
 * May this gate be repaired, and to what?
 *
 * Separated from the command because the precondition *is* the safety argument:
 * repairing a manager gate grants manager rights, so the one thing standing
 * between a repair and a "become manager" backdoor is that it only ever fires
 * on a gate nobody could pass anyway.
 *
 * A `name:` key is that gate. It is the last resort of the actor ladder
 * (src/actor.js), produced only when there is no ambient identity and no git
 * config, and its value comes from `config.me` — which is committed and shared.
 * So anyone with the repository and no local git identity already presents that
 * key and passes. Repair does not open a door; the door is open, and repair is
 * what closes it.
 *
 * Which is why it must refuse a gate that works. Against a real `git:` or
 * `github:` key this would be the escalation #49 removed.
 */
export const BROKEN_PREFIX = 'name:';

export function isBrokenGate(config) {
  const keys = managerKeys(config);
  return keys.length > 0 && keys.every(k => k.startsWith(BROKEN_PREFIX));
}

export function repairDecision({ config, actor } = {}) {
  const keys = managerKeys(config);

  if (keys.length === 0) {
    // No gate at all is the bootstrap case — `canApprove` already lets anyone
    // through and the first to pin it wins. Not this command's business.
    return { ok: false, why: 'This project has no manager gate to repair.' };
  }
  if (!isBrokenGate(config)) {
    return {
      ok: false,
      why: `The manager gate is ${keys.join(', ')}, which is a real identity. `
        + 'Repair only replaces a display-name gate that nobody can match.',
    };
  }
  const key = String(actor?.key || '');
  if (!key || key.startsWith(BROKEN_PREFIX)) {
    // Rewriting one unusable gate as another helps nobody, and would look like
    // it had worked.
    return {
      ok: false,
      why: 'You have no stable identity here either, so repairing would write '
        + 'another gate nobody can match. Set `git config user.email` in this '
        + 'clone, or run this where you are signed in.',
    };
  }
  return { ok: true, from: keys[0], to: key };
}
