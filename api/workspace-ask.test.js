/**
 * Asking the project a question, and reading your own role.
 *
 * Both used to call the standalone app's own endpoints, which do not exist in
 * this deployment: every click came back as an HTML 404 the page then tried to
 * read as JSON. And nothing on the web supplied a key to call a model with, so
 * even the paths that did exist had nothing to run on while the same project
 * answered an assistant fine.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const repo = vi.hoisted(() => ({ files: new Map(), asked: null, keySeen: null }));

vi.mock('../src/context.js', async (orig) => {
  const { getRequestAiKey } = await import('../src/ai-context.js');
  return {
    ...(await orig()),
    answerQuestion: vi.fn(async (args) => {
      repo.asked = args;
      repo.keySeen = await getRequestAiKey();
      if (args.question === 'refuse') {
        const err = new Error('401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}');
        err.status = 401;
        throw err;
      }
      return 'because the tiers were agreed in June';
    }),
  };
});

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

    async commit() { return { committed: true }; }
  },
}));

const { kvSet, keys, __resetMemory } = await import('../src/oauth/kv.js');
const { addProjectKey, writePersonalKey } = await import('../src/oauth/ai-keys.js');

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
  roles: [
    { slug: 'pm', name: 'Product lead', responsibilities: 'Owns what ships', email: 'priya@example.com' },
    { slug: 'eng', name: 'Engineer', responsibilities: 'Builds it', email: 'dev@example.com' },
  ],
  members: [{ key: 'git:priya@example.com', name: 'Priya', email: 'priya@example.com', workstreams: ['product'] }],
};

function project() {
  repo.files = new Map([
    ['.teamctx/config.json', JSON.stringify(CONFIG)],
    ['.teamctx/project.json', JSON.stringify({ name: 'Ledger', whys: [], tasks: [] })],
    ['.teamctx/workstreams/product.json', JSON.stringify({ id: 'product', name: 'Product', whys: [], tasks: [] })],
    ['.teamctx/workstreams/tech.json', JSON.stringify({ id: 'tech', name: 'Tech', whys: [], tasks: [] })],
    ['.teamctx/contributions.jsonl', ''],
    ['.teamctx/context/roles/pm.md', '# Product lead\n\nOpen decisions: pricing tiers.'],
  ]);
  repo.asked = null;
  repo.keySeen = null;
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

beforeEach(() => { __resetMemory(); project(); });

describe('asking the project a question', () => {
  it('answers from the part of the work that was asked about', async () => {
    await addProjectKey({ owner: 'acme', repo: 'ledger', email: 'maya@example.com', provider: 'anthropic', apiKey: 'sk-project' });
    const { status, body } = await call({
      action: 'ask', session: MANAGER, body: { workstream: 'product', question: 'why three tiers?' },
    });
    expect(status).toBe(200);
    expect(body.answer).toMatch(/tiers were agreed/);
    expect(repo.asked.question).toBe('why three tiers?');
  });

  it('runs on the project key when the person has none of their own', async () => {
    // Nothing on the web supplied a key at all, so this failed while the same
    // project answered an assistant, which resolves the key the same way.
    await addProjectKey({ owner: 'acme', repo: 'ledger', email: 'maya@example.com', provider: 'anthropic', apiKey: 'sk-project' });
    await call({ action: 'ask', session: MANAGER, body: { workstream: 'product', question: 'why?' } });
    expect(repo.keySeen).toBe('sk-project');
  });

  it('prefers the key the person saved for themselves', async () => {
    await addProjectKey({ owner: 'acme', repo: 'ledger', email: 'maya@example.com', provider: 'anthropic', apiKey: 'sk-project' });
    await writePersonalKey({ email: 'maya@example.com', provider: 'anthropic', apiKey: 'sk-mine' });
    await call({ action: 'ask', session: MANAGER, body: { workstream: 'product', question: 'why?' } });
    expect(repo.keySeen).toBe('sk-mine');
  });

  it('refuses a question about a part of the work somebody is not on', async () => {
    await lend();
    const { status } = await call({ action: 'ask', session: MEMBER, body: { workstream: 'tech', question: 'why?' } });
    expect(status).toBe(403);
  });

  it('refuses an empty question', async () => {
    const { status } = await call({ action: 'ask', session: MANAGER, body: { workstream: 'product', question: ' ' } });
    expect(status).toBe(400);
  });
});

describe('reading a role', () => {
  it('hands back the file teamctx compiled for it', async () => {
    await lend();
    const { status, body } = await call({ action: 'role', session: MEMBER, body: { slug: 'pm' } });
    expect(status).toBe(200);
    expect(body.md).toMatch(/Open decisions/);
  });

  it('is not somebody else to read', async () => {
    await lend();
    const { status } = await call({ action: 'role', session: MEMBER, body: { slug: 'eng' } });
    expect(status).toBe(403);
  });

  it('is any of them to the manager', async () => {
    const { status } = await call({ action: 'role', session: MANAGER, body: { slug: 'pm' } });
    expect(status).toBe(200);
  });

  it('says so when the project has no such role', async () => {
    const { status, body } = await call({ action: 'role', session: MANAGER, body: { slug: 'nobody' } });
    expect(status).toBe(403);
    expect(body.error).toMatch(/no role called/);
  });
});

describe('when the provider refuses the key', () => {
  // The mocked call refuses when asked to, which is what a provider does with a
  // key it does not accept — `keyWasRejected` reads the same shape either way.
  const REFUSED = 'refuse';

  it('says which key was refused, not what the provider replied', async () => {
    // A raw `401 {"type":"error"...}` on a page tells nobody what to do about it.
    await addProjectKey({ owner: 'acme', repo: 'ledger', email: 'maya@example.com', provider: 'anthropic', apiKey: 'sk-stale' });
    const { status, body } = await call({
      action: 'ask', session: MANAGER, body: { workstream: 'product', question: REFUSED },
    });
    expect(status).toBe(403);
    expect(body.error).toMatch(/refused by the provider/);
    expect(body.error).toMatch(/saved for this project/);
  });

  it('names your own key when that is the one it ran on', async () => {
    await writePersonalKey({ email: 'maya@example.com', provider: 'anthropic', apiKey: 'sk-mine' });
    const { body } = await call({
      action: 'ask', session: MANAGER, body: { workstream: 'product', question: REFUSED },
    });
    expect(body.error).toMatch(/saved against your account/);
  });

  it('says so plainly when the project has no key of its own', async () => {
    // With none stored anywhere, the call falls through to whatever key this
    // deployment was started with — a key the reader has never seen and may not
    // be able to change, which is what made the raw refusal so confusing.
    const { body } = await call({
      action: 'ask', session: MANAGER, body: { workstream: 'product', question: REFUSED },
    });
    expect(body.error).toMatch(/No AI key is set for acme\/ledger/);
    expect(body.error).toMatch(/started with/);
  });
});
