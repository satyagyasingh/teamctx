// Client-side AI helpers. All network calls go through /api/claude
// (the Vercel serverless proxy that holds ANTHROPIC_API_KEY).

import { jsonrepair } from "jsonrepair";

export const MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 — sharpest" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fast" },
];

export const DEFAULT_DISTILL_MODEL = "claude-sonnet-4-6";
export const DEFAULT_ASK_MODEL = "claude-haiku-4-5";

export async function callClaude({ prompt, model, system, max_tokens = 1500 }) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, system, max_tokens }),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail =
      data?.error?.message ||
      (data?.error && data?.detail
        ? `${data.error}: ${data.detail}`
        : data?.error) ||
      data?.detail ||
      `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}

export function extractJson(text) {
  if (!text) throw new Error("Empty response from model");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object found in response");
  const slice = candidate.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Common Claude failure modes on long responses: trailing commas, missing
    // commas between objects, single-quoted strings. jsonrepair fixes those.
    return JSON.parse(jsonrepair(slice));
  }
}

function stripWorkstreamForPrompt(workstream) {
  // Send id + text only — the AI needs ids so it can address existing
  // statements in editStatement / deleteStatement ops. sourceContributionIds
  // and summary are stripped (the AI doesn't need provenance).
  return {
    name: workstream.name,
    whys: (workstream.whys || []).map((why) => ({
      id: why.id,
      text: why.text,
      whats: (why.whats || []).map((what) => ({
        id: what.id,
        text: what.text,
        hows: (what.hows || []).map((how) => ({ id: how.id, text: how.text })),
      })),
    })),
  };
}

export async function proposeDiff({ workstream, contribution, source, model }) {
  const system =
    "You distill a single team contribution into typed edits to a hierarchical " +
    "Why / What / How record. Output STRICT JSON only — no markdown fences, " +
    "no commentary, no extra fields.";

  const prompt = [
    `Workstream: "${workstream.name}"`,
    "",
    "Current record (id + text only — use ids to address existing statements):",
    JSON.stringify(stripWorkstreamForPrompt(workstream), null, 2),
    "",
    `Contribution (source: ${source}):`,
    `"""${contribution}"""`,
    "",
    "Propose how the record should change to absorb this contribution.",
    "Output STRICT JSON shaped exactly like:",
    `{
  "summary": "1-2 sentence overall description of the change",
  "operations": [
    { "type": "addWhy", "text": "...", "summary": "...",
      "whats": [ { "text": "...", "summary": "...", "hows": [ { "text": "...", "summary": "..." } ] } ] },
    { "type": "addWhat", "parentWhyId": "<existing why id>", "text": "...", "summary": "...",
      "hows": [ { "text": "...", "summary": "..." } ] },
    { "type": "addHow", "parentWhatId": "<existing what id>", "text": "...", "summary": "..." },
    { "type": "editStatement", "id": "<existing statement id>", "text": "new text", "summary": "..." },
    { "type": "deleteStatement", "id": "<existing statement id>", "summary": "..." }
  ]
}`,
    "",
    "Rules:",
    "- Why statements: 3–8 words, action-leaning.",
    "- What statements: short phrase, each tied to a Why.",
    "- How statements: a specific, concrete task.",
    "- Use the smallest set of operations that absorbs the contribution.",
    "- Prefer editing an existing statement over adding a near-duplicate.",
    "- `whats` and `hows` arrays are optional — omit them when not introducing children.",
    "- `parentWhyId` and `parentWhatId` MUST be ids that appear in the current record.",
    "- If introducing a brand-new Why with its Whats/Hows, nest them via the `whats`/`hows` arrays.",
    "- Output JSON only.",
  ].join("\n");

  const raw = await callClaude({ prompt, model, system });
  const parsed = extractJson(raw);
  return {
    summary: String(parsed.summary ?? "(no summary)"),
    operations: Array.isArray(parsed.operations) ? parsed.operations : [],
  };
}

export async function askLane({ workstream, question, model }) {
  const system =
    "You answer questions strictly from the provided workstream record (Why/What/How). " +
    "If the answer isn't in the record, say so plainly.";

  const prompt = [
    `Workstream: "${workstream.name}"`,
    "",
    "Record (Why → Whats → Hows tree, id + text only):",
    JSON.stringify(stripWorkstreamForPrompt(workstream), null, 2),
    "",
    `Question: ${question}`,
    "",
    "Answer in 2-4 plain-text sentences using only what's in the record.",
  ].join("\n");

  return callClaude({ prompt, model, system });
}
