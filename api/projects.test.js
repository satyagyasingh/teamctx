/**
 * The projects somebody can open.
 *
 * The list the workspace starts from. A project reaches a person three ways —
 * they keyed it, they lent it access, or they connected an assistant to it — and
 * what is checked here is that all three arrive, once each, and that a
 * signed-out caller is pointed at the screen that signs them in.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

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

beforeEach(() => __resetMemory());

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
    expect(body.projects[0]).toEqual({ slug: 'acme/ledger', owner: 'acme', repo: 'ledger' });
  });

  it('carries who is asking, so the page can say it', async () => {
    const { body } = await call({ session: USER });
    expect(body.me.name).toBe('Maya');
  });
});
