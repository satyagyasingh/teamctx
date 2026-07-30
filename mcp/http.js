import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './server.js';

/**
 * Handle a single MCP HTTP request. The Node HTTP request/response pair is
 * passed straight through to the MCP SDK's streamable HTTP transport.
 *
 * Stateless mode (sessionIdGenerator: undefined) — each request stands alone,
 * which is what a serverless Vercel function needs. No cross-request memory.
 */
export async function handleMcpHttp(req, res, projectContext) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildServer(projectContext);

  await server.connect(transport);

  const body = await readJsonBody(req);
  await transport.handleRequest(req, res, body);
}

async function readJsonBody(req) {
  if (req.body !== undefined) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  try { return JSON.parse(raw); }
  catch { return raw; }
}
