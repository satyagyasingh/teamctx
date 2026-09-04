import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

/**
 * Who created this project, according to the repository itself.
 *
 * The commit that first added `.teamctx/config.json` is the `init` commit, and
 * its author is the person who ran it. That is a better answer than anything in
 * `config.json`, because the file is editable by anyone with the repo while the
 * history is not — forging it needs push access, which is the bar repair
 * already sits behind.
 *
 * It also survives the case a display name cannot: somebody whose git name is
 * "Ada" repairing a gate that reads `name:Ada Lovelace`. The email is the same
 * either way.
 *
 * Returns null when the history cannot be read — a shallow clone, a hosted
 * session with no git binary, a repo whose history was rewritten. Callers fall
 * back rather than treating absence as a refusal.
 */
export async function projectCreator(cwd) {
  try {
    const { stdout } = await execFileAsync('git', [
      'log', '--diff-filter=A', '--format=%ae', '--', '.teamctx/config.json',
    ], cwd ? { cwd } : undefined);
    const lines = stdout.trim().split('\n').filter(Boolean);
    // The *last* line is the oldest commit — the one that created the file.
    return lines.length ? lines[lines.length - 1].trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Is this actor the person that email names?
 *
 * GitHub's noreply form, `<id>+<login>@users.noreply.github.com`, is what a
 * commit made through the web flow carries — so it has to be unpacked rather
 * than compared whole, otherwise the creator returning as `github:<id>` fails
 * to match the commit they themselves authored.
 */
export function isCreator(creatorEmail, actor) {
  if (!creatorEmail || !actor) return false;
  const email = String(creatorEmail).toLowerCase();

  if (String(actor.email || '').toLowerCase() === email) return true;
  if (String(actor.key || '').toLowerCase() === `git:${email}`) return true;

  const noreply = /^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/.exec(email);
  if (noreply) {
    const [, id, login] = noreply;
    if (id && String(actor.key || '') === `github:${id}`) return true;
    if (login && String(actor.login || '').toLowerCase() === login.toLowerCase()) return true;
  }
  return false;
}
