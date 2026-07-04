import { normalizeVaultPath } from './path-utils.js';
import {
  AI_LAYOUT_SELECTION_AUTO,
  createDefaultAiSettings,
  getArticleLayoutSelectionState,
  getLayoutFamilyById,
  normalizeAiSettings,
  normalizeArticleLayoutCacheEntry,
  normalizeArticleLayoutState,
  normalizeLayoutSelection,
} from './ai-layout.js';

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value) {
  return isRecord(value) ? value : {};
}

function toAiLayoutState(value) {
  return isRecord(value) ? value : null;
}

function toAiLayoutSelection(value) {
  return isRecord(value) ? value : {};
}

function toAiLayoutFamilyStates(value) {
  if (!isRecord(value)) return {};
  return value;
}

export function getArticleLayoutStateFromSettings(pluginSettings, sourcePath = '', selection = {}) {
  const normalizedPath = normalizeVaultPath(sourcePath || '');
  if (!normalizedPath) return null;
  const aiSettings = normalizeAiSettings(toRecord(pluginSettings.ai));
  const articleLayoutsByPath = toRecord(aiSettings.articleLayoutsByPath);
  const entry = articleLayoutsByPath[normalizedPath] || null;
  const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
  if (!normalizedEntry) return null;
  if (!selection || Object.keys(selection).length === 0) {
    const familyStates = toAiLayoutFamilyStates(normalizedEntry.familyStates);
    return familyStates[normalizedEntry.lastLayoutFamily] || null;
  }
  return toAiLayoutState(getArticleLayoutSelectionState(normalizedEntry, toAiLayoutSelection(selection), {
    layoutFamily: aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  }));
}

export function saveArticleLayoutStateToSettings(pluginSettings, sourcePath = '', nextState = null, selection = {}) {
  const normalizedPath = normalizeVaultPath(sourcePath || '');
  if (!normalizedPath) return false;
  if (!pluginSettings.ai) {
    pluginSettings.ai = createDefaultAiSettings();
  }
  const aiSettings = pluginSettings.ai;
  if (!isRecord(aiSettings.articleLayoutsByPath)) {
    aiSettings.articleLayoutsByPath = {};
  }
  const articleLayoutsByPath = aiSettings.articleLayoutsByPath;
  const existingEntry = normalizeArticleLayoutCacheEntry(articleLayoutsByPath[normalizedPath]) || {
    lastLayoutFamily: '',
    lastAutoResolvedFamily: '',
    familyStates: {},
  };
  const existingFamilyStates = toAiLayoutFamilyStates(existingEntry.familyStates);
  existingEntry.familyStates = existingFamilyStates;
  const nextLayoutState = toAiLayoutState(nextState);
  const hasExplicitSelection = typeof selection === 'string'
    || (selection && typeof selection === 'object' && Object.keys(selection).length > 0);
  const requestedSelection = normalizeLayoutSelection(
    nextLayoutState?.selection || (hasExplicitSelection ? toAiLayoutSelection(selection) : null) || {
      layoutFamily: nextLayoutState?.layoutFamily || nextLayoutState?.resolved?.layoutFamily,
      colorPalette: nextLayoutState?.stylePack || nextLayoutState?.resolved?.colorPalette || nextLayoutState?.layoutJson?.stylePack,
    },
    {
      layoutFamily: aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
      colorPalette: aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
    }
  );
  const getCacheFamily = (state = null) => {
    const stateRecord = toAiLayoutState(state);
    const normalizedState = normalizeArticleLayoutState(stateRecord || {});
    const rawFamily = normalizedState?.resolved?.layoutFamily
      || normalizedState?.layoutFamily
      || stateRecord?.resolved?.layoutFamily
      || stateRecord?.layoutFamily
      || (requestedSelection.layoutFamily !== AI_LAYOUT_SELECTION_AUTO ? requestedSelection.layoutFamily : '');
    const normalizedFamily = normalizeLayoutSelection({ layoutFamily: rawFamily }).layoutFamily;
    return normalizedFamily === AI_LAYOUT_SELECTION_AUTO ? '' : normalizedFamily;
  };
  const effectiveLayoutFamily = getCacheFamily(nextLayoutState);

  if (!nextLayoutState) {
    if (selection && Object.keys(selection).length && effectiveLayoutFamily) {
      delete existingFamilyStates[effectiveLayoutFamily];
      const remainingFamilies = Object.keys(existingFamilyStates);
      if (!remainingFamilies.length) {
        delete articleLayoutsByPath[normalizedPath];
      } else {
        existingEntry.lastLayoutFamily = existingFamilyStates[existingEntry.lastLayoutFamily]
          ? existingEntry.lastLayoutFamily
          : remainingFamilies[0];
        if (existingEntry.lastAutoResolvedFamily && !existingFamilyStates[existingEntry.lastAutoResolvedFamily]) {
          existingEntry.lastAutoResolvedFamily = '';
        }
        articleLayoutsByPath[normalizedPath] = normalizeArticleLayoutCacheEntry(existingEntry) || existingEntry;
      }
    } else {
      delete articleLayoutsByPath[normalizedPath];
    }
  } else {
    const resolvedLayoutFamily = effectiveLayoutFamily || 'source-first';
    const inferredSkillId = nextLayoutState.skillId
      || resolvedLayoutFamily
      || requestedSelection.layoutFamily;
    const inferredSkillVersion = nextLayoutState.skillVersion
      || nextLayoutState.generationMeta?.skillVersion
      || getLayoutFamilyById(inferredSkillId)?.version
      || '';
    existingFamilyStates[resolvedLayoutFamily] = {
      ...nextLayoutState,
      skillId: inferredSkillId,
      skillVersion: inferredSkillVersion,
      selection: requestedSelection,
      resolved: {
        ...(nextLayoutState.resolved || {}),
        layoutFamily: resolvedLayoutFamily,
        colorPalette: nextLayoutState.stylePack || nextLayoutState.resolved?.colorPalette || 'tech-green',
      },
      layoutFamily: resolvedLayoutFamily,
      stylePack: nextLayoutState.stylePack || nextLayoutState.resolved?.colorPalette || 'tech-green',
    };
    existingEntry.lastLayoutFamily = resolvedLayoutFamily;
    if (requestedSelection.layoutFamily === AI_LAYOUT_SELECTION_AUTO) {
      existingEntry.lastAutoResolvedFamily = resolvedLayoutFamily;
    }
    articleLayoutsByPath[normalizedPath] = normalizeArticleLayoutCacheEntry(existingEntry) || existingEntry;
  }
  return true;
}
