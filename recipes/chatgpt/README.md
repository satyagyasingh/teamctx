# ChatGPT — recipe guide

ChatGPT cannot reach into your filesystem, so running a *recipe* is
copy-paste: paste the recipe, paste the inputs it asks for, then paste the
output back into your terminal.

> **This page is about the recipes, not about teamctx as a whole.** If your
> ChatGPT supports custom MCP connectors, the hosted server is a second route
> that needs no copy-paste at all — see [Using the hosted connector
> instead](#using-the-hosted-connector-instead) below.

## Recommended flow

**For `author-contribution.md`:**

1. Open a new ChatGPT conversation. Any capable model will do (GPT-4-class or
   newer recommended).
2. Copy the contents of [`recipes/author-contribution.md`](../author-contribution.md)
   and paste it into the chat.
3. When it asks (or in the same message), paste:
   - Your rough note, in place of `<PASTE YOUR ROUGH NOTE HERE>`.
   - The full contents of `.teamctx/context/workstreams/main.md`, in place of
     `<PASTE .teamctx/context/workstreams/main.md HERE>`.
4. Read the output. If ChatGPT asks a clarifying question, answer it before
   letting it write the final contribution.
5. Copy the final contribution into your terminal:
   ```
   teamctx contribute "<paste the shaped contribution here>"
   ```
   Add `--decision` if the recipe flagged it as a decision.

**For `cleanup-context.md`:**

Same pattern:

1. Paste [`recipes/cleanup-context.md`](../cleanup-context.md) into the chat.
2. Paste the current `.teamctx/context/workstreams/main.md` and optionally a focus area.
3. Copy the rewritten tree into a scratch file, `diff` it against your real
   `.teamctx/context/workstreams/main.md`, and apply the changes you want by hand.

## Tips

- For teams that use ChatGPT a lot, save each recipe as a **Custom GPT** with
  the recipe as its system prompt. Then contributors just paste their rough
  note and the current context — no need to paste the recipe every time.
- If your workstream markdown is large, ChatGPT may truncate. Split the cleanup
  into workstream-sized passes rather than one full-tree pass.
- A recipe only produces text. Nothing is recorded until you copy the final
  output back into your terminal — the recipe flow has no way to write to your
  project.

## Using the hosted connector instead

The recipes above are the route that works in any chat client at all, with no
setup on the project's side. If yours supports custom MCP connectors, the whole
loop runs in conversation instead — list your tasks, pull a compiled prompt, do
the work, submit the contribution — with nothing pasted into a terminal.

Ask the project's manager for the connector URL (`teamctx connect`), add it as
a custom connector, and sign in.

Whether a given client supports this is that client's question, not teamctx's,
and the answer has changed more than once — so this page does not try to state
it. Try adding the connector: if the tools appear, use them; if they do not,
the copy-paste flow above is unaffected and always works.

See [docs/mcp-join.md](../../docs/mcp-join.md) for the joining member's steps.
