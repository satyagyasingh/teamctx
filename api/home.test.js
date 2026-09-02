import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';

/**
 * There was no `/` route at all — every path started at `/settings`, which
 * assumes you already know what teamctx is and have a repository. A manager
 * sent the deployment URL had nowhere to arrive.
 */
let server, base;

beforeAll(async () => {
  process.env.TEAMCTX_BASE_URL = 'https://x.test';
  const { app } = await import('./oauth-server.js');
  server = http.createServer(app).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server?.close());

const get = async (path) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.text() };
};

describe('the front door', () => {
  it('answers at all', async () => {
    expect((await get('/')).status).toBe(200);
  });

  it('says what teamctx is before asking for anything', async () => {
    // Somebody arriving cold has not agreed to sign into anything yet.
    const { body } = await get('/');
    expect(body).toMatch(/why/i);
    expect(body).toMatch(/git repository/i);
  });

  it('lays out the whole path, not just the next click', async () => {
    // The issue this closes was never one broken screen — it was that no page
    // showed where the steps led.
    const { body } = await get('/');
    for (const step of ['Sign in with GitHub', 'Point it at a project', 'Add your AI key',
                        'Connect your assistant', 'Invite your team']) {
      expect(body, `missing step: ${step}`).toContain(step);
    }
  });

  it('sends a signed-out visitor to sign in', async () => {
    const { body } = await get('/');
    expect(body).toContain('/settings/signin');
    expect(body).toContain('Start here');
  });

  it('says signing in commits them to nothing', async () => {
    // The step people hesitate on, and the hesitation is reasonable.
    expect((await get('/')).body).toMatch(/creates nothing on its own/i);
  });

  it('makes clear the work does not stop at setup', async () => {
    // "This isn't a one-time setup wizard" — the loop is the product.
    expect((await get('/')).body).toMatch(/loop, not a setup wizard/i);
  });
});
