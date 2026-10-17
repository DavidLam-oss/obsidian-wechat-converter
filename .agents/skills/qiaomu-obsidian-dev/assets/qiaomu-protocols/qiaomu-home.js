/**
 * Qiaomu Home Protocol, version 1 (plain JavaScript build of qiaomu-home.ts; same behavior, no types).
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
const HOME_PROTOCOL = "qiaomu-home";
const HOME_VERSION = 1;
const HOME_PLUGIN_ID = "qiaomu-home";
const HOME_CHANGED_EVENT = "qiaomu-home:changed";
const MAX_SECTION_ITEMS = 6;
function registry(app) {
  return app.plugins?.plugins ?? {};
}
function isProvider(value) {
  const provider = value;
  return provider?.protocol === HOME_PROTOCOL && provider.version === HOME_VERSION && typeof provider.sections === "function";
}
function findHomeProviders(app) {
  const found = [];
  for (const [id, plugin] of Object.entries(registry(app))) {
    if (isProvider(plugin?.qiaomuHome)) found.push([id, plugin.qiaomuHome]);
  }
  return found;
}
function notifyHomeChanged(app, sourceId) {
  app.workspace.trigger(HOME_CHANGED_EVENT, sourceId);
}
function homeProvider(parts) {
  return Object.freeze({ protocol: HOME_PROTOCOL, version: HOME_VERSION, ...parts });
}
export {
  HOME_CHANGED_EVENT,
  HOME_PLUGIN_ID,
  HOME_PROTOCOL,
  HOME_VERSION,
  MAX_SECTION_ITEMS,
  findHomeProviders,
  homeProvider,
  notifyHomeChanged
};
