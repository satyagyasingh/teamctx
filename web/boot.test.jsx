/**
 * What the workspace does with the project it was handed.
 *
 * The app this came from asked the visitor to type a name and pick a role, then
 * remembered both in the browser. What is checked here is that it no longer asks
 * anything: the project comes from the address, the person comes from the
 * session, and a signed-out reader is sent to sign in rather than shown an empty
 * workspace.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from './App.jsx';

const PAYLOAD = {
  me: { name: 'Maya', role: 'admin', isManager: true },
  project: { name: 'Ledger', owner: 'acme', repo: 'ledger' },
  workstreams: [
    { id: 'project', name: 'Ledger', isProject: true, members: ['Maya', 'Priya'], whys: [{ id: 'p1', text: 'ship the ledger', whats: [] }] },
    { id: 'product', name: 'Product', isProject: false, members: ['Priya'], whys: [{ id: 'w1', text: 'price it right', whats: [] }] },
  ],
  contributions: { project: [], product: [{ id: 'c-1', ts: '2026-09-01T10:00:00Z', author: 'Priya', text: 'tiers', source: 'human', status: 'logged' }] },
  roles: [{ slug: 'pm', name: 'Product lead', details: 'Owns what ships' }],
  scopedTo: null,
};

let container, root;

function mount(path = '/project/acme/ledger') {
  window.history.replaceState(null, '', path);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => { root.render(createElement(App)); });
}

const answerWith = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: status === 200, status, json: async () => body,
})));

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
  vi.unstubAllGlobals();
});

describe('opening a project', () => {
  it('asks the server for the project named in the address', async () => {
    answerWith(200, PAYLOAD);
    await mount();
    expect(fetch).toHaveBeenCalledWith(
      '/api/project/acme/ledger?action=bootstrap',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('never asks who the visitor is', async () => {
    answerWith(200, PAYLOAD);
    await mount();
    // The modal that asked for a name and offered a role dropdown is gone, and
    // with it the chance to claim somebody else's work or somebody else's scope.
    expect(container.textContent).not.toMatch(/Welcome — sign in|Pick your role/);
    expect(container.querySelector('.modal-backdrop')).toBe(null);
    expect(container.textContent).toContain('signed in as Maya');
  });

  it('lists the project above the parts of the work', async () => {
    answerWith(200, PAYLOAD);
    await mount();
    const rows = [...container.querySelectorAll('.ws-item-row')].map(r => r.textContent);
    expect(rows[0]).toContain('Ledger');
    expect(rows[1]).toContain('Product');
  });

  it('shows the tree of whichever part is selected', async () => {
    answerWith(200, PAYLOAD);
    await mount();
    expect(container.textContent).toContain('ship the ledger');
  });

  it('sends a signed-out reader to sign in, where the server said', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { href: '', assign, pathname: '/project/acme/ledger' });
    answerWith(401, { error: 'Not signed in.', signIn: '/signin?returnTo=%2Fproject%2Facme%2Fledger' });
    await mount();
    expect(window.location.href).toBe('/signin?returnTo=%2Fproject%2Facme%2Fledger');
  });

  it('says so when the address names no project', async () => {
    answerWith(200, PAYLOAD);
    await mount('/');
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/No project in this address/);
  });

  it('says what went wrong rather than drawing an empty workspace', async () => {
    answerWith(403, { error: 'priya@example.com is not on the acme/ledger roster.' });
    await mount();
    expect(container.textContent).toMatch(/not on the acme\/ledger roster/);
  });
});
