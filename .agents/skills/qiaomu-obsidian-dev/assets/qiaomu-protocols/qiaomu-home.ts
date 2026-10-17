/**
 * Qiaomu Home Protocol, version 1.
 *
 * Copy this file unchanged into any Obsidian plugin that wants to appear on 乔木Home (Qiaomu Home),
 * the start page for Obsidian. Plugins never import each other: Home finds sources at runtime through
 * `app.plugins`, and every call is guarded, so either side works alone.
 *
 * - A source sets `plugin.qiaomuHome` to a {@link HomeProvider}.
 * - A source calls {@link notifyHomeChanged} when something Home shows has changed
 *   (progress saved, unread count changed, playback started or stopped).
 * - Home reads providers when a Home page is shown or notified. Providers own their data and actions;
 *   Home owns layout and styling. Providers return plain data, never DOM.
 *
 * Versioning: version 1 may gain optional fields and optional methods; check for them before use and
 * ignore unknown ones. Only a breaking change raises the version, and a mismatch reads as "absent".
 *
 * Spec: docs/qiaomu-home-protocol.md in the qiaomu-home repository.
 * License: this file is MIT licensed so any plugin can embed it. Copyright (c) 2026 向阳乔木.
 */
import type { App, Plugin } from "obsidian";

export const HOME_PROTOCOL = "qiaomu-home";
export const HOME_VERSION = 1;
export const HOME_PLUGIN_ID = "qiaomu-home";
/** Workspace event: `app.workspace.trigger(HOME_CHANGED_EVENT, sourceId)`. */
export const HOME_CHANGED_EVENT = "qiaomu-home:changed";
/** Home shows at most this many items per section; send no more. */
export const MAX_SECTION_ITEMS = 6;

/** Something the user can do. `run` is only called from a direct user gesture on Home. */
export interface HomeAction {
  /** Stable within the provider, e.g. "import-book". Home uses it to remember the user's layout. */
  id: string;
  /** Short visible label in the user's language, e.g. "导入书籍". */
  label: string;
  /** Lucide icon name available in Obsidian, e.g. "book-plus". */
  icon: string;
  run(): void | Promise<void>;
}

export interface HomeItem {
  /** Stable within the provider, e.g. a vault path, article id or station id. */
  id: string;
  title: string;
  /** Secondary line: author, feed, station country. */
  subtitle?: string;
  /** Short trailing fact: "42%", "3 小时前", "直播中". */
  meta?: string;
  /** Lucide icon name used when there is no image. */
  icon?: string;
  /** Thumbnail: https URL, `app://` resource path or `data:image/...` URL. Home falls back to `icon` if it fails. */
  image?: string;
  /** Reading or listening progress between 0 and 1. */
  progress?: number;
  /** True for the thing that is live right now, e.g. the playing station. */
  active?: boolean;
  /** Primary action: open or resume this item. Called from a user gesture. */
  open(): void | Promise<void>;
  /** Secondary actions shown as icon buttons, e.g. play/pause. Keep to one or two. */
  actions?: HomeAction[];
}

export interface HomeSection {
  /** Stable within the provider, e.g. "continue-reading". */
  id: string;
  /** Visible heading, e.g. "继续阅读". */
  title: string;
  items: HomeItem[];
  /** Shown when `items` is empty; omit to hide an empty section. */
  empty?: string;
  /** Optional "see all" action that opens the plugin's own view. */
  more?: HomeAction;
}

export interface HomeProvider {
  protocol: typeof HOME_PROTOCOL;
  version: number;
  /**
   * Sections for Home's "continue" area. Called each time Home renders or is notified.
   * Use local state only: no network requests, no file writes. Resolve within a few hundred ms.
   */
  sections(): HomeSection[] | Promise<HomeSection[]>;
  /** Optional quick actions offered in Home's create row, e.g. "导入书籍" or "新对话". */
  actions?(): HomeAction[];
  /** Optional search over the plugin's own local data. Return at most `limit` items; no network. */
  search?(query: string, limit: number): HomeItem[] | Promise<HomeItem[]>;
}

type Registry = Record<string, Plugin & { qiaomuHome?: unknown }>;

function registry(app: App): Registry {
  return (app as App & { plugins?: { plugins?: Registry } }).plugins?.plugins ?? {};
}

function isProvider(value: unknown): value is HomeProvider {
  const provider = value as Partial<HomeProvider> | undefined;
  return provider?.protocol === HOME_PROTOCOL && provider.version === HOME_VERSION && typeof provider.sections === "function";
}

/** Every loaded plugin that exposes a compatible Home provider, keyed by plugin id. Check at the moment of use; never cache. */
export function findHomeProviders(app: App): Array<[string, HomeProvider]> {
  const found: Array<[string, HomeProvider]> = [];
  for (const [id, plugin] of Object.entries(registry(app))) {
    if (isProvider(plugin?.qiaomuHome)) found.push([id, plugin.qiaomuHome]);
  }
  return found;
}

/** Tells every open Home page that this source has new data. Cheap; Home coalesces bursts. */
export function notifyHomeChanged(app: App, sourceId: string): void {
  app.workspace.trigger(HOME_CHANGED_EVENT, sourceId);
}

/** Convenience for sources: builds a frozen provider object with the protocol fields set. */
export function homeProvider(parts: Omit<HomeProvider, "protocol" | "version">): HomeProvider {
  return Object.freeze({ protocol: HOME_PROTOCOL, version: HOME_VERSION, ...parts });
}
