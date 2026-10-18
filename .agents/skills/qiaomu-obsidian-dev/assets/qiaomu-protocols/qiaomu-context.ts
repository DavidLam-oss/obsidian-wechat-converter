/**
 * Qiaomu Context Protocol, version 1.
 *
 * Copy this file unchanged into any Obsidian plugin that wants to share "what the user is reading"
 * with Qiaomu Agent. Plugins never import each other: they find each other at runtime through
 * `app.plugins`, and every call is guarded, so either side works alone.
 *
 * - A context source sets `plugin.qiaomuContext` to a {@link ContextProvider}.
 * - Qiaomu Agent sets `plugin.api` to an {@link AgentApi}.
 * - A source calls {@link notifyContextChanged} when its article, page or selection changes.
 *
 * Versioning: version 1 may gain optional fields and optional methods; check for them before use and
 * ignore unknown ones. Only a breaking change raises the version, and a mismatch reads as "absent".
 *
 * Spec: docs/integrations/qiaomu-context-protocol.md in the qiaomu-agent repository.
 */
import type { App, Plugin, WorkspaceLeaf } from "obsidian";

export const CONTEXT_PROTOCOL = "qiaomu-context";
export const AGENT_PROTOCOL = "qiaomu-agent";
export const CONTEXT_VERSION = 1;
export const AGENT_PLUGIN_ID = "qiaomu-agent";
/** Workspace event: `app.workspace.trigger(CONTEXT_CHANGED_EVENT, sourceId)`. */
export const CONTEXT_CHANGED_EVENT = "qiaomu-context:changed";
/** Longest body a source should hand over; condense longer documents and set `truncated`. */
export const MAX_CONTEXT_TEXT = 60_000;
export const MAX_SELECTION_TEXT = 20_000;

export interface ContextSelection {
  text: string;
  /** Human-readable position, e.g. "第 3 章" or "p. 12". */
  location?: string;
}

export interface ContextSnapshot {
  /** Plugin id of the source, e.g. "qiaomu-ai-rss". */
  sourceId: string;
  /** Display name of the source, e.g. "乔木 RSS". */
  sourceName: string;
  kind: "article" | "book" | "document" | "page" | "other";
  title: string;
  /** Public http(s) link, if any. */
  url?: string;
  /** Vault-relative path, if the content is a vault file. */
  path?: string;
  author?: string;
  published?: string;
  /** Current position, e.g. chapter or page. */
  location?: string;
  /** Readable body as plain text or Markdown; at most MAX_CONTEXT_TEXT characters. */
  text?: string;
  /** True when `text` is a condensed or cut version of the full content. */
  truncated?: boolean;
  selection?: ContextSelection;
}

export interface ContextProvider {
  protocol: typeof CONTEXT_PROTOCOL;
  version: number;
  /** Snapshot of a leaf this plugin owns, or null for any other leaf. Must be cheap and synchronous. */
  snapshot(leaf: WorkspaceLeaf): ContextSnapshot | null;
}

export interface AgentAskRequest {
  context: ContextSnapshot;
  /** Optional text to place in the composer. The agent never sends without the user. */
  prompt?: string;
}

export interface AgentApi {
  protocol: typeof AGENT_PROTOCOL;
  version: number;
  /** Opens the agent with this context attached and focuses the composer. */
  ask(request: AgentAskRequest): Promise<void>;
  /**
   * Optional (added in v1): starts a fresh conversation with this draft and no attached context.
   * `submit: true` sends it right away; use it only when the user already pressed send in the caller (e.g. Qiaomu Home's search box).
   */
  compose?(request: AgentComposeRequest): Promise<void>;
}

export interface AgentComposeRequest {
  prompt: string;
  submit?: boolean;
}

interface PluginRegistry {
  plugins?: { plugins?: Record<string, Plugin & { api?: unknown; qiaomuContext?: unknown }>; enabledPlugins?: Set<string> };
}

function registry(app: App): Record<string, Plugin & { api?: unknown; qiaomuContext?: unknown }> {
  return (app as App & PluginRegistry).plugins?.plugins ?? {};
}

/** The installed, enabled and compatible Qiaomu Agent, or null. Check at the moment of use; never cache. */
export function findAgent(app: App): AgentApi | null {
  const api = registry(app)[AGENT_PLUGIN_ID]?.api as Partial<AgentApi> | undefined;
  return api?.protocol === AGENT_PROTOCOL && api.version === CONTEXT_VERSION && typeof api.ask === "function" ? api as AgentApi : null;
}

/** Every loaded plugin that exposes a compatible context provider, keyed by plugin id. */
export function findContextProviders(app: App): Array<[string, ContextProvider]> {
  const found: Array<[string, ContextProvider]> = [];
  for (const [id, plugin] of Object.entries(registry(app))) {
    const provider = plugin?.qiaomuContext as Partial<ContextProvider> | undefined;
    if (provider?.protocol === CONTEXT_PROTOCOL && provider.version === CONTEXT_VERSION && typeof provider.snapshot === "function") {
      found.push([id, provider as ContextProvider]);
    }
  }
  return found;
}

export function notifyContextChanged(app: App, sourceId: string): void {
  app.workspace.trigger(CONTEXT_CHANGED_EVENT, sourceId);
}

/** Cuts text to `limit` characters on a paragraph or sentence boundary when one is close. */
export function clipText(text: string, limit: number): { text: string; truncated: boolean } {
  const value = text.trim();
  if (value.length <= limit) return { text: value, truncated: false };
  const cut = value.slice(0, limit);
  const boundary = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf("。"), cut.lastIndexOf(". "));
  return { text: (boundary > limit * 0.8 ? cut.slice(0, boundary + 1) : cut).trimEnd(), truncated: true };
}
