import { describe, it, expect } from 'vitest';
import { repairDecision, isBrokenGate } from './manager-repair.js';

const GH = { key: 'github:1001', name: 'Ada', login: 'ada' };
const NOBODY = { key: 'name:Ada', name: 'Ada', login: null };

describe('deciding whether a manager gate may be repaired', () => {
  it('repairs a display-name gate to the caller', () => {
    const r = repairDecision({ config: { managerKey: 'name:Ada Lovelace' }, actor: GH });
    expect(r).toMatchObject({ ok: true, from: 'name:Ada Lovelace', to: 'github:1001' });
  });

  it('refuses a gate that actually works', () => {
    // The whole difference between a repair and a backdoor. A real gate must
    // never be replaceable by whoever happens to be calling.
    const r = repairDecision({ config: { managerKey: 'git:someone@else.com' }, actor: GH });
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/real identity/i);
  });

  it('refuses a github: gate belonging to someone else', () => {
    expect(repairDecision({ config: { managerKey: 'github:9999' }, actor: GH }).ok).toBe(false);
  });

  it('refuses when any one of several keys is real', () => {
    // A project that added a working identity alongside the broken one is no
    // longer locked out, so there is nothing to repair — and replacing the pair
    // would drop the key that works.
    const config = { managerKey: 'name:Ada', managerKeys: ['github:1001'] };
    expect(repairDecision({ config, actor: GH }).ok).toBe(false);
  });

  it('refuses when there is no gate at all', () => {
    // No gate is the bootstrap case: anyone may approve and the first to pin it
    // wins. Repair would look like it had granted something.
    expect(repairDecision({ config: {}, actor: GH }).ok).toBe(false);
  });

  it('refuses a caller who has no stable identity either', () => {
    // Writing a second name: gate would look like it worked and change nothing.
    const r = repairDecision({ config: { managerKey: 'name:Ada' }, actor: NOBODY });
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/user\.email|another gate/i);
  });

  it('says which gates are broken', () => {
    expect(isBrokenGate({ managerKey: 'name:Ada' })).toBe(true);
    expect(isBrokenGate({ managerKey: 'git:a@b.com' })).toBe(false);
    expect(isBrokenGate({})).toBe(false);
  });
});
