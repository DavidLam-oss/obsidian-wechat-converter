// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import { coerceString, toRecord } from './utils.js';

function getLayoutBlockLabel(block = {}) {
  const source = toRecord(block);
  return coerceString(
    source.title
    || source.caseLabel
    || source.text
    || source.caption
    || source.buttonText
    || source.imageId
    || source.type
  );
}

function getLayoutBlockKey(block = {}) {
  const source = toRecord(block);
  return `${coerceString(source.type)}:${getLayoutBlockLabel(source)}`;
}

export {
  getLayoutBlockLabel,
  getLayoutBlockKey,
};
