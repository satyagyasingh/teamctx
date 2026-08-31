/**
 * Where a team member points their AI client to reach this project.
 *
 * Both halves of the answer already existed and nothing joined them: the
 * deployment origin is in config.json, and the owner/repo is in the git remote.
 * Assembling them was left to whoever was handing out the URL, from memory,
 * usually while someone waited.
 */

export class NoDeployUrlError extends Error {
  constructor() {
    super('this project has no deploy URL recorded, so there is no connector to hand out');
    this.code = 'NO_DEPLOY_URL';
  }
}

export class NoGithubRemoteError extends Error {
  constructor(remote) {
    super(remote
      ? `"${remote}" is not a GitHub remote, and the hosted connector reads a project out of GitHub`
      : 'no git remote named origin, so there is no repository to build a connector URL from');
    this.code = 'NO_GITHUB_REMOTE';
  }
}

/**
 * Owner and repo out of a remote URL.
 *
 * Both forms have to work: `git@github.com:acme/ledger.git` is what `gh repo
 * clone` leaves behind, and `https://github.com/acme/ledger` is what someone
 * copies out of the browser.
 */
export function parseGithubRemote(remote) {
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(String(remote || '').trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * The URL a member pastes into their client.
 *
 * `deployUrl` is pasted out of a browser as often as it is typed, so a trailing
 * slash is expected input rather than a mistake — left in it would produce a
 * double slash that some proxies collapse and others 404 on.
 */
export function connectorUrl({ deployUrl, remote } = {}) {
  const origin = String(deployUrl || '').trim().replace(/\/+$/, '');
  if (!origin) throw new NoDeployUrlError();

  const parsed = parseGithubRemote(remote);
  if (!parsed) throw new NoGithubRemoteError(remote);

  return {
    url: `${origin}/api/mcp/${parsed.owner}/${parsed.repo}`,
    owner: parsed.owner,
    repo: parsed.repo,
  };
}
