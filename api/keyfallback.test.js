/**
 * What happens when a provider refuses the key a request is running on.
 *
 * Two behaviours that are easy to confuse: a key the caller brought being
 * refused moves the call to the project's, and a request that brought no key at
 * all ends up on whatever the deployment itself was started with.
 */
import { describe, it, expect, vi } from 'vitest';

const seen = vi.hoisted(() => ({ keys: [] }));

vi.mock('../src/providers/anthropic.js', async () => {
  const { getRequestAiKey } = await import('../src/ai-context.js');
  return {
    id: 'anthropic',
    complete: vi.fn(async () => {
      const key = getRequestAiKey() || process.env.ANTHROPIC_API_KEY;
      seen.keys.push(key);
      if (key !== 'sk-project') {
        const err = new Error('401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}');
        err.status = 401;
        throw err;
      }
      return 'an answer';
    }),
  };
});

const { runWithAiKey } = await import('../src/ai-context.js');
const { callClaude } = await import('../src/ai.js');

describe('a key the provider refuses', () => {
  it('moves to the project key the way the connector does', async () => {
    seen.keys = [];
    const out = await runWithAiKey('sk-mine', () => callClaude({ prompt: 'hi', config: { provider: 'anthropic' } }),
      'anthropic', null, { fallback: () => ({ apiKey: 'sk-project', provider: 'anthropic' }) });
    expect(seen.keys).toEqual(['sk-mine', 'sk-project']);
    expect(out).toBe('an answer');
  });

  it('falls back to the key the deployment was started with, which is how self-hosting works', async () => {
    // Recorded because it is surprising from the hosted side: a project with no
    // key of its own quietly spends the deployment's, and the refusal that comes
    // back names a key the reader has never seen. The workspace says which key
    // was refused for exactly this reason — see api/workspace-ask.test.js.
    seen.keys = [];
    process.env.ANTHROPIC_API_KEY = 'sk-env-stale';
    await expect(runWithAiKey(null, () => callClaude({ prompt: 'hi', config: { provider: 'anthropic' } }), null, () => null))
      .rejects.toThrow(/API key is invalid/);
    expect(seen.keys).toEqual(['sk-env-stale']);
    delete process.env.ANTHROPIC_API_KEY;
  });
});
