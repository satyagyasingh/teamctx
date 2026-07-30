import { handleMcpHttp } from '../../mcp/http.js';
import { runWithAiKey } from '../../src/ai-context.js';

/**
 * Vercel catch-all handler for hosted MCP.
 *
 * Expected URL shape:
 *   POST /api/mcp/<owner>/<repo>[?gh_token=...&api_key=...&ref=...]
 *
 * MVP: PAT + Anthropic key come in the query string. Follow-up will move to
 * a GitHub App OAuth flow so tokens are not URL-visible.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ error: 'method_not_allowed', message: 'MCP endpoint accepts POST only' }));
    return;
  }

  const parts = Array.isArray(req.query?.path) ? req.query.path : [];
  const [owner, repo, ...rest] = parts;
  if (!owner || !repo) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'bad_url', message: 'expected /api/mcp/<owner>/<repo>' }));
    return;
  }

  const ghToken = readParam(req, 'gh_token') || req.headers['x-github-token'];
  const apiKey = readParam(req, 'api_key') || req.headers['x-anthropic-api-key'];
  const ref = readParam(req, 'ref') || parseRefFromPath(rest);

  if (!ghToken) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'missing_gh_token', message: 'gh_token query param (or X-Github-Token header) is required' }));
    return;
  }

  const projectContext = { __backend: 'github', owner, repo, ref: ref || null, ghToken };

  const dispatch = () => handleMcpHttp(req, res, projectContext);
  if (apiKey) await runWithAiKey(apiKey, dispatch);
  else await dispatch();
}

function readParam(req, name) {
  const v = req.query?.[name];
  if (Array.isArray(v)) return v[0];
  return v || undefined;
}

function parseRefFromPath(rest) {
  const i = rest.indexOf('refs');
  if (i >= 0 && rest[i + 1]) return rest[i + 1];
  return null;
}
