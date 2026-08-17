import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  upsertEnv, authorizeConnector, connectorsWithAuthorize, NoAuthorizeError,
} from './auth.core.js';
import { UnknownConnectorError } from '../../src/connectors/index.js';

describe('upsertEnv', () => {
  it('adds values to an empty file', () => {
    expect(upsertEnv('', { A: '1', B: '2' })).toBe('A=1\nB=2\n');
  });

  it('replaces a key in place, keeping its position', () => {
    expect(upsertEnv('A=old\nB=keep\n', { A: 'new' })).toBe('A=new\nB=keep\n');
  });

  it('keeps everything it was not asked to change', () => {
    // The normal case is a provider key already living in this file — rewriting
    // it from the new values alone would be a data-loss bug on first use.
    const before = '# my keys\nANTHROPIC_API_KEY=sk-ant-123\n\nOTHER=x\n';
    const after = upsertEnv(before, { DROPBOX_REFRESH_TOKEN: 'r1' });
    expect(after).toContain('ANTHROPIC_API_KEY=sk-ant-123');
    expect(after).toContain('# my keys');
    expect(after).toContain('OTHER=x');
    expect(after).toContain('DROPBOX_REFRESH_TOKEN=r1');
  });

  it('understands the export prefix people write', () => {
    expect(upsertEnv('export A=old\n', { A: 'new' })).toBe('A=new\n');
  });

  it('does not match a key that merely shares a prefix', () => {
    const after = upsertEnv('DROPBOX_APP_KEY_OLD=x\n', { DROPBOX_APP_KEY: 'new' });
    expect(after).toContain('DROPBOX_APP_KEY_OLD=x');
    expect(after).toContain('DROPBOX_APP_KEY=new');
  });

  it('separates appended values from existing content', () => {
    expect(upsertEnv('A=1\n', { B: '2' })).toBe('A=1\n\nB=2\n');
  });

  it('always ends with a newline', () => {
    expect(upsertEnv('A=1', { B: '2' })).toMatch(/\n$/);
  });

  it('handles a file with CRLF line endings', () => {
    expect(upsertEnv('A=old\r\nB=keep\r\n', { A: 'new' })).toContain('A=new');
  });
});

describe('authorizeConnector', () => {
  let cwd;
  const envPath = () => join(cwd, '.env.local');

  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'teamctx-auth-')); });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); vi.restoreAllMocks(); });

  const answers = list => {
    const queue = [...list];
    return async () => queue.shift() ?? '';
  };

  it('writes what the connector returns', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ refresh_token: 'r-live', access_token: 'sl.x' }),
    }));

    const r = await authorizeConnector({
      from: 'dropbox', cwd, env: {},
      ask: answers(['appkey', 'appsecret', 'thecode']),
    });

    expect(r.keys).toEqual(['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']);
    const written = readFileSync(envPath(), 'utf-8');
    expect(written).toContain('DROPBOX_REFRESH_TOKEN=r-live');
    expect(written).toContain('DROPBOX_APP_KEY=appkey');
  });

  it('preserves an existing .env.local', async () => {
    writeFileSync(envPath(), 'ANTHROPIC_API_KEY=sk-ant-keepme\n');
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ refresh_token: 'r1' }),
    }));

    await authorizeConnector({
      from: 'dropbox', cwd, env: {}, ask: answers(['k', 's', 'c']),
    });
    expect(readFileSync(envPath(), 'utf-8')).toContain('ANTHROPIC_API_KEY=sk-ant-keepme');
  });

  it('reports which values it replaced, so re-running is not silent', async () => {
    writeFileSync(envPath(), 'DROPBOX_REFRESH_TOKEN=old\n');
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ refresh_token: 'new' }),
    }));

    const r = await authorizeConnector({
      from: 'dropbox', cwd, env: {}, ask: answers(['k', 's', 'c']),
    });
    expect(r.replaced).toEqual(['DROPBOX_REFRESH_TOKEN']);
    expect(readFileSync(envPath(), 'utf-8')).toContain('DROPBOX_REFRESH_TOKEN=new');
  });

  it('returns names and never values, since the caller prints them', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ refresh_token: 'secret-token' }),
    }));

    const r = await authorizeConnector({
      from: 'dropbox', cwd, env: {}, ask: answers(['k', 's', 'c']),
    });
    // A refresh token that reaches a terminal lives in scrollback and history,
    // which would defeat writing it to a 0600 file.
    expect(JSON.stringify(r)).not.toContain('secret-token');
  });

  it('writes nothing when the flow fails', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }),
    }));

    await expect(authorizeConnector({
      from: 'dropbox', cwd, env: {}, ask: answers(['k', 's', 'stale-code']),
    })).rejects.toThrow(/single-use/);
    expect(existsSync(envPath()), 'a failed login must not leave a file behind').toBe(false);
  });

  it('says so when a connector has no login flow', async () => {
    await expect(authorizeConnector({ from: 'folder', cwd, ask: answers([]) }))
      .rejects.toThrow(NoAuthorizeError);
    await expect(authorizeConnector({ from: 'folder', cwd, ask: answers([]) }))
      .rejects.toThrow(/dropbox/);          // names the ones that do
  });

  it('rejects an unknown connector', async () => {
    await expect(authorizeConnector({ from: 'dropbx', cwd, ask: answers([]) }))
      .rejects.toThrow(UnknownConnectorError);
  });

  it('can be pointed at a different file', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ refresh_token: 'r1' }),
    }));

    await authorizeConnector({
      from: 'dropbox', cwd, env: {}, envFile: '.env.test', ask: answers(['k', 's', 'c']),
    });
    expect(existsSync(join(cwd, '.env.test'))).toBe(true);
  });
});

describe('connectorsWithAuthorize', () => {
  it('lists only the connectors that can log in', () => {
    const names = connectorsWithAuthorize();
    expect(names).toContain('dropbox');
    // The filesystem is already there; there is nothing to log in to.
    expect(names).not.toContain('folder');
  });
});
