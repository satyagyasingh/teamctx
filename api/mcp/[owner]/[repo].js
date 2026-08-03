import { handleMcpHttp } from '../../../mcp/http.js';
import { runWithAiKey } from '../../../src/ai-context.js';

/**
 * Vercel handler for hosted MCP.
 *
 * URL shape: POST /api/mcp/<owner>/<repo>?gh_token=...&api_key=...&ref=...
 *
 * Vercel binds `<owner>` and `<repo>` into req.query via the file-path
 * segments `[owner]/[repo].js`. All other params come from the query string
 * (or matching X-* headers).
 *
 * MVP: PAT + Anthropic key travel in the query string. A GitHub App / OAuth
 * flow is a follow-up so tokens are not URL-visible.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ error: 'method_not_allowed', message: 'MCP endpoint accepts POST only' }));
    return;
  }

  const owner = readParam(req, 'owner');
  const repo = readParam(req, 'repo');
  if (!owner || !repo) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'bad_url', message: 'expected /api/mcp/<owner>/<repo>' }));
    return;
  }

  const ghToken = readParam(req, 'gh_token') || req.headers['x-github-token'];
  const apiKey = readParam(req, 'api_key') || req.headers['x-anthropic-api-key'];
  const ref = readParam(req, 'ref') || null;

  if (!ghToken) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'missing_gh_token', message: 'gh_token query param (or X-Github-Token header) is required' }));
    return;
  }

  const projectContext = { __backend: 'github', owner, repo, ref, ghToken };

  const dispatch = () => handleMcpHttp(req, res, projectContext);
  if (apiKey) await runWithAiKey(apiKey, dispatch);
  else await dispatch();
}

function readParam(req, name) {
  const v = req.query?.[name];
  if (Array.isArray(v)) return v[0];
  return v || undefined;
}
