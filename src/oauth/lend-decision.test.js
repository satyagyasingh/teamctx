import { describe, it, expect } from 'vitest';
import { lendDecision } from './lend-decision.js';

const SLUG = 'acme/ledger';
const managed = (id) => ({ managerKey: `github:${id}` });

describe('who may lend a project GitHub access', () => {
  it('lets the project manager lend it', () => {
    // The ordinary case: you ran init, so you are the manager, so this passes
    // rather than being a second permission to go and arrange.
    expect(lendDecision({ config: managed('1001'), userId: '1001', slug: SLUG }).ok).toBe(true);
  });

  it('lets the manager lend even without repository admin', () => {
    // A manager on a repo they do not administer is still the person teamctx
    // means; admin was only ever a proxy for this question.
    const r = lendDecision({ config: managed('1001'), userId: '1001', isAdmin: false, slug: SLUG });
    expect(r).toMatchObject({ ok: true, via: 'manager' });
  });

  it('refuses someone who is not the manager, even with admin', () => {
    // Repository admin does not make you this project's manager, and lending
    // hands a credential to everyone the roster names.
    const r = lendDecision({ config: managed('1001'), userId: '2002', isAdmin: true, slug: SLUG });
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/managed by someone else/);
  });

  it('falls back to repository admin when no manager is recorded', () => {
    const r = lendDecision({ config: {}, userId: '1001', isAdmin: true, slug: SLUG });
    expect(r).toMatchObject({ ok: true, via: 'admin' });
  });

  it('refuses a non-admin when no manager is recorded', () => {
    expect(lendDecision({ config: {}, userId: '1001', isAdmin: false, slug: SLUG }).ok).toBe(false);
  });

  it('refuses when the config could not be read at all', () => {
    // An unreadable config must not be treated as "no manager, go ahead".
    expect(lendDecision({ config: null, userId: '1001', isAdmin: false, slug: SLUG }).ok).toBe(false);
  });

  it('never blames permissions when the manager is simply someone else', () => {
    // The bug this replaces: every failure said "you need admin access",
    // including to the person who had it.
    const r = lendDecision({ config: managed('9999'), userId: '1001', isAdmin: true, slug: SLUG });
    expect(r.why).not.toMatch(/need admin access/);
  });
});
