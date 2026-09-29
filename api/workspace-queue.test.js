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
    method: body ? 'POST' : 'GET',
    query: { owner: 'acme', repo: 'ledger', ...(action ? { action } : {}) },
    headers: session ? { cookie: 'teamctx_sid=s' } : {},
    body,
  };
  let code = 200; let payload;
  const res = { status(c) { code = c; return this; }, json(b) { payload = b; return this; }, setHeader() {} };
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

describe('what a queued change still points at', () => {
  it('carries the statement it edits, not only its id', async () => {
    // The page printed "(unknown id 4f329zt7)" and left the reader to work out
    // whether that was their data or our bug.
    repo.files.set('.teamctx/workstreams/product.json', JSON.stringify({
      id: 'product', name: 'Product', tasks: [],
      whys: [{ id: 'w1', text: 'go to Vietnam', whats: [] }],
    }));
    repo.files.set('.teamctx/queue/c-9.json', JSON.stringify({
      ...QUEUED, operations: [{ type: 'editStatement', id: 'w1', text: 'go to Thailand' }],
    }));
    const { body } = await call({ session: MANAGER });
    expect(body.pending[0].operations[0]).toMatchObject({ was: 'go to Vietnam', tier: 'why', gone: false });
  });

  it('says when the statement is not there any more', async () => {
    repo.files.set('.teamctx/queue/c-9.json', JSON.stringify({
      ...QUEUED, operations: [{ type: 'deleteStatement', id: '4f329zt7' }],
    }));
    const { body } = await call({ session: MANAGER });
    expect(body.pending[0].operations[0]).toMatchObject({ gone: true, was: null });
  });

  it('resolves against the tree the change belongs to, not the one being read', async () => {
    // A queued change on one part of the work is reviewed from a page that may
    // be showing another.
    repo.files.set('.teamctx/workstreams/tech.json', JSON.stringify({
      id: 'tech', name: 'Tech', tasks: [], whys: [{ id: 't1', text: 'keep it up', whats: [] }],
    }));
    repo.files.set('.teamctx/queue/c-8.json', JSON.stringify({
      ...QUEUED, id: 'c-8', workstream: 'tech',
      operations: [{ type: 'editStatement', id: 't1', text: 'keep it running' }],
    }));
    const { body } = await call({ session: MANAGER });
    const tech = body.pending.find(q => q.id === 'c-8');
    expect(tech.workstream).toBe('tech');
    expect(tech.operations[0].was).toBe('keep it up');
  });
});

describe('approving part of what was sent', () => {
  const THREE = {
    ...QUEUED,
    operations: [
      { type: 'addWhy', text: 'first' },
      { type: 'addWhy', text: 'second' },
      { type: 'addWhy', text: 'third' },
    ],
  };

  it('lands only the changes that were picked', async () => {
    // A manager who has to take all six or none will take all six.
    repo.files.set('.teamctx/queue/c-9.json', JSON.stringify(THREE));
    const { status, body } = await call({ action: 'approve', session: MANAGER, body: { id: 'c-9', only: [0, 2] } });
    expect(status).toBe(200);
    expect(tree('product').whys.map(w => w.text)).toEqual(['first', 'third']);
    expect(body.leftOut).toBe(1);
  });

  it('closes the item either way, so nothing waits forever', async () => {
    repo.files.set('.teamctx/queue/c-9.json', JSON.stringify(THREE));
    const { body } = await call({ action: 'approve', session: MANAGER, body: { id: 'c-9', only: [1] } });
    expect(body.pending).toEqual([]);
  });

  it('records in the history that it was not all of it', async () => {
    repo.files.set('.teamctx/queue/c-9.json', JSON.stringify(THREE));
    await call({ action: 'approve', session: MANAGER, body: { id: 'c-9', only: [1] } });
    expect(repo.commits.join(' ')).toMatch(/1 of 3 changes/);
  });

  it('still takes all of them when nothing was picked out', async () => {
    repo.files.set('.teamctx/queue/c-9.json', JSON.stringify(THREE));
    const { body } = await call({ action: 'approve', session: MANAGER, body: { id: 'c-9' } });
    expect(tree('product').whys).toHaveLength(3);
    expect(body.leftOut).toBe(0);
  });

  it('refuses an approval that keeps nothing', async () => {
    repo.files.set('.teamctx/queue/c-9.json', JSON.stringify(THREE));
    const { status } = await call({ action: 'approve', session: MANAGER, body: { id: 'c-9', only: [] } });
    expect(status).toBe(400);
  });
});

describe('knowing that work is waiting', () => {
  it('tells everybody there is something, and who it waits on', async () => {
    // Not theirs to clear, but a queue that is there on one sign-in and gone on
    // the next reads as work having gone missing.
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(body.pending).toEqual([]);
    expect(body.waiting).toMatchObject({ total: 1 });
    expect(body.waiting.managerName).toBeTruthy();
  });

  it('gives the contents only to the person who can clear it', async () => {
    await lend();
    const { body } = await call({ session: MEMBER });
    expect(JSON.stringify(body)).not.toContain('records the pricing decision');
  });

  it('counts what is waiting across the whole project, not only what is on screen', async () => {
    repo.files.set('.teamctx/queue/c-8.json', JSON.stringify({ ...QUEUED, id: 'c-8', workstream: 'tech' }));
    const { body } = await call({ session: MANAGER });
    expect(body.waiting.total).toBe(2);
    expect(body.pending).toHaveLength(2);
  });
});

describe('adding a part of the work', () => {
  it('creates it empty, inheriting the project like any other', async () => {
    const { status, body } = await call({ action: 'workstream', session: MANAGER, body: { name: 'Go to market' } });
    expect(status).toBe(200);
    expect(body.workstream).toMatchObject({ id: 'go-to-market', name: 'Go to market', whys: [] });
    expect(JSON.parse(repo.files.get('.teamctx/config.json')).workstreams.map(w => w.id))
      .toContain('go-to-market');
    expect(repo.files.has('.teamctx/workstreams/go-to-market.json')).toBe(true);
    expect(repo.commits.join(' ')).toMatch(/workstream: add "Go to market"/);
  });

  it('leaves the parts that already exist alone', async () => {
    const before = repo.files.get('.teamctx/workstreams/product.json');
    await call({ action: 'workstream', session: MANAGER, body: { name: 'Go to market' } });
    expect(repo.files.get('.teamctx/workstreams/product.json')).toBe(before);
  });

  it('is the manager to do, on a shared project', async () => {
    await lend();
    const { status } = await call({ action: 'workstream', session: MEMBER, body: { name: 'Go to market' } });
    expect(status).toBe(403);
    expect(repo.files.has('.teamctx/workstreams/go-to-market.json')).toBe(false);
  });

  it('refuses a name the project already uses', async () => {
    const { status, body } = await call({ action: 'workstream', session: MANAGER, body: { name: 'Product' } });
    expect(status).toBe(400);
    expect(body.error).toMatch(/already has a part of the work/);
  });

  it('refuses a name with nothing in it', async () => {
    expect((await call({ action: 'workstream', session: MANAGER, body: { name: '  ' } })).status).toBe(400);
  });
});
