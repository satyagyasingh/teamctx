/**
 * The projects somebody can open.
 *
 * The list the workspace starts from. A project reaches a person three ways —
 * they keyed it, they lent it access, or they connected an assistant to it — and
 * what is checked here is that all three arrive, once each, and that a
 * signed-out caller is pointed at the screen that signs them in.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const { kvSet, keys, __resetMemory } = await import('../src/oauth/kv.js');
const { addProjectKey } = await import('../src/oauth/ai-keys.js');

let handler;
beforeAll(async () => { handler = (await import('./projects.js')).default; });

const USER = { id: '7', login: 'maya', name: 'Maya', email: 'maya@example.com', token: 'gho-maya' };

async function call({ session = null } = {}) {
  if (session) await kvSet(keys.session('s'), session);
  const req = { query: {}, headers: session ? { cookie: 'teamctx_sid=s' } : {} };
  let code = 200; let payload;
  const res = { status(c) { code = c; return this; }, json(b) { payload = b; return this; } };
  await handler(req, res);
  return { status: code, body: payload };
}

/**
 * GitHub, without GitHub.
 *
 * Naming a project means reading a file out of its repository, and a test that
 * reaches the network is a test that fails on somebody else's outage. Every case
 * here starts with a repository that answers; the ones that care about failure
 * say so themselves.
 */
const githubAnswers = (config = { project: 'Ledger' }) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ content: Buffer.from(JSON.stringify(config)).toString('base64') }),
})));

beforeEach(() => {
  __resetMemory();
  githubAnswers();
});
afterEach(() => vi.unstubAllGlobals());

describe('listing what somebody can open', () => {
  it('sends a signed-out caller to the screen that signs them in', async () => {
    const { status, body } = await call();
    expect(status).toBe(401);
    expect(body.signIn).toBe('/signin?returnTo=%2Fprojects');
  });

  it('says so plainly when there is nothing yet', async () => {
    const { status, body } = await call({ session: USER });
    expect(status).toBe(200);
    expect(body.projects).toEqual([]);
  });

  it('gathers a project however it reached them, and names it once', async () => {
    await kvSet(keys.connectedProjects('maya@example.com'), { projects: ['acme/ledger'] });
    await kvSet(keys.lentProjects('7'), { projects: ['acme/ledger', 'acme/atlas'] });
    const { body } = await call({ session: USER });
    expect(body.projects.map(p => p.slug)).toEqual(['acme/atlas', 'acme/ledger']);
  });

  it('splits each one into the owner and repo the address needs', async () => {
    await kvSet(keys.connectedProjects('maya@example.com'), { projects: ['acme/ledger'] });
    const { body } = await call({ session: USER });
    expect(body.projects[0]).toMatchObject({ slug: 'acme/ledger', owner: 'acme', repo: 'ledger' });
  });

  it('carries what the project calls itself, so the list is not a list of repositories', async () => {
    await kvSet(keys.connectedProjects('maya@example.com'), { projects: ['acme/ledger'] });
    await kvSet(keys.projectName('acme', 'ledger'), { name: 'Ledger' });
    expect((await call({ session: USER })).body.projects[0].name).toBe('Ledger');
  });

  it('leaves one it cannot read right now unnamed, rather than holding up the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await kvSet(keys.connectedProjects('maya@example.com'), { projects: ['acme/ledger'] });
    const { status, body } = await call({ session: USER });
    expect(status).toBe(200);
    expect(body.projects[0]).toMatchObject({ slug: 'acme/ledger', name: null });
  });

  it('carries who is asking, so the page can say it', async () => {
    const { body } = await call({ session: USER });
    expect(body.me.name).toBe('Maya');
  });
});

describe('adding a project somebody already has', () => {
  const post = async ({ session = USER, project } = {}) => {
    if (session) await kvSet(keys.session('s'), session);
    const req = { method: 'POST', query: {}, body: { project }, headers: session ? { cookie: 'teamctx_sid=s' } : {} };
    let code = 200; let payload;
    const res = { status(c) { code = c; return this; }, json(b) { payload = b; return this; } };
    await handler(req, res);
    return { status: code, body: payload };
  };

  const github = (ok) => vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    json: async () => ({ content: Buffer.from(JSON.stringify({ project: 'Ledger' })).toString('base64') }),
  })));

  it('remembers it once teamctx can see the project', async () => {
    github(true);
    const { status, body } = await post({ project: 'acme/ledger' });
    expect(status).toBe(200);
    expect(body.project).toEqual({ slug: 'acme/ledger', owner: 'acme', repo: 'ledger' });
    expect((await call({ session: USER })).body.projects.map(p => p.slug)).toEqual(['acme/ledger']);
  });

  it('takes a pasted GitHub address as well as owner/repo', async () => {
    github(true);
    const { body } = await post({ project: 'https://github.com/acme/ledger.git' });
    expect(body.project.slug).toBe('acme/ledger');
  });

  it('refuses a repository it cannot see a project in', async () => {
    github(false);
    const { status, body } = await post({ project: 'acme/nothing' });
    expect(status).toBe(404);
    expect(body.error).toMatch(/no teamctx project|cannot see it/);
  });

  it('says plainly that adding one needs a GitHub sign-in', async () => {
    const { status, body } = await post({ session: { ...USER, token: null }, project: 'acme/ledger' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/needs a GitHub sign-in/);
  });

  it('refuses something that is not owner/repo', async () => {
    expect((await post({ project: 'ledger' })).status).toBe(400);
  });
});
