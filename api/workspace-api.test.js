/**
 * What the project workspace boots on.
 *
 * The interface came from an app that held one workstream, read one file and
 * asked the visitor to type their own name and pick their own role. What is
 * checked here is that none of that survived the port: the reader is whoever the
 * session says, the role is whoever the manager wrote down, and what comes back
 * is only the part of the work the roster allows.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const repo = vi.hoisted(() => ({ files: new Map(), prefetchError: null }));

vi.mock('../src/adapters/github.js', async (orig) => ({
  ...(await orig()),
  GithubSession: class {
    constructor({ owner, repo: name, ghToken }) {
      Object.assign(this, { owner, repo: name, ghToken });
      repo.usedToken = ghToken;
    }

    async prefetch() { if (repo.prefetchError) throw new Error(repo.prefetchError); }

    read(p) { return repo.files.has(p) ? { content: repo.files.get(p) } : null; }

    write() {}

    del() {}

    listDir(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      return [...repo.files.keys()].filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map(p => p.slice(prefix.length)).sort();
    }

    async commit() { return { committed: true }; }
  },
}));

const { kvSet, keys, __resetMemory } = await import('../src/oauth/kv.js');

let handler;
beforeAll(async () => {
  handler = (await import('./project/[owner]/[repo].js')).default;
});

const MANAGER = { id: '7', login: 'maya', name: 'Maya', email: 'maya@example.com', token: 'gho-maya' };
const MEMBER = { id: null, login: null, name: 'Priya', email: 'priya@example.com', token: null };

const CONFIG = {
  project: 'Ledger',
  managerKey: 'git:maya@example.com',
  workstreams: [{ id: 'product', name: 'Product' }, { id: 'tech', name: 'Tech' }],
  roles: [
    { slug: 'eng', name: 'Engineer', responsibilities: 'Builds it', excludes: '', email: 'dev@example.com' },
    { slug: 'pm', name: 'Product lead', responsibilities: 'Owns what ships', excludes: 'Pricing', email: 'priya@example.com' },
  ],
  members: [
    { key: 'git:priya@example.com', name: 'Priya', email: 'priya@example.com', workstreams: ['product'] },
    { key: 'git:dev@example.com', name: 'Dev', email: 'dev@example.com' },
  ],
};

function project() {
  repo.files = new Map([
    ['.teamctx/config.json', JSON.stringify(CONFIG)],
    ['.teamctx/project.json', JSON.stringify({
      name: 'Ledger', whys: [{ id: 'p1', text: 'ship the ledger', whats: [] }], tasks: [],
    })],
    ['.teamctx/workstreams/product.json', JSON.stringify({
      id: 'product', name: 'Product', tasks: [],
      whys: [{ id: 'w1', text: 'price it right', whats: [{ id: 'a1', text: 'compare tiers', hows: [] }] }],
    })],
    ['.teamctx/workstreams/tech.json', JSON.stringify({
      id: 'tech', name: 'Tech', tasks: [], whys: [{ id: 'w2', text: 'keep it up', whats: [] }],
    })],
    ['.teamctx/contributions.jsonl', [
      JSON.stringify({ id: 'c-1', ts: '2026-09-01T10:00:00Z', author: 'Priya', text: 'tiers', source: 'cli', workstream: 'product', status: 'logged' }),
      JSON.stringify({ id: 'c-2', ts: '2026-09-02T10:00:00Z', author: 'Dev', text: 'uptime', source: 'cli', workstream: 'tech', status: 'logged' }),
      JSON.stringify({ id: 'c-3', ts: '2026-09-03T10:00:00Z', author: 'Maya', text: 'why we are here', source: 'cli', workstream: null, status: 'logged' }),
    ].join('\n')],
  ]);
  repo.prefetchError = null;
}

/** The function is a Vercel handler, so it is called the way Vercel calls it. */
async function call({ owner = 'acme', repo: name = 'ledger', action, session = null } = {}) {
  if (session) await kvSet(keys.session('s'), session);
  const req = {
    query: { owner, repo: name, ...(action ? { action } : {}) },
    headers: session ? { cookie: 'teamctx_sid=s' } : {},
  };
  let code = 200; let payload;
  const res = {
    status(c) { code = c; return this; },
    json(body) { payload = body; return this; },
  };
  await handler(req, res);
  return { status: code, body: payload };
}

const lend = () => kvSet(keys.projectGhCred('acme', 'ledger'), { token: 'gh-lent', lentByEmail: 'maya@example.com' });

beforeEach(() => {
  __resetMemory();
  project();
});

describe('booting the workspace', () => {
  it('tells the app who is reading, from the session', async () => {
    const { status, body } = await call({ session: MANAGER });
    expect(status).toBe(200);
    expect(body.me).toEqual({ name: 'Maya', role: 'admin', isManager: true });
  });

  it('gives a member the role their manager wrote down, not one they picked', async () => {
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(body.me.role).toBe('pm');
    expect(body.me.isManager).toBe(false);
  });

  it('leaves the role empty when the manager has not given them one', async () => {
    // Not the first role on the list, and not one they can pick for themselves:
    // a role is what the manager wrote against their address, or nothing.
    repo.files.set('.teamctx/config.json', JSON.stringify({
      ...CONFIG,
      members: [...CONFIG.members, { key: 'git:sam@example.com', name: 'Sam', email: 'sam@example.com' }],
    }));
    await lend();
    const { body } = await call({ session: { ...MEMBER, name: 'Sam', email: 'sam@example.com' } });
    expect(body.me.role).toBe(null);
  });

  it('puts the project above the workstreams, in the same list', async () => {
    const { body } = await call({ session: MANAGER });
    expect(body.workstreams[0]).toMatchObject({ id: 'project', name: 'Ledger', isProject: true });
    expect(body.workstreams.map(w => w.id)).toEqual(['project', 'product', 'tech']);
  });

  it('carries the tree each part of the work holds', async () => {
    const { body } = await call({ session: MANAGER });
    expect(body.workstreams[0].whys[0].text).toBe('ship the ledger');
    expect(body.workstreams[1].whys[0].whats[0].text).toBe('compare tiers');
  });

  it('files each contribution under the part of the work it touched', async () => {
    const { body } = await call({ session: MANAGER });
    expect(body.contributions.product.map(c => c.id)).toEqual(['c-1']);
    expect(body.contributions.tech.map(c => c.id)).toEqual(['c-2']);
    expect(body.contributions.project.map(c => c.id)).toEqual(['c-3']);
  });

  it('joins what a role covers with what it does not', async () => {
    const { body } = await call({ session: MANAGER });
    const pm = body.roles.find(r => r.slug === 'pm');
    expect(pm).toMatchObject({ slug: 'pm', name: 'Product lead' });
    expect(pm.details).toContain('Owns what ships');
    expect(pm.details).toContain('Not yours:');
  });
});

describe('what a member is allowed to boot on', () => {
  it('sends only the part of the work they are on', async () => {
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(body.workstreams.map(w => w.id)).toEqual(['project', 'product']);
    expect(body.scopedTo).toContain('product');
  });

  it('does not send a tree they are not on, however the app asks', async () => {
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(JSON.stringify(body)).not.toContain('keep it up');
  });

  it('does not send what was written in a part of the work they are not on', async () => {
    // The statements and the contributions behind them are two ways to read the
    // same thing, and scope has to hold for both.
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(Object.keys(body.contributions)).toEqual(['project', 'product']);
    expect(JSON.stringify(body.contributions)).not.toContain('uptime');
  });

  it('is refused on a project whose roster does not name them', async () => {
    await lend();
    const { status, body } = await call({ session: { ...MEMBER, email: 'stranger@example.com' } });
    expect(status).toBe(403);
    expect(body.error).toMatch(/not on the acme\/ledger roster/);
  });
});

describe('the door', () => {
  it('sends a signed-out caller to the sign-in screen, and back again', async () => {
    const { status, body } = await call();
    expect(status).toBe(401);
    expect(body.signIn).toBe('/signin?returnTo=%2Fproject%2Facme%2Fledger');
  });

  it('refuses an action it does not have', async () => {
    const { status, body } = await call({ session: MANAGER, action: 'drop-everything' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unknown action/);
  });

  it('reads the project with the caller own GitHub token', async () => {
    await call({ session: MANAGER });
    expect(repo.usedToken).toBe('gho-maya');
  });

  it('reads it through the access the project lends when they have none', async () => {
    await lend();
    await call({ session: MEMBER });
    expect(repo.usedToken).toBe('gh-lent');
  });
});
