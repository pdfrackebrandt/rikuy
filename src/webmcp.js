// WebMCP: Rikuy's tools (src/agent.js) handed to the AI agent in the person's own browser.
// Browsers are adding a way for a page to give its tools to that agent: the W3C draft
// (github.com/webmachinelearning/webmcp) and Chrome's imperative API have
// document.modelContext.registerTool({ name, title, description, inputSchema, annotations,
// execute }, { signal }), execute(input, { signal }) resolving to the result, and annotations
// readOnlyHint, untrustedContentHint and consequentialHint; earlier drafts and Chrome's first
// origin trial had navigator.modelContext, whose registerTool returned { unregister() }, whose
// execute got a client with requestUserInteraction, and whose results were MCP's
// { content: [{ type: 'text', text }] } (MCP's destructiveHint beside). Both are detected; where
// neither exists nothing is built or registered.
//
// Tools are registered for this page's own origin alone (no exposedTo): a live figure's frame,
// whose origin is opaque, sees none. Results are JSON text. An error, a refusal included, is thrown
// on document.modelContext (an Error with the words of { error }), so the browser reports the call
// as failed; on navigator.modelContext it is MCP's isError with { error } as the text.

import { TOOLS, agentTools, callTool, askPerson } from './agent.js';

// The browser's model context: document.modelContext (the draft, Chrome now) or
// navigator.modelContext (earlier drafts); null where neither is
export function modelContext() {
  if (typeof document !== 'undefined' && document.modelContext && typeof document.modelContext.registerTool === 'function') return { mc: document.modelContext, kind: 'document' };
  if (typeof navigator !== 'undefined' && navigator.modelContext && (typeof navigator.modelContext.registerTool === 'function' || typeof navigator.modelContext.provideContext === 'function')) return { mc: navigator.modelContext, kind: 'navigator' };
  return null;
}

// Registers the tools; returns a function that takes them away again, or null where the browser
// has no model context
export function installWebMcp(app) {
  const found = modelContext();
  if (!found) return null;
  const { mc, kind } = found;
  const ctl = new AbortController();
  const gone = [];
  const tools = agentTools(app);
  // (no list of the command ids in run_command's schema: 600 of them cost an agent thousands of
  // tokens on every turn; list_commands finds one by its name)
  const descriptors = TOOLS.map((t) => {
    return {
      name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations,
      async execute(input, opts) {
        const signal = opts && typeof AbortSignal !== 'undefined' && opts.signal instanceof AbortSignal ? opts.signal : undefined;
        // (the earlier drafts' second argument: a client through which the page asks its person)
        const client = opts && typeof opts.requestUserInteraction === 'function' ? opts : null;
        const ask = client ? (what, q) => client.requestUserInteraction(() => askPerson(what, signal, q)) : (what, q) => askPerson(what, signal, q);
        const r = await callTool(app, tools, t.name, input, { signal, ask });
        const text = JSON.stringify(r);
        if (kind === 'navigator') return { content: [{ type: 'text', text }], ...(r && r.error ? { isError: true } : {}) };
        if (r && r.error) throw new Error(r.error);
        return text;
      }
    };
  });
  if (typeof mc.registerTool === 'function') {
    for (const d of descriptors) {
      try {
        const r = mc.registerTool(d, { signal: ctl.signal });
        if (r && typeof r.then === 'function') r.catch((e) => console.warn('WebMCP: ' + d.name + ' was not registered: ' + (e && e.message)));
        else if (r && typeof r.unregister === 'function') gone.push(() => r.unregister());
      } catch (e) { console.warn('WebMCP: ' + d.name + ' was not registered: ' + e.message); }
    }
  } else {
    // (the first draft had no registerTool, only the whole set at once)
    try { mc.provideContext({ tools: descriptors }); gone.push(() => { if (typeof mc.clearContext === 'function') mc.clearContext(); }); } catch (e) { console.warn('WebMCP: the tools were not registered: ' + e.message); }
  }
  app.webmcp = { tools: descriptors.map((d) => d.name), kind };
  return () => { ctl.abort(); for (const f of gone) { try { f(); } catch (e) { /* gone */ } } };
}
