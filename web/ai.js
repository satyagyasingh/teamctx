// What the model pickers offer.
//
// Everything that reaches a model now goes through teamctx's own endpoints,
// which hold the key: the browser never sees one, and there is nothing here to
// call out with. `/api/claude` was the standalone app's own proxy and does not
// exist in this deployment — asking it returned an HTML 404 that the page then
// tried to read as JSON.
// (the Vercel serverless proxy that holds ANTHROPIC_API_KEY).


export const MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 — sharpest" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fast" },
];

export const DEFAULT_DISTILL_MODEL = "claude-sonnet-4-6";
export const DEFAULT_ASK_MODEL = "claude-haiku-4-5";
