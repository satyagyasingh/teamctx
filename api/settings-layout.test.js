import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { kvSet, keys, __resetMemory } from '../src/oauth/kv.js';

/**
 * The page was three stacked `<h1>`s separated by horizontal rules in a 34rem
 * column, with the first section carrying no heading at all — so it read as one
 * long document you scrolled through rather than three things you could act on
 * one at a time. These assert the structure, not the prose.
 */
let server, base;

beforeAll(async () => {
  process.env.TEAMCTX_BASE_URL = 'https://x.test';
  const { app } = await import('./oauth-server.js');
  server = http.createServer(app).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server?.close());

const settings = async () => {
  __resetMemory();
  await kvSet(keys.session('s'), { id: '1', login: 'ada', name: 'Ada', token: 't' });
  const r = await fetch(`${base}/settings`, { headers: { cookie: 'teamctx_sid=s' } });
  return await r.text();
};

const count = (body, re) => (body.match(re) || []).length;

describe('the settings page has a shape', () => {
  it('has one page heading, not one per section', async () => {
    expect(count(await settings(), /<h1>/g)).toBe(1);
  });

  it('gives every section its own heading', async () => {
    // The AI-key section had none, so it read as a continuation of the header.
    expect(count(await settings(), /<h2>/g)).toBe(3);
  });

  it('separates sections with cards rather than rules', async () => {
    const body = await settings();
    expect(count(body, /class="card"/g)).toBe(3);
    expect(count(body, /<hr/g)).toBe(0);
  });

  it('closes every section it opens', async () => {
    const body = await settings();
    expect(count(body, /<section/g)).toBe(count(body, /<\/section>/g));
  });

  it('lays out wide enough for more than one column', async () => {
    expect(await settings()).toContain('<body class="wide">');
  });

  it('does not paint form controls out of the colour scheme', async () => {
    // A transparent select opted out, so the OS painted its popup list
    // white-on-white — options present, invisible, and only findable by the
    // scrollbar next to them.
    const body = await settings();
    expect(body).not.toContain('background:transparent');
    expect(body).toContain('option{background:Field');
  });

  it('packs the cards instead of leaving a hole under the short one', async () => {
    // Three cards of different heights in a two-column grid put the third on a
    // new row, leaving a gap beside it.
    const body = await settings();
    expect(body).toContain('columns:2');
    expect(body).toContain('break-inside:avoid');
  });

  it('has a colour other than black and white', async () => {
    const body = await settings();
    expect(body).toContain('--accent');
    expect(body).toContain('background:var(--accent)');
  });

  it('shows focus, which an outline-less control does not', async () => {
    expect(await settings()).toContain(':focus{outline');
  });

  it('pins who you are to the edge, away from what you do', async () => {
    expect(await settings()).toContain('.bar .who{margin-left:auto');
  });

  it('never puts a button inside a link', async () => {
    // Invalid, and browsers render the pair as one stretched control with
    // whatever follows crowding it.
    expect(await settings()).not.toMatch(/<a[^>]*>\s*<button/);
  });

  it('offers a way back out', async () => {
    // A settings page with no link home is a dead end you close the tab on.
    expect(await settings()).toContain('href="/"');
  });

  it('keeps the page prose narrow, since only settings opted in', async () => {
    const home = await (await fetch(`${base}/`)).text();
    expect(home).not.toContain('<body class="wide">');
  });
});

describe('picking a project, and telling the header apart', () => {
  const withRepos = async () => {
    __resetMemory();
    await kvSet(keys.session('s'), { id: '1', login: 'ada', name: 'Ada', token: 't' });
    const real = globalThis.fetch;
    globalThis.fetch = async (u, o) => (String(u).includes('api.github.com/user/repos')
      ? { ok: true, json: async () => ([
          { full_name: 'acme/ledger', private: true, permissions: { push: true } },
          { full_name: 'acme/docs', private: false, permissions: { push: true } },
        ]) }
      : real(u, o));
    try {
      return await (await real(`${base}/settings`, { headers: { cookie: 'teamctx_sid=s' } })).text();
    } finally { globalThis.fetch = real; }
  };

  it('lets you type to narrow the list', async () => {
    // A select only jumps on first letter, so one repo among dozens meant
    // scrolling. A datalist matches any part of what is typed.
    const body = await withRepos();
    expect(body).toContain('<datalist');
    expect(body).toContain('Type to search');
  });

  it('gives each picker its own list', async () => {
    // Two datalists sharing an id silently leaves the second one empty.
    const body = await withRepos();
    expect(body).toContain('id="project-list"');
    expect(body).toContain('id="lendProject-list"');
  });

  it('still accepts a project the listing missed', async () => {
    // The listing is capped, so it can miss one. A datalist takes free text;
    // a select would have made that unreachable.
    const body = await withRepos();
    expect(body).toContain('list="project-list"');
    expect(body).not.toContain('<select id="project"');
  });

  it('does not make an action look like a link', async () => {
    // Home goes somewhere, New project makes something, and the login is who
    // you are — three different things that looked identical.
    const body = await withRepos();
    expect(body).toContain('class="btn-sm"');
    expect(body).toContain('class="who muted"');
  });
});
