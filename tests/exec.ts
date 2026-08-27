import type { ToolRunContext } from "@deepseek-ai/dsh-tools";

/**
 * Minimal `ToolRunContext` for unit-testing tool `execute` bodies directly.
 *
 * The registry normally constructs the full run context (token, callId, ...);
 * unit tests only need a live `AbortSignal` and an optional session cwd, so we
 * cast a minimal object. `cwd` (when given) is exposed as the agent's session
 * workspace so tools that omit their `cwd` argument exercise their default path.
 */
export function toolExec(cwd?: string): ToolRunContext {
  const exec = {
    signal: new AbortController().signal,
    ...(cwd !== undefined ? { agent: { session: { header: { cwd } } } } : {}),
  };
  return exec as unknown as ToolRunContext;
}
