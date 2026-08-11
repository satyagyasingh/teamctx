import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('./contribute.core.js', () => ({ contributeCore: vi.fn() }));

import { importDocuments } from './import.core.js';
import { contributeCore } from './contribute.core.js';
import { UnknownWorkstreamError } from './role.core.js';

let root;
const write = (rel, text) => {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text);
};
const queued = (id = 'c-1') => ({
  id, mode: 'queued', summary: 's', operations: [{ type: 'addWhy', text: 't' }], workstream: 'main',
});

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), 'teamctx-importcore-'));
  contributeCore.mockResolvedValue(queued());
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('importDocuments', () => {
  it('enqueues one contribution per document', async () => {
    write('docs/a.md', '# A\n\nalpha');
    write('docs/b.md', '# B\n\nbravo');

    const r = await importDocuments({ paths: ['docs'], cwd: root });

    expect(contributeCore).toHaveBeenCalledTimes(2);
    expect(r.results.map(x => x.id)).toEqual(['docs/a.md', 'docs/b.md']);
    expect(r.failures).toEqual([]);
  });

  it('never applies directly — everything goes to the review queue', async () => {
    // Import must not be a second way into shared context.
    write('docs/a.md', 'alpha');
    await importDocuments({ paths: ['docs'], cwd: root });
    expect(contributeCore).toHaveBeenCalledWith(expect.objectContaining({ apply: false }));
  });

  it('records the originating file as the contribution source', async () => {
    write('docs/strategy.md', 'alpha');
    await importDocuments({ paths: ['docs'], cwd: root });
    expect(contributeCore).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'import:docs/strategy.md' }),
    );
  });

  it('passes the document text through unchanged', async () => {
    write('docs/a.md', '# A\n\nthe body');
    await importDocuments({ paths: ['docs'], cwd: root });
    expect(contributeCore).toHaveBeenCalledWith(
      expect.objectContaining({ text: '# A\n\nthe body' }),
    );
  });

  it('distills documents with document intent, not contribution intent', async () => {
    // Prose written for another purpose is mostly not durable team context;
    // without this the distiller turns headings and dates into Why nodes.
    write('docs/a.md', 'alpha');
    await importDocuments({ paths: ['docs'], cwd: root });
    expect(contributeCore).toHaveBeenCalledWith(expect.objectContaining({ intent: 'document' }));
  });

  it('targets the requested workstream', async () => {
    write('docs/a.md', 'alpha');
    await importDocuments({ paths: ['docs'], cwd: root, workstreamId: 'infra' });
    expect(contributeCore).toHaveBeenCalledWith(expect.objectContaining({ workstreamId: 'infra' }));
  });
});

describe('importDocuments — dry run', () => {
  it('reads and reports without enqueueing anything', async () => {
    write('docs/a.md', '# A\n\nalpha');
    const r = await importDocuments({ paths: ['docs'], cwd: root, dryRun: true });

    expect(contributeCore).not.toHaveBeenCalled();
    expect(r.documents.map(d => d.id)).toEqual(['docs/a.md']);
    expect(r.dryRun).toBe(true);
  });

  it('still surfaces what would have been skipped', async () => {
    write('docs/a.md', 'alpha');
    write('docs/empty.md', '');
    const r = await importDocuments({ paths: ['docs'], cwd: root, dryRun: true });
    expect(r.skipped.map(s => s.id)).toEqual(['docs/empty.md']);
  });
});

describe('importDocuments — failures', () => {
  it('keeps going when one document fails, and reports it', async () => {
    // A 30-file import must not lose 29 good documents to one bad response.
    write('docs/a.md', 'alpha');
    write('docs/b.md', 'bravo');
    write('docs/c.md', 'charlie');
    contributeCore
      .mockResolvedValueOnce(queued('c-1'))
      .mockRejectedValueOnce(new Error('provider timed out'))
      .mockResolvedValueOnce(queued('c-3'));

    const r = await importDocuments({ paths: ['docs'], cwd: root });

    expect(r.results.map(x => x.id)).toEqual(['docs/a.md', 'docs/c.md']);
    expect(r.failures).toEqual([{ id: 'docs/b.md', error: 'provider timed out' }]);
  });

  it('aborts immediately on an unknown workstream', async () => {
    // That is a mistake about the whole run — burning an AI call per file to
    // rediscover it on every document would be expensive and pointless.
    write('docs/a.md', 'alpha');
    write('docs/b.md', 'bravo');
    contributeCore.mockRejectedValue(new UnknownWorkstreamError('nope'));

    await expect(importDocuments({ paths: ['docs'], cwd: root, workstreamId: 'nope' }))
      .rejects.toBeInstanceOf(UnknownWorkstreamError);
    expect(contributeCore).toHaveBeenCalledTimes(1);
  });

  it('propagates a bad path rather than reporting an empty success', async () => {
    await expect(importDocuments({ paths: ['missing'], cwd: root }))
      .rejects.toThrow(/no such file or directory/);
  });
});

describe('importDocuments — nothing to do', () => {
  it('returns cleanly when a directory holds no supported files', async () => {
    write('docs/logo.png', 'binary');
    const r = await importDocuments({ paths: ['docs'], cwd: root });
    expect(r.documents).toEqual([]);
    expect(contributeCore).not.toHaveBeenCalled();
  });

  it('reports what was scanned before any AI call is made', async () => {
    // A 30-file import takes minutes; the user should learn about skipped
    // files immediately, not after the last document has been distilled.
    write('docs/a.md', 'alpha');
    write('docs/empty.md', '');
    const calls = [];
    contributeCore.mockImplementation(async () => { calls.push('distill'); return queued(); });
    await importDocuments({
      paths: ['docs'], cwd: root,
      onScanned: ({ documents, skipped }) => calls.push(`scanned:${documents.length}/${skipped.length}`),
    });
    expect(calls[0]).toBe('scanned:1/1');
  });

  it('reports progress per document', async () => {
    write('docs/a.md', 'alpha');
    write('docs/b.md', 'bravo');
    const seen = [];
    await importDocuments({ paths: ['docs'], cwd: root, onProgress: p => seen.push(p.document.id) });
    expect(seen).toEqual(['docs/a.md', 'docs/b.md']);
  });
});
