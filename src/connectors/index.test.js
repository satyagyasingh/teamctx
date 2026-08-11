import { describe, it, expect } from 'vitest';
import {
  getConnector, knownConnectorNames, listConnectors,
  UnknownConnectorError,
} from './index.js';

describe('connector registry', () => {
  it('resolves a known connector by name', () => {
    expect(getConnector('folder').name).toBe('folder');
  });

  it('is case-insensitive, since the name comes off a command line', () => {
    expect(getConnector('FOLDER').name).toBe('folder');
  });

  it('names the known connectors when one is not found', () => {
    // A typo'd source must be as loud as a typo'd path already is — importing
    // nothing and reporting success is the failure worth avoiding.
    expect(() => getConnector('slak')).toThrow(UnknownConnectorError);
    expect(() => getConnector('slak')).toThrow(/unknown connector "slak"/);
    expect(() => getConnector('slak')).toThrow(/folder/);
  });

  it('treats a missing name as unknown rather than defaulting', () => {
    expect(() => getConnector(undefined)).toThrow(UnknownConnectorError);
    expect(() => getConnector('')).toThrow(UnknownConnectorError);
  });

  it('lists names in a stable order', () => {
    expect(knownConnectorNames()).toEqual([...knownConnectorNames()].sort());
  });

  it('describes each connector for help output', () => {
    for (const c of listConnectors()) {
      expect(c.name).toBeTruthy();
      expect(c.describe, `${c.name} has no describe`).toBeTruthy();
    }
  });
});

describe('every connector satisfies the contract', () => {
  // The point of the contract is that a reviewer can check a new connector
  // against it mechanically, rather than by reading the whole file.
  for (const { name } of listConnectors()) {
    describe(name, () => {
      const c = getConnector(name);

      it('exports name, describe, auth, list and fetch', () => {
        expect(c.name).toBe(name);
        expect(typeof c.describe).toBe('string');
        expect(typeof c.auth).toBe('function');
        expect(typeof c.list).toBe('function');
        expect(typeof c.fetch).toBe('function');
      });

      it('returns an auth result rather than throwing', () => {
        // A missing token should print how to set it, not a stack trace.
        const r = c.auth({});
        expect(r).toBeTruthy();
        expect(typeof r.ok).toBe('boolean');
        if (!r.ok) expect(r.help, `${name} must explain how to authenticate`).toBeTruthy();
      });

      it('contains no AI logic', async () => {
        // Distilling is shared and already built. A connector that reaches for
        // the model is doing someone else's job.
        const { readFileSync } = await import('fs');
        const src = readFileSync(new URL(`./${name}.js`, import.meta.url), 'utf-8');
        expect(src).not.toMatch(/from '\.\.\/ai\.js'|providers\//);
      });
    });
  }
});
