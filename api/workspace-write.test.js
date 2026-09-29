/**
 * Contributing from the workspace.
 *
 * One contribution, two requests: the model reads it, the person sees what it
 * proposes, and only then is anything written. What is checked here is that the
 * second request cannot quietly become something the first one did not propose,
 * that the project's review policy decides where the work lands rather than the
 * browser, and that a rejected proposal still leaves the contribution on record.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const repo = vi.hoisted(() => ({ files: new Map(), commits: [] }));

vi.mock('../src/context.js', async (orig) => ({
  ...(await orig()),
  updateShared: vi.fn(async (workstream, contribution) => ({
    workstream: { ...workstream, whys: [...(workstream.whys || []), { id: 'n1', text: 'tiers decided', whats: [] }] },
    summary: 'records the pricing decision',
    operations: [{ type: 'addWhy', text: 'tiers decided' }],
  })),
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
  workstreams: [{ id: 'product', name: 'Product' }],
  roles: [],
  members: [{ key: 'git:priya@example.com', name: 'Priya', email: 'priya@example.com', workstreams: ['product'] }],
};

function project(config = CONFIG) {
  repo.files = new Map([
    ['.teamctx/config.json', JSON.stringify(config)],
    ['.teamctx/project.json', JSON.stringify({ name: 'Ledger', whys: [], tasks: [] })],
    ['.teamctx/workstreams/product.json', JSON.stringify({ id: 'product', name: 'Product', whys: [], tasks: [] })],
    ['.teamctx/contributions.jsonl', ''],
  ]);
  repo.commits = [];
}

async function call({ action, session, body }) {
  if (session) await kvSet(keys.session('s'), session);
  const req = {
    method: body ? 'POST' : 'GET',
    query: { owner: 'acme', repo: 'ledger', action },
    headers: session ? { cookie: 'teamctx_sid=s' } : {},
    body,
  };
  let code = 200; let payload;
  const res = { status(c) { code = c; return this; }, json(b) { payload = b; return this; }, setHeader() {} };
  await handler(req, res);
  return { status: code, body: payload };
}

const lend = () => kvSet(keys.projectGhCred('acme', 'ledger'), { token: 'gh-lent', lentByEmail: 'maya@example.com' });
const tree = () => JSON.parse(repo.files.get('.teamctx/workstreams/product.json'));
const queue = () => [...repo.files.keys()].filter(p => p.startsWith('.teamctx/queue/'));
const log = () => (repo.files.get('.teamctx/contributions.jsonl') || '').split('\n').filter(Boolean).map(JSON.parse);

beforeEach(() => { __resetMemory(); project(); });

describe('asking what a contribution means', () => {
  it('returns what the model proposed, and writes nothing yet', async () => {
    const { status, body } = await call({
      action: 'propose', session: MANAGER, body: { workstream: 'product', text: 'we settled on three tiers' },
    });
    expect(status).toBe(200);
    expect(body.summary).toBe('records the pricing decision');
    expect(body.operations).toEqual([{ type: 'addWhy', text: 'tiers decided' }]);
    // Nothing committed, nothing in the tree: the person has not seen it yet.
    expect(repo.commits).toEqual([]);
    expect(tree().whys).toEqual([]);
  });

  it('tells the app whether approving will land it or send it for review', async () => {
    await lend();
    const mine = await call({ action: 'propose', session: MANAGER, body: { workstream: 'product', text: 'x' } });
    const theirs = await call({ action: 'propose', session: MEMBER, body: { workstream: 'product', text: 'x' } });
    expect(mine.body.willQueue).toBe(false);
    expect(theirs.body.willQueue).toBe(true);
  });

  it('refuses an empty contribution', async () => {
    const { status } = await call({ action: 'propose', session: MANAGER, body: { workstream: 'product', text: '  ' } });
    expect(status).toBe(400);
  });
});

describe('approving what was proposed', () => {
  const proposal = {
    workstream: 'product',
    text: 'we settled on three tiers',
    summary: 'records the pricing decision',
    operations: [{ type: 'addWhy', text: 'tiers decided' }],
  };

  it('writes the manager approval straight into the context', async () => {
    const { status, body } = await call({ action: 'apply', session: MANAGER, body: proposal });
    expect(status).toBe(200);
    expect(body.mode).toBe('applied');
    expect(tree().whys.map(w => w.text)).toContain('tiers decided');
    expect(repo.commits.join(' ')).toMatch(/context: Maya contribution/);
  });

  it('does not run the model a second time', async () => {
    // The person approved what they were shown. A second run would propose
    // something else, and what landed would not be what they saw.
    const { updateShared } = await import('../src/context.js');
    updateShared.mockClear();
    await call({ action: 'apply', session: MANAGER, body: proposal });
    expect(updateShared).not.toHaveBeenCalled();
  });

  it('sends a member contribution to the queue, not into the context', async () => {
    await lend();
    const { body } = await call({ action: 'apply', session: MEMBER, body: proposal });
    expect(body.mode).toBe('queued');
    expect(queue()).toHaveLength(1);
    expect(tree().whys).toEqual([]);
  });

  it('keeps a member from claiming the manager path by asking for it', async () => {
    // `apply` is decided here from the gate, never from the request — but the
    // core refuses it too, which is what makes that safe rather than lucky.
    await lend();
    const { body } = await call({ action: 'apply', session: MEMBER, body: { ...proposal, apply: true } });
    expect(body.mode).toBe('queued');
  });

  it('applies a member contribution the policy does not hold', async () => {
    project({ ...CONFIG, reviewPolicy: 'additive' });
    await lend();
    const { body } = await call({ action: 'apply', session: MEMBER, body: proposal });
    expect(body.mode).toBe('applied');
    expect(tree().whys.map(w => w.text)).toContain('tiers decided');
  });

  it('holds a deletion for review even under a policy that lets adds through', async () => {
    project({ ...CONFIG, reviewPolicy: 'additive' });
    await lend();
    const { body } = await call({
      action: 'apply',
      session: MEMBER,
      body: { ...proposal, operations: [{ type: 'deleteStatement', id: 'w1' }] },
    });
    expect(body.mode).toBe('queued');
  });

  it('refuses an approval carrying nothing to apply', async () => {
    const { status } = await call({ action: 'apply', session: MANAGER, body: { ...proposal, operations: [] } });
    expect(status).toBe(400);
  });

  it('hands back the tree it just wrote, so the page does not have to guess', async () => {
    const { body } = await call({ action: 'apply', session: MANAGER, body: proposal });
    expect(body.workstream.whys.map(w => w.text)).toContain('tiers decided');
  });
});

describe('rejecting what was proposed', () => {
  it('keeps the contribution on the record', async () => {
    // What somebody said and what the model made of it are two different
    // things. Throwing away the reading does not throw away the saying.
    const { status, body } = await call({
      action: 'discard', session: MANAGER, body: { workstream: 'product', text: 'we settled on three tiers' },
    });
    expect(status).toBe(200);
    expect(body.id).toBeTruthy();
    expect(log()).toHaveLength(1);
    expect(log()[0]).toMatchObject({ text: 'we settled on three tiers', source: 'web', status: 'logged' });
    expect(tree().whys).toEqual([]);
  });

  it('commits it as logged, so it survives the session', async () => {
    await call({ action: 'discard', session: MANAGER, body: { workstream: 'product', text: 'x' } });
    expect(repo.commits.join(' ')).toMatch(/log: Maya contribution \(not applied\)/);
  });
});

describe('a part of the work somebody is not on', () => {
  const OUTSIDE = {
    workstream: 'tech',
    text: 'we settled on three tiers',
    summary: 'records the pricing decision',
    operations: [{ type: 'addWhy', text: 'tiers decided' }],
  };

  beforeEach(() => project({ ...CONFIG, workstreams: [{ id: 'product', name: 'Product' }, { id: 'tech', name: 'Tech' }] }));

  it('cannot be contributed to by naming it in the request', async () => {
    // The list of parts somebody is sent is filtered; the workstream in the body
    // is a claim, and nothing checked it.
    await lend();
    const { status, body } = await call({ action: 'propose', session: MEMBER, body: { workstream: 'tech', text: 'x' } });
    expect(status).toBe(403);
    expect(body.error).toMatch(/not a part of the work you are on/);
  });

  it('cannot be written to by approving into it', async () => {
    await lend();
    const { status } = await call({ action: 'apply', session: MEMBER, body: OUTSIDE });
    expect(status).toBe(403);
    expect(repo.commits).toEqual([]);
  });

  it('does not hand back its tree and its history in the reply', async () => {
    await lend();
    const { body } = await call({ action: 'apply', session: MEMBER, body: OUTSIDE });
    expect(JSON.stringify(body)).not.toContain('whys');
  });

  it('cannot be logged against by discarding into it', async () => {
    await lend();
    const { status } = await call({ action: 'discard', session: MEMBER, body: { workstream: 'tech', text: 'x' } });
    expect(status).toBe(403);
    expect(log()).toEqual([]);
  });

  it('is still open to the manager, who is on all of it', async () => {
    const { status } = await call({ action: 'propose', session: MANAGER, body: { workstream: 'tech', text: 'x' } });
    expect(status).toBe(200);
  });
});

describe('how a write may be asked for', () => {
  it('is refused as a plain link, which a browser can be sent to follow', async () => {
    // A top-level navigation carries the session cookie, so a signed-in person
    // could otherwise be made to commit to their own repository by a link.
    await kvSet(keys.session('s'), MANAGER);
    let code; let payload;
    await handler(
      { method: 'GET', query: { owner: 'acme', repo: 'ledger', action: 'discard' }, headers: { cookie: 'teamctx_sid=s' } },
      { status(c) { code = c; return this; }, json(b) { payload = b; return this; }, setHeader() {} },
    );
    expect(code).toBe(405);
    expect(payload.error).toMatch(/has to be asked for with POST/);
    expect(log()).toEqual([]);
  });
});
