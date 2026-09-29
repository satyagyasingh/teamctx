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

describe('contributing from the workspace', () => {
  const answers = (...bodies) => {
    const queue = [...bodies];
    return vi.stubGlobal('fetch', vi.fn(async () => {
      const next = queue.shift();
      return { ok: next.status === 200, status: next.status, json: async () => next.body };
    }));
  };

  const type = async (text) => {
    const box = container.querySelector('.contribute textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
        .set.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = [...container.querySelectorAll('.contribute button')]
      .find(b => b.textContent.includes('update context'));
    await act(async () => submit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };

  const PROPOSED = {
    summary: 'records the pricing decision',
    operations: [{ type: 'addWhy', text: 'tiers decided' }],
    willQueue: false,
  };

  it('shows what the model proposed before anything is written', async () => {
    answers({ status: 200, body: PAYLOAD }, { status: 200, body: PROPOSED });
    await mount();
    await type('we settled on three tiers');
    expect(container.textContent).toContain('Proposed change');
    expect(container.textContent).toContain('records the pricing decision');
    expect(fetch.mock.calls[1][0]).toContain('action=propose');
  });

  it('offers to send it for review when the project reviews this kind of change', async () => {
    answers({ status: 200, body: PAYLOAD }, { status: 200, body: { ...PROPOSED, willQueue: true } });
    await mount();
    await type('we settled on three tiers');
    expect(container.textContent).toContain('send for review');
    expect(container.textContent).not.toContain('approve & merge');
  });

  it('hands the proposal back when it is approved, rather than asking again', async () => {
    answers(
      { status: 200, body: PAYLOAD },
      { status: 200, body: PROPOSED },
      { status: 200, body: { mode: 'applied', queued: false, workstream: { whys: [{ id: 'n1', text: 'tiers decided', whats: [] }] }, contributions: [] } },
    );
    await mount();
    await type('we settled on three tiers');
    const approve = [...container.querySelectorAll('.proposal-actions button')][0];
    await act(async () => approve.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const sent = JSON.parse(fetch.mock.calls[2][1].body);
    expect(fetch.mock.calls[2][0]).toContain('action=apply');
    expect(sent.operations).toEqual(PROPOSED.operations);
    expect(container.textContent).toContain('tiers decided');
  });

  it('keeps the contribution on the record when the proposal is rejected', async () => {
    answers(
      { status: 200, body: PAYLOAD },
      { status: 200, body: PROPOSED },
      { status: 200, body: { id: 'web-1', contribution: { id: 'web-1', ts: '2026-09-28T10:00:00Z', author: 'Maya', text: 'we settled on three tiers', source: 'web', status: 'logged' } } },
    );
    await mount();
    await type('we settled on three tiers');
    const reject = [...container.querySelectorAll('.proposal-actions button')][1];
    await act(async () => reject.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(fetch.mock.calls[2][0]).toContain('action=discard');
    expect(container.textContent).not.toContain('Proposed change');
  });
});

describe('the review queue on the page', () => {
  const QUEUED = {
    ...PAYLOAD,
    pending: [
      {
        id: 'c-9',
        author: 'Priya',
        summary: 'records the pricing decision',
        text: 'we settled on three tiers',
        workstream: 'project',
        operations: [
          { type: 'addWhy', text: 'tiers decided' },
          { type: 'deleteStatement', id: '4f329zt7', was: null, gone: true, summary: 'obsolete' },
        ],
      },
      { id: 'c-8', author: 'Dev', summary: 'uptime', text: '', workstream: 'product', operations: [{ type: 'addWhy', text: 'uptime' }] },
    ],
  };

  const answerWith = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status === 200, status, json: async () => body,
  })));

  it('stays folded away, so what is waiting does not bury the box', async () => {
    answerWith(200, QUEUED);
    await mount();
    expect(container.textContent).toContain('Waiting on you · 1');
    // Folded: the changes inside are not on the page until it is opened.
    expect(container.textContent).not.toContain('tiers decided');
    expect(container.querySelector('.contribute')).toBeTruthy();
  });

  it('shows only what is waiting on the part of the work being read', async () => {
    answerWith(200, QUEUED);
    await mount();
    expect(container.textContent).toContain('records the pricing decision');
    expect(container.textContent).not.toContain('uptime');
  });

  it('opens one at a time, and says what a change no longer points at', async () => {
    answerWith(200, QUEUED);
    await mount();
    const row = container.querySelector('.log-meta');
    await act(async () => row.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('tiers decided');
    expect(container.textContent).toMatch(/Already gone from the context/);
    expect(container.textContent).not.toMatch(/unknown id/);
  });

  it('leaves a change that points at nothing out of the approval', async () => {
    answerWith(200, QUEUED);
    await mount();
    await act(async () => container.querySelector('.log-meta').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    // One of the two is picked, so the button offers that one rather than both.
    expect(container.textContent).toContain('approve 1 of 2');
  });

  it('sends the picked changes, and only those', async () => {
    answerWith(200, QUEUED);
    await mount();
    await act(async () => container.querySelector('.log-meta').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const approve = [...container.querySelectorAll('.proposal-actions button')][0];
    await act(async () => approve.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const sent = JSON.parse(fetch.mock.calls.at(-1)[1].body);
    expect(fetch.mock.calls.at(-1)[0]).toContain('action=approve');
    expect(sent).toMatchObject({ id: 'c-9', only: [0] });
  });
});

describe('when the queue is not yours', () => {
  const answerWith = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status === 200, status, json: async () => body,
  })));

  it('says work is waiting and who has it, rather than showing nothing', async () => {
    answerWith(200, {
      ...PAYLOAD,
      me: { name: 'Priya', role: 'pm', isManager: false },
      pending: [],
      waiting: { total: 2, managerName: 'Maya' },
    });
    await mount();
    expect(container.textContent).toMatch(/2 changes sent for review, waiting on Maya/);
  });

  it('tells a manager when what is waiting is on another part of the work', async () => {
    answerWith(200, {
      ...PAYLOAD,
      pending: [{ id: 'c-1', author: 'Priya', summary: 's', text: '', workstream: 'product', operations: [] }],
      waiting: { total: 1, managerName: 'Maya' },
    });
    await mount();
    expect(container.textContent).toMatch(/1 change waiting on you in another part of the work/);
  });
});

describe('the projects screen', () => {
  const PROJECTS = {
    me: { name: 'Maya', canCreate: true },
    projects: [
      { slug: 'acme/ledger', owner: 'acme', repo: 'ledger', name: 'Ledger' },
      { slug: 'acme/atlas', owner: 'acme', repo: 'atlas', name: null },
    ],
  };

  const answerWith = (body) => vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => body,
  })));

  it('draws each project as something you can click, not a line of text', async () => {
    // The first attempt borrowed the sidebar's row, which is declared under
    // `aside.sidebar` and so styled nothing out here.
    answerWith(PROJECTS);
    await mount('/projects');
    const cards = container.querySelectorAll('a.project-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('href')).toBe('/project/acme/ledger');
    expect(cards[0].textContent).toContain('Ledger');
    expect(cards[0].textContent).toContain('acme/ledger');
  });

  it('falls back to the repository name when the project has not been read yet', async () => {
    answerWith(PROJECTS);
    await mount('/projects');
    expect(container.querySelectorAll('.project-name')[1].textContent).toBe('atlas');
  });

  it('makes both ways of adding a project look like the buttons they are', async () => {
    answerWith(PROJECTS);
    await mount('/projects');
    const create = container.querySelector('a.link-button.primary');
    expect(create.getAttribute('href')).toBe('/settings/new-project');
    const add = [...container.querySelectorAll('button')].find(b => /Add one you already have/.test(b.textContent));
    expect(add).toBeTruthy();
    expect(add.className).not.toContain('ghost');
  });

  it('does not offer to create one where creating is not possible', async () => {
    answerWith({ ...PROJECTS, me: { name: 'Priya', canCreate: false } });
    await mount('/projects');
    expect(container.querySelector('a.link-button.primary')).toBe(null);
    expect(container.textContent).toMatch(/a project is created from a GitHub account/);
  });

  it('says so plainly when there is nothing to open', async () => {
    answerWith({ ...PROJECTS, projects: [] });
    await mount('/projects');
    expect(container.querySelector('.projects-empty')).toBeTruthy();
  });
});

describe('deciding on a proposal one change at a time', () => {
  const THREE = {
    summary: 'records the pricing decision',
    operations: [
      { type: 'addWhy', text: 'first' },
      { type: 'addWhy', text: 'second' },
      { type: 'addWhy', text: 'third' },
    ],
    willQueue: false,
  };

  const answers = (...bodies) => {
    const queue = [...bodies];
    return vi.stubGlobal('fetch', vi.fn(async () => {
      const next = queue.shift();
      return { ok: next.status === 200, status: next.status, json: async () => next.body };
    }));
  };

  const type = async (text) => {
    const box = container.querySelector('.contribute textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = [...container.querySelectorAll('.contribute button')].find(b => b.textContent.includes('update context'));
    await act(async () => submit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };

  it('applies only the changes still ticked', async () => {
    answers(
      { status: 200, body: PAYLOAD },
      { status: 200, body: THREE },
      { status: 200, body: { mode: 'applied', workstream: { whys: [] }, contributions: [] } },
    );
    await mount();
    await type('we settled on three tiers');
    const boxes = container.querySelectorAll('.proposal .op-card input[type=checkbox]');
    expect(boxes).toHaveLength(3);
    await act(async () => boxes[1].click());
    const approve = container.querySelectorAll('.proposal-actions button')[0];
    expect(approve.textContent).toMatch(/2 of 3/);
    await act(async () => approve.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const sent = JSON.parse(fetch.mock.calls.at(-1)[1].body);
    expect(sent.operations.map(o => o.text)).toEqual(['first', 'third']);
  });

  it('refuses to apply when nothing is left ticked', async () => {
    answers({ status: 200, body: PAYLOAD }, { status: 200, body: THREE });
    await mount();
    await type('x');
    const boxes = [...container.querySelectorAll('.proposal .op-card input[type=checkbox]')];
    for (const b of boxes) await act(async () => b.click());
    expect(container.querySelectorAll('.proposal-actions button')[0].disabled).toBe(true);
  });

  it('says why a change is going to the manager rather than landing', async () => {
    answers(
      { status: 200, body: PAYLOAD },
      { status: 200, body: { ...THREE, willQueue: true, queueReason: 'destructive' } },
    );
    await mount();
    await type('x');
    expect(container.textContent).toMatch(/removes or rewrites something already there/);
  });

  it('says when it is the project reviewing everything, not the change', async () => {
    answers(
      { status: 200, body: PAYLOAD },
      { status: 200, body: { ...THREE, willQueue: true, queueReason: 'policy' } },
    );
    await mount();
    await type('x');
    expect(container.textContent).toMatch(/reviews every change before it lands/);
  });
});
