/**
 * May this GitHub user lend a project's GitHub access?
 *
 * Separated from the HTTP calls that gather the inputs because it is an
 * authorization decision, and this one has already been wrong once: a failed
 * lookup fell through to "you need admin access", which told the repository's
 * own owner a thing that was neither true nor actionable.
 *
 * The manager gate comes first because it is the question teamctx actually
 * means. Whoever ran `init` is the manager, so for the ordinary case — you set
 * the project up, you own the repo — this passes rather than becoming a second
 * permission to go and arrange. Repository admin is only the fallback for a
 * project with no manager pinned yet: lending hands a credential to everyone
 * the roster names, and with nobody recorded, whoever can administer the
 * repository is the one entitled to decide.
 */
export function lendDecision({ config, userId, isAdmin = false, slug = 'this project' } = {}) {
  const managerKey = config?.managerKey;

  if (managerKey) {
    if (managerKey === `github:${userId}`) return { ok: true, via: 'manager' };
    return {
      ok: false,
      why: `${slug} is managed by someone else, so only they can lend its GitHub access.`,
    };
  }

  if (isAdmin) return { ok: true, via: 'admin' };
  return {
    ok: false,
    why: `${slug} has no manager recorded, so lending needs admin access on the repository.`,
  };
}
