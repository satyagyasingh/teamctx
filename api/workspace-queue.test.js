/**
 * The manager's queue, and the tasks the old interface had no idea existed.
 *
 * Both arrive in the workspace through slots it already had — the card that
 * reviews a change, and the row the log draws. What is checked here is that the
 * gate and the roster still decide, which is the part a page cannot be trusted
 * to do for itself.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const repo = vi.hoisted(() => ({ files: new Map(), commits: [] }));

vi.mock('../src/context.js', async (orig) => ({
  ...(await orig()),
  generateRoleFile: vi.fn(async () => '# role'),
}));

vi.mock('../src/adapters/github.js', async (orig) => ({
  ...(await orig()),
  GithubSession: class {
    constructor({ owner, repo: name, ghToken }) { Object.assign(this, { owner, repo: name, ghToken }); }

    async prefetch() {}

    read(p) { return repo.files.has(p) ? { content: repo.files.get(p) } : null; }

    write(p, content) { repo.files.set(p, content); }

    del(p) { repo.files.delete(p); }

    listDir(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      return [...repo.files.keys()].filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map(p => p.slice(prefix.length)).sort();
    }

    async commit(message) { repo.commits.push(message); return { committed: true }; }
  },
}));

const { kvSet, keys, __resetMemory } = await import('../src/oauth/kv.js');

let handler;
beforeAll(async () => { handler = (await import('./project/[owner]/[repo].js')).default; });

const MANAGER = { id: '7', login: 'maya', name: 'Maya', email: 'maya@example.com', token: 'gho-maya' };
const MEMBER = { id: null, login: null, name: 'Priya', email: 'priya@example.com', token: null };

const CONFIG = {
  project: 'Ledger',
  managerKey: 'git:maya@example.com',
  autoPush: false,
  reviewPolicy: 'all',
  workstreams: [{ id: 'product', name: 'Product' }, { id: 'tech', name: 'Tech' }],
  roles: [],
  members: [{ key: 'git:priya@example.com', name: 'Priya', email: 'priya@example.com', workstreams: ['product'] }],
};

const QUEUED = {
  id: 'c-9', status: 'pending', createdAt: '2026-09-20T09:00:00Z', author: 'Priya', source: 'web',
  workstream: 'product', text: 'three tiers', summary: 'records the pricing decision',
  operations: [{ type: 'addWhy', text: 'tiers decided' }],
};

function project() {
  repo.files = new Map([
    ['.teamctx/config.json', JSON.stringify(CONFIG)],
    ['.teamctx/project.json', JSON.stringify({ name: 'Ledger', whys: [], tasks: [] })],
    ['.teamctx/workstreams/product.json', JSON.stringify({
      id: 'product', name: 'Product', whys: [],
      tasks: [{ id: 'pricing-page', title: 'Draft the pricing page', owner: 'Priya', status: 'open' }],
    })],
    ['.teamctx/workstreams/tech.json', JSON.stringify({
      id: 'tech', name: 'Tech', whys: [],
      tasks: [{ id: 'migrate-db', title: 'Migrate the database', owner: 'Dev', status: 'open' }],
    })],
    ['.teamctx/contributions.jsonl', ''],
    ['.teamctx/queue/c-9.json', JSON.stringify(QUEUED)],
  ]);
  repo.commits = [];
}

async function call({ action, session, body }) {
  if (session) await kvSet(keys.session('s'), session);
  const req = {
    query: { owner: 'acme', repo: 'ledger', ...(action ? { action } : {}) },
    headers: session ? { cookie: 'teamctx_sid=s' } : {},
    body,
  };
  let code = 200; let payload;
  const res = { status(c) { code = c; return this; }, json(b) { payload = b; return this; } };
  await handler(req, res);
  return { status: code, body: payload };
}

const lend = () => kvSet(keys.projectGhCred('acme', 'ledger'), { token: 'gh-lent', lentByEmail: 'maya@example.com' });
const tree = (id) => JSON.parse(repo.files.get(`.teamctx/workstreams/${id}.json`));

beforeEach(() => { __resetMemory(); project(); });

describe('what waits on the manager', () => {
  it('is sent to them with the change it proposes', async () => {
    const { body } = await call({ session: MANAGER });
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0]).toMatchObject({ id: 'c-9', author: 'Priya', workstream: 'product' });
    expect(body.pending[0].operations).toEqual(QUEUED.operations);
  });

  it('is not sent to anybody else', async () => {
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(body.pending).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('records the pricing decision');
  });

  it('lands in the context when the manager approves it', async () => {
    const { status, body } = await call({ action: 'approve', session: MANAGER, body: { id: 'c-9' } });
    expect(status).toBe(200);
    expect(tree('product').whys.map(w => w.text)).toContain('tiers decided');
    expect(body.pending).toEqual([]);
    expect(repo.commits.join(' ')).toMatch(/approved by Maya/);
  });

  it('cannot be approved by the person who sent it', async () => {
    await lend();
    const { status } = await call({ action: 'approve', session: MEMBER, body: { id: 'c-9' } });
    expect(status).toBe(403);
    expect(tree('product').whys).toEqual([]);
  });

  it('leaves the context alone when it is rejected', async () => {
    const { body } = await call({ action: 'reject', session: MANAGER, body: { id: 'c-9', reason: 'not now' } });
    expect(body.pending).toEqual([]);
    expect(tree('product').whys).toEqual([]);
  });
});

describe('tasks', () => {
  it('come with the boot, scoped the way everything else is', async () => {
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(body.tasks.map(t => t.id)).toEqual(['pricing-page']);
    expect(JSON.stringify(body.tasks)).not.toContain('Migrate the database');
  });

  it('can be ticked off by whoever is doing the work, not only the manager', async () => {
    await lend();
    const { status, body } = await call({ action: 'task', session: MEMBER, body: { id: 'pricing-page', status: 'done' } });
    expect(status).toBe(200);
    expect(body.task.status).toBe('done');
    expect(tree('product').tasks[0].status).toBe('done');
  });

  it('cannot be touched in a part of the work somebody is not on', async () => {
    // Checked before the write, because marking a task commits: a refusal that
    // came afterwards would already have changed the repository.
    await lend();
    const { status } = await call({ action: 'task', session: MEMBER, body: { id: 'migrate-db', status: 'done' } });
    expect(status).toBe(403);
    expect(tree('tech').tasks[0].status).toBe('open');
    expect(repo.commits).toEqual([]);
  });

  it('can be opened again after being marked done', async () => {
    await call({ action: 'task', session: MANAGER, body: { id: 'pricing-page', status: 'done' } });
    const { body } = await call({ action: 'task', session: MANAGER, body: { id: 'pricing-page', status: 'open' } });
    expect(body.task.status).toBe('open');
  });
});
