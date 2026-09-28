/**
 * Where a deployed request lands.
 *
 * Vercel checks the filesystem before it consults a rewrite, so a bundle built
 * at the output root would quietly take over the home page and every route that
 * rewrites into the server. That is why the workspace builds under `/app`, and
 * this is what holds it there — along with the rest of the routing, which has
 * already produced one 404 by omission.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8'));
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf-8');

const destinationOf = (path) => config.rewrites.find(r => {
  const pattern = new RegExp(`^${r.source
    .replace(/:[a-z]+\*/gi, '.*')
    .replace(/:[a-z]+/gi, '[^/]+')}$`);
  return pattern.test(path);
})?.destination;

describe('what still reaches the server', () => {
  for (const path of ['/', '/signin', '/settings', '/settings/new-project',
                      '/oauth/choose', '/authorize', '/token']) {
    it(`${path} is rendered by the server`, () => {
      expect(destinationOf(path)).toBe('/api/oauth-server');
    });
  }
});

describe('what the workspace bundle answers', () => {
  it('serves the project list from the built app', () => {
    expect(destinationOf('/projects')).toBe('/app/index.html');
  });

  it('serves a project page from the built app', () => {
    expect(destinationOf('/project/acme/ledger')).toBe('/app/index.html');
  });

  it('serves anything under a project from it too, so its own routes work', () => {
    expect(destinationOf('/project/acme/ledger/role/pm')).toBe('/app/index.html');
  });

  it('is built under /app, where it cannot shadow a server route', () => {
    // An `index.html` at the output root is served before any rewrite is read.
    expect(vite).toMatch(/base: '\/app\/'/);
    expect(vite).toMatch(/outDir: '\.\.\/dist\/app'/);
  });
});

describe('what is left alone', () => {
  it('does not rewrite the workspace API out from under itself', () => {
    expect(destinationOf('/api/project/acme/ledger')).toBe(undefined);
  });

  it('does not rewrite the connector endpoint', () => {
    expect(destinationOf('/api/mcp/acme/ledger')).toBe(undefined);
  });

  it('leaves the project list API to its own function', () => {
    expect(destinationOf('/api/projects')).toBe(undefined);
  });
});
