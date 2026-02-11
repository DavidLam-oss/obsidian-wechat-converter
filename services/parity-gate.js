function isStrictHtmlParity(legacyHtml, candidateHtml) {
  return String(legacyHtml || '') === String(candidateHtml || '');
}

function findFirstDiffIndex(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const minLength = Math.min(left.length, right.length);
  for (let i = 0; i < minLength; i += 1) {
    if (left[i] !== right[i]) return i;
  }
  if (left.length !== right.length) return minLength;
  return -1;
}

function indexToLineColumn(text, index) {
  const source = String(text || '');
  const safeIndex = Math.max(0, Math.min(source.length, index));
  let line = 1;
  let column = 1;
  for (let i = 0; i < safeIndex; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function findSyncPoint(left, right, leftIndex, rightIndex, lookahead = 64) {
  const maxLeftOffset = Math.min(lookahead, Math.max(0, left.length - leftIndex));
  const maxRightOffset = Math.min(lookahead, Math.max(0, right.length - rightIndex));

  for (let leftOffset = 0; leftOffset <= maxLeftOffset; leftOffset += 1) {
    for (let rightOffset = 0; rightOffset <= maxRightOffset; rightOffset += 1) {
      const lPos = leftIndex + leftOffset;
      const rPos = rightIndex + rightOffset;
      if (lPos >= left.length || rPos >= right.length) continue;
      if (left[lPos] !== right[rPos]) continue;

      const lNext = lPos + 1;
      const rNext = rPos + 1;
      const nextLooksAligned =
        lNext >= left.length ||
        rNext >= right.length ||
        left[lNext] === right[rNext];
      if (nextLooksAligned) {
        return { leftIndex: lPos, rightIndex: rPos };
      }
    }
  }

  return null;
}

function collectMismatchSegments(left, right, options = {}) {
  const lookahead = Number.isInteger(options.lookahead) ? options.lookahead : 64;
  const maxSegments = Number.isInteger(options.maxSegments) && options.maxSegments > 0
    ? options.maxSegments
    : Number.POSITIVE_INFINITY;
  const snippetContext = Number.isInteger(options.snippetContext) ? options.snippetContext : 60;

  let i = 0;
  let j = 0;
  let segmentCount = 0;
  const segments = [];

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const startLeft = i;
    const startRight = j;
    const sync = findSyncPoint(left, right, i, j, lookahead);

    let endLeft = left.length;
    let endRight = right.length;
    if (sync) {
      endLeft = sync.leftIndex;
      endRight = sync.rightIndex;
      i = sync.leftIndex;
      j = sync.rightIndex;
    } else {
      i = left.length;
      j = right.length;
    }

    const start = Math.max(0, Math.min(startLeft, startRight) - snippetContext);
    const leftLineColumn = indexToLineColumn(left, startLeft);
    const rightLineColumn = indexToLineColumn(right, startRight);
    segmentCount += 1;

    if (segments.length < maxSegments) {
      segments.push({
        index: startLeft,
        legacyStart: startLeft,
        legacyEnd: endLeft,
        candidateStart: startRight,
        candidateEnd: endRight,
        legacyLine: leftLineColumn.line,
        legacyColumn: leftLineColumn.column,
        candidateLine: rightLineColumn.line,
        candidateColumn: rightLineColumn.column,
        legacySnippet: left.slice(start, Math.min(left.length, startLeft + snippetContext)),
        candidateSnippet: right.slice(start, Math.min(right.length, startRight + snippetContext)),
      });
    }
  }

  if (i < left.length || j < right.length) {
    segmentCount += 1;
    if (segments.length < maxSegments) {
      const leftLineColumn = indexToLineColumn(left, i);
      const rightLineColumn = indexToLineColumn(right, j);
      const start = Math.max(0, Math.min(i, j) - snippetContext);
      segments.push({
        index: i,
        legacyStart: i,
        legacyEnd: left.length,
        candidateStart: j,
        candidateEnd: right.length,
        legacyLine: leftLineColumn.line,
        legacyColumn: leftLineColumn.column,
        candidateLine: rightLineColumn.line,
        candidateColumn: rightLineColumn.column,
        legacySnippet: left.slice(start, Math.min(left.length, i + snippetContext)),
        candidateSnippet: right.slice(start, Math.min(right.length, j + snippetContext)),
      });
    }
  }

  return {
    segmentCount,
    segments,
    truncated: Number.isFinite(maxSegments) ? segmentCount > segments.length : false,
  };
}

function buildParityMismatchDetails(legacyHtml, candidateHtml, contextLength = 80) {
  const left = String(legacyHtml || '');
  const right = String(candidateHtml || '');
  const index = findFirstDiffIndex(left, right);

  if (index === -1) {
    return {
      index: -1,
      legacySnippet: '',
      candidateSnippet: '',
      legacyLength: left.length,
      candidateLength: right.length,
      lengthDelta: 0,
      segmentCount: 0,
      segments: [],
      truncated: false,
    };
  }

  const start = Math.max(0, index - contextLength);
  const endLeft = Math.min(left.length, index + contextLength);
  const endRight = Math.min(right.length, index + contextLength);
  const leftLineColumn = indexToLineColumn(left, index);
  const rightLineColumn = indexToLineColumn(right, index);
  const segmentData = collectMismatchSegments(left, right);

  return {
    index,
    legacySnippet: left.slice(start, endLeft),
    candidateSnippet: right.slice(start, endRight),
    legacyLength: left.length,
    candidateLength: right.length,
    lengthDelta: right.length - left.length,
    legacyLine: leftLineColumn.line,
    legacyColumn: leftLineColumn.column,
    candidateLine: rightLineColumn.line,
    candidateColumn: rightLineColumn.column,
    segmentCount: segmentData.segmentCount,
    segments: segmentData.segments,
    truncated: segmentData.truncated,
  };
}

module.exports = {
  isStrictHtmlParity,
  findFirstDiffIndex,
  buildParityMismatchDetails,
};
