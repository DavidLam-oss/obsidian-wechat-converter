/* OPENPRD:GENERATED
adapter=codex
source=codex-hooks
version=0.1.19
checksum=466f2e5da639bc0c
*/

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const eventName = process.argv[2] || 'Unknown';
const hookScriptFilePath = fileURLToPath(import.meta.url);
const hookScriptWorkspaceRoot = (() => {
  const candidate = path.resolve(path.dirname(hookScriptFilePath), '..', '..');
  return fs.existsSync(path.join(candidate, '.openprd')) ? candidate : null;
})();
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = input.trim() ? JSON.parse(input) : {}; } catch {}
  const cwd = payload.cwd
    || payload.workspace_root
    || payload.workspaceRoot
    || hookScriptWorkspaceRoot
    || process.cwd();
  const result = handle(eventName, cwd, payload);
  if (result) {
    process.stdout.write(JSON.stringify(result));
  }
});

function now() {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function findProjectRoot(start) {
  let current = path.resolve(start || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(current, '.openprd'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(start || process.cwd());
    }
    current = parent;
  }
}

function harnessDir(root) {
  return path.join(root, '.openprd', 'harness');
}

function ensureHarness(root) {
  const dir = harnessDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const statePath = path.join(dir, 'hook-state.json');
  if (!fs.existsSync(statePath)) {
    writeJsonSync(statePath, {
      version: 1,
      active: true,
      lastEventAt: null,
      lastFingerprint: null,
      counters: {},
      recentFingerprints: {},
      suppressions: { inputLock: false },
    });
  }
  const eventsPath = path.join(dir, 'events.jsonl');
  if (!fs.existsSync(eventsPath)) {
    fs.writeFileSync(eventsPath, '');
  }
  const runtimePath = path.join(dir, 'runtime-environment.json');
  if (!fs.existsSync(runtimePath)) {
    writeJsonSync(runtimePath, {
      version: 1,
      active: {
        activeClient: 'unknown',
        surface: 'unknown',
        executionMode: 'interactive',
        confidence: 0,
        sessionId: null,
        turnId: null,
        agentType: null,
        model: null,
        evidence: [],
        observedCapabilities: [],
      },
      runtimeDetection: {
        version: 1,
        activeEvidencePriority: [
          'hook-session-payload',
          'explicit-launcher',
          'sdk-or-headless-session',
          'child-process-env',
          'config-or-cli-probe',
          'agent-self-report',
        ],
      },
      platformCapabilityPacks: [],
      updatedAt: null,
    });
  }
}

function readJsonSync(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonSync(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function appendEvent(root, event) {
  ensureHarness(root);
  fs.appendFileSync(path.join(harnessDir(root), 'events.jsonl'), JSON.stringify({ at: now(), ...event }) + '\n');
}

function runtimeEnvironmentPath(root) {
  return path.join(harnessDir(root), 'runtime-environment.json');
}

function compactString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function runtimeEvidenceForPayload(eventName, payload) {
  const evidence = ['hook.event_name'];
  const addIfPresent = (key, label = key) => {
    if (payload && payload[key] !== undefined && payload[key] !== null && String(payload[key]).trim() !== '') {
      evidence.push(`hook.${label}`);
    }
  };
  addIfPresent('session_id', 'session_id');
  addIfPresent('sessionId', 'sessionId');
  addIfPresent('transcript_path', 'transcript_path');
  addIfPresent('transcriptPath', 'transcriptPath');
  addIfPresent('cwd', 'cwd');
  addIfPresent('model', 'model');
  addIfPresent('turn_id', 'turn_id');
  addIfPresent('turnId', 'turnId');
  addIfPresent('agent_type', 'agent_type');
  addIfPresent('agentType', 'agentType');
  addIfPresent('tool_name', 'tool_name');
  addIfPresent('toolName', 'toolName');
  if (eventName) {
    evidence.push(`event.${eventName}`);
  }
  return [...new Set(evidence)];
}

function observedCodexCapabilities(payload) {
  const observed = ['codex-hooks'];
  const tool = toolName(payload).toLowerCase();
  const haystack = `${tool}\n${payloadText(payload)}`;
  if (/\b(imagegen|image_gen|image-generation|image_generation)\b/i.test(haystack)) {
    observed.push('native-image-generation');
  }
  if (/\b(computer-use|computer_use|browser|chrome)\b/i.test(haystack)) {
    observed.push('computer-use');
  }
  return [...new Set(observed)];
}

function recordRuntimeEnvironment(root, eventName, payload, sessionId) {
  ensureHarness(root);
  const current = readJsonSync(runtimeEnvironmentPath(root), {});
  const executionSignals = detectExecutionSignals(eventName, payload);
  const evidence = [...new Set([
    ...runtimeEvidenceForPayload(eventName, payload),
    ...executionSignals.evidence,
    ...executionSignals.optInEvidence,
  ])];
  const active = {
    activeClient: 'codex',
    surface: 'codex-hook',
    executionMode: executionSignals.executionMode,
    confidence: evidence.some((item) => item === 'hook.session_id' || item === 'hook.sessionId' || item === 'hook.transcript_path' || item === 'hook.transcriptPath') ? 0.95 : 0.9,
    sessionId: sessionId ?? null,
    turnId: compactString(payload?.turn_id ?? payload?.turnId),
    agentType: compactString(payload?.agent_type ?? payload?.agentType),
    model: compactString(payload?.model),
    evidence,
    observedCapabilities: observedCodexCapabilities(payload),
  };
  const entry = {
    version: 1,
    ...current,
    active,
    lastEventName: eventName,
    updatedAt: now(),
    recentObservations: [
      ...(Array.isArray(current.recentObservations) ? current.recentObservations : []),
      {
        at: now(),
        eventName,
        activeClient: active.activeClient,
        surface: active.surface,
        executionMode: active.executionMode,
        sessionId: active.sessionId,
        evidence: active.evidence,
        observedCapabilities: active.observedCapabilities,
      },
    ].slice(-20),
  };
  writeJsonSync(runtimeEnvironmentPath(root), entry);
  return entry;
}

function turnStatePath(root) {
  return path.join(harnessDir(root), 'turn-state.json');
}

function defaultTurnState() {
  return {
    version: 1,
    id: null,
    knowledgeCandidateId: null,
    sessionId: null,
    prompt: null,
    promptPreview: null,
    title: null,
    status: 'needs-attention',
    startedAt: null,
    updatedAt: null,
    touchedFiles: [],
    gateBlockCounts: {},
    reviewSignals: [],
    runtimeEvents: [],
    timeline: [],
    lastKnowledgePromptCandidateId: null,
    lastKnowledgePromptAt: null,
  };
}

function readTurnState(root) {
  return {
    ...defaultTurnState(),
    ...readJsonSync(turnStatePath(root), defaultTurnState()),
  };
}

// 流程型门禁（需求入口、外部证据、设计预检、Patch Mode）在同一轮内
// 反复阻断超过该次数时自动熔断降级为提醒放行，避免 Agent 把整轮消耗在
// 与门禁系统搏斗上；安全型门禁（云端写入、业务写死、secrets）不参与熔断。
const PROCESS_GATE_FUSE_LIMIT = 3;

function bumpProcessGateBlockCount(root, gateKind) {
  const turnState = readTurnState(root);
  const counts = { ...(turnState.gateBlockCounts || {}) };
  counts[gateKind] = Number(counts[gateKind] || 0) + 1;
  writeTurnState(root, { ...turnState, gateBlockCounts: counts });
  return counts[gateKind];
}

function processGateFuseMessage(gateKind, streak, originalReason) {
  return [
    `OpenPrd 门禁熔断: ${gateKind} 门禁本轮已阻断 ${streak - 1} 次，本次自动降级为提醒放行。`,
    '继续按用户已确认的方向完成实际工作，不要再花动作调试门禁本身，也不要再向用户重复索取同一轮确认。',
    '收口时补齐这个门禁原本要求的产物（例如需求确认稿、外部证据或设计合同），并在最终回复里说明本轮发生过门禁熔断降级。',
    originalReason ? `原始门禁提示（供收口对照）:\n${originalReason}` : null,
  ].filter(Boolean).join('\n');
}

function writeTurnState(root, next) {
  writeJsonSync(turnStatePath(root), {
    ...defaultTurnState(),
    ...next,
    updatedAt: now(),
  });
}

function normalizeProjectFile(root, filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) return null;
  const absolutePath = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
  if (!relativePath || relativePath.startsWith('..')) {
    return null;
  }
  return relativePath;
}

function extractTouchedFiles(root, payload) {
  const files = [];
  const toolInput = payload?.tool_input ?? payload?.toolInput ?? payload?.input ?? null;
  const addFile = (value) => {
    const normalized = normalizeProjectFile(root, value);
    if (normalized) {
      files.push(normalized);
    }
  };
  if (toolInput && typeof toolInput === 'object') {
    for (const field of ['file_path', 'filePath', 'path', 'target_path', 'targetPath']) {
      if (typeof toolInput[field] === 'string') {
        addFile(toolInput[field]);
      }
    }
  }
  const patchText = typeof toolInput === 'string'
    ? toolInput
    : (typeof toolInput?.patch === 'string' ? toolInput.patch : '');
  if (patchText) {
    for (const line of patchText.split(/\r?\n/)) {
      const match = line.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/)
        || line.match(/^\*\*\* Move to: (.+)$/);
      if (match?.[1]) {
        addFile(match[1].trim());
      }
    }
  }
  return [...new Set(files)];
}

function beginTurnReview(root, baseEvent, prompt) {
  const promptPreview = preview(prompt, 240);
  writeTurnState(root, {
    version: 1,
    id: `turn-${String(Date.now())}-${baseEvent.fingerprint ?? 'openprd'}`,
    knowledgeCandidateId: null,
    sessionId: baseEvent.sessionId,
    prompt,
    promptPreview,
    title: promptPreview || '本轮项目回顾',
    summary: {
      title: promptPreview || '本轮项目回顾',
      status: 'needs-attention',
      message: '等待本轮实现和验证信号，用于 Stop 回顾生成项目经验草案。',
    },
    status: 'needs-attention',
    startedAt: now(),
    touchedFiles: [],
    gateBlockCounts: {},
    reviewSignals: [],
    runtimeEvents: promptPreview ? [{
      eventName: 'user-prompt',
      status: 'pass',
      message: promptPreview,
      at: now(),
    }] : [],
    timeline: promptPreview ? [{
      event: 'user-prompt',
      status: 'pass',
      message: promptPreview,
      at: now(),
    }] : [],
    lastKnowledgePromptCandidateId: null,
    lastKnowledgePromptAt: null,
  });
}

function recordTouchedFiles(root, payload) {
  const touchedFiles = extractTouchedFiles(root, payload);
  if (touchedFiles.length === 0) {
    return [];
  }
  const state = readTurnState(root);
  writeTurnState(root, {
    ...state,
    touchedFiles: [...new Set([...(Array.isArray(state.touchedFiles) ? state.touchedFiles : []), ...touchedFiles])],
  });
  return touchedFiles;
}

function appendTurnReviewSignals(root, signals) {
  const normalizedSignals = (Array.isArray(signals) ? signals : [signals])
    .filter(Boolean)
    .map((signal) => ({
      at: now(),
      ...signal,
    }));
  if (normalizedSignals.length === 0) {
    return [];
  }
  const state = readTurnState(root);
  const existing = Array.isArray(state.reviewSignals) ? state.reviewSignals : [];
  writeTurnState(root, {
    ...state,
    reviewSignals: [...existing, ...normalizedSignals].slice(-80),
    timeline: [
      ...(Array.isArray(state.timeline) ? state.timeline : []),
      ...normalizedSignals.map((signal) => ({
        event: signal.kind,
        status: 'pass',
        message: signal.message ?? signal.preview ?? signal.kind,
        at: signal.at,
      })),
    ].slice(-120),
  });
  return normalizedSignals;
}

function detectVisualEvidenceSignals(payload) {
  const tool = toolName(payload).toLowerCase();
  const command = commandText(payload);
  const text = payloadText(payload);
  const haystack = `${tool}\n${command}\n${text}`;
  const signals = [];
  if (/openprd\s+visual-prepare\b/i.test(haystack)) {
    signals.push({
      kind: 'visual-reference-prepared',
      message: 'visual-prepare reference-set/contact sheet observed',
      preview: preview(command || text, 180),
    });
  }
  if (/openprd\s+visual-compare\b/i.test(haystack)
    || /\.openprd\/harness\/visual-reviews\/(?:visual-|reference-sets\/)/i.test(haystack)
    || /visual-(?:compare|before-after|focus-board|parallel-board|verification-board|alignment-board|centering-board)/i.test(haystack)
    || /\b(?:reference-actual|before-after|focus-board|parallel-board|verification-board|alignment-board|centering-board|center-board)\b/i.test(haystack)) {
    signals.push({
      kind: 'visual-review-artifact',
      message: 'visual-compare artifact observed',
      preview: preview(command || text, 180),
    });
  }
  if (/\bverification-board\b|截图实测证据板|visual-verification-board/i.test(haystack)) {
    signals.push({
      kind: 'visual-verification-board',
      message: 'verification-board artifact observed',
      preview: preview(command || text, 180),
    });
  }
  if (/\balignment-board\b|对齐辅助线证据板|visual-alignment-board/i.test(haystack)) {
    signals.push({
      kind: 'visual-alignment-board',
      message: 'alignment-board artifact observed',
      preview: preview(command || text, 180),
    });
  }
  if (/\b(?:centering-board|center-board)\b|内部居中证据板|visual-centering-board/i.test(haystack)) {
    signals.push({
      kind: 'visual-centering-board',
      message: 'centering-board artifact observed',
      preview: preview(command || text, 180),
    });
  }
  const screenshotTool = /(?:^|[_-])(?:screenshot|view_image)(?:$|[_-])/i.test(tool)
    || /(?:computer|browser|playwright|page|mp|miniprogram|weapp).*screenshot/i.test(tool);
  const screenshotCommand = /\bscreencapture\b|page\.screenshot|\.screenshot\(|mp_screenshot|browser.*screenshot|computer.*screenshot|playwright.*screenshot/i.test(command);
  const screenshotText = /(?:普通截图|实测截图|运行态截图|Computer\s*实测|Browser\s*实测|截图证据|screenshot captured|captured screenshot)/i.test(text);
  if ((screenshotTool || screenshotCommand || screenshotText) && !/openprd\s+visual-compare\b/i.test(haystack)) {
    signals.push({
      kind: 'visual-raw-screenshot',
      message: 'raw screenshot or Computer/Browser visual evidence observed',
      preview: preview(command || text || tool, 180),
    });
  }
  return signals;
}

function recordVisualEvidenceSignals(root, payload) {
  return appendTurnReviewSignals(root, detectVisualEvidenceSignals(payload));
}

function updateHookState(root, event) {
  ensureHarness(root);
  const statePath = path.join(harnessDir(root), 'hook-state.json');
  const state = readJsonSync(statePath, {
    version: 1,
    counters: {},
    recentFingerprints: {},
    suppressions: { inputLock: false },
  });
  state.lastEventAt = now();
  state.lastEvent = event.eventName;
  state.lastFingerprint = event.fingerprint;
  state.counters[event.eventName] = (state.counters[event.eventName] || 0) + 1;
  state.recentFingerprints = state.recentFingerprints || {};
  if (event.fingerprint) {
    state.recentFingerprints[event.fingerprint] = Date.now();
  }
  if (event.runtimeEnvironment) {
    state.runtimeEnvironment = event.runtimeEnvironment;
  }
  for (const [fingerprint, seenAt] of Object.entries(state.recentFingerprints)) {
    if (Date.now() - Number(seenAt) > 300000) {
      delete state.recentFingerprints[fingerprint];
    }
  }
  writeJsonSync(statePath, state);
  return state;
}

function isDuplicate(root, fingerprint, windowMs = 15000) {
  const state = readJsonSync(path.join(harnessDir(root), 'hook-state.json'), {});
  const seenAt = state?.recentFingerprints?.[fingerprint];
  return Boolean(seenAt && Date.now() - Number(seenAt) < windowMs);
}

function fingerprintFor(eventName, payload, risk) {
  const tool = payload.tool_name || payload.toolName || payload.name || '';
  const inputText = JSON.stringify(payload.tool_input || payload.toolInput || payload.input || payload || {}).slice(0, 2000);
  return crypto.createHash('sha256').update(JSON.stringify({ eventName, tool, inputText, risk: risk.level })).digest('hex').slice(0, 16);
}

function sanitizeSessionId(value) {
  const text = String(value || '').trim();
  return /^[a-zA-Z0-9._-]{6,160}$/.test(text) ? text : null;
}

function sessionIdFor(payload) {
  const direct = sanitizeSessionId(payload.session_id || payload.sessionId || payload.thread_id || payload.threadId || payload.conversation_id || payload.conversationId);
  if (direct) return direct;
  const transcript = String(payload.transcript_path || payload.transcriptPath || '');
  const match = transcript.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
  return match ? sanitizeSessionId(match[1]) : null;
}

function payloadText(payload) {
  return JSON.stringify(payload.tool_input || payload.toolInput || payload.input || payload || {});
}

function promptText(payload) {
  return String(payload.prompt || payload.user_prompt || payload.message || '');
}

function preview(text, max = 600) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function commandText(payload) {
  const direct = typeof payload?.cmd === 'string'
    ? payload.cmd
    : typeof payload?.command === 'string'
      ? payload.command
      : '';
  if (direct) {
    return direct;
  }
  const toolInput = payload?.tool_input ?? payload?.toolInput ?? payload?.input ?? null;
  if (typeof toolInput === 'string') {
    return toolInput;
  }
  if (toolInput && typeof toolInput.command === 'string') {
    return toolInput.command;
  }
  if (toolInput && typeof toolInput.cmd === 'string') {
    return toolInput.cmd;
  }
  return '';
}

function toolName(payload) {
  return String(payload?.tool_name || payload?.toolName || payload?.name || '').trim();
}

function namedGateDir(root, gateName) {
  return path.join(harnessDir(root), `${gateName}-gates`);
}

function namedGatePath(root, gateName, sessionId = null) {
  if (sessionId) {
    return path.join(namedGateDir(root, gateName), `${sessionId}.json`);
  }
  return path.join(harnessDir(root), `${gateName}-gate.json`);
}

function readNamedGate(root, gateName, sessionId = null) {
  return readJsonSync(namedGatePath(root, gateName, sessionId), null);
}

function writeNamedGate(root, gateName, value, sessionId = null) {
  const next = sessionId ? { ...value, sessionId } : value;
  writeJsonSync(namedGatePath(root, gateName, sessionId), next);
  if (sessionId) {
    writeJsonSync(namedGatePath(root, gateName), next);
  }
  return next;
}

function updateNamedGate(root, gateName, patch, sessionId = null) {
  const current = readNamedGate(root, gateName, sessionId);
  if (!current) {
    return null;
  }
  return writeNamedGate(root, gateName, {
    ...current,
    updatedAt: now(),
    ...patch,
  }, sessionId);
}

function legacyRequirementGatePath(root) {
  return path.join(harnessDir(root), 'requirement-gate.json');
}

function requirementGateDir(root) {
  return path.join(harnessDir(root), 'requirement-gates');
}

function requirementGatePath(root, sessionId = null) {
  if (sessionId) {
    return path.join(requirementGateDir(root), `${sessionId}.json`);
  }
  return legacyRequirementGatePath(root);
}

function sessionBindingDir(root) {
  return path.join(harnessDir(root), 'session-bindings');
}

function sessionBindingPath(root, sessionId = null) {
  if (!sessionId) {
    return null;
  }
  return path.join(sessionBindingDir(root), `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

function openprdHome() {
  return path.resolve(process.env.OPENPRD_HOME || path.join(os.homedir(), '.openprd'));
}

function sessionRegistryPath() {
  return path.join(openprdHome(), 'registry', 'sessions.jsonl');
}

function truthyFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function normalizedMode(value) {
  return String(value ?? '').trim().toLowerCase();
}

function compactPayloadField(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value === undefined || value === null || value === false) {
      continue;
    }
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (text.trim()) {
      return { key, value: text.trim() };
    }
  }
  return null;
}

function automationPromptHeader(prompt) {
  const header = String(prompt || '').split(/\r?\n/).slice(0, 12).join('\n');
  if (/^\s*Automation\s*:/im.test(header) && /^\s*Automation\s+(ID|memory)\s*:/im.test(header)) {
    return 'prompt.automation-header';
  }
  if (/^\s*(Scheduled|Cron|Unattended)\s+(task|automation)\s*:/im.test(header)) {
    return 'prompt.scheduled-header';
  }
  return null;
}

function explicitOpenPrdOptInEvidence(payload) {
  const evidence = [];
  const mode = normalizedMode(process.env.OPENPRD_EXECUTION_MODE);
  if (['openprd', 'openprd-maintenance', 'maintenance'].includes(mode)) {
    evidence.push(`env.OPENPRD_EXECUTION_MODE=${mode}`);
  }
  if (truthyFlag(process.env.OPENPRD_AUTOMATION_OPT_IN) || truthyFlag(process.env.OPENPRD_ENABLE_IN_AUTOMATION)) {
    evidence.push('env.OPENPRD_AUTOMATION_OPT_IN');
  }
  const explicitField = compactPayloadField(payload, [
    'openprd_automation_opt_in',
    'openprdAutomationOptIn',
    'openprd_opt_in',
    'openprdOptIn',
    'enable_openprd',
    'enableOpenPrd',
  ]);
  if (explicitField) {
    evidence.push(`payload.${explicitField.key}`);
  }
  const text = `${promptText(payload)}\n${payloadText(payload)}`;
  const negative = /(不要|不需要|无需|禁止|别|不是|非|不要执行|不要调用|do\s+not|don't|never|without|no|not)\s+.{0,24}\bopen\s*prd\b/i
    .test(text)
    || /(不要|不需要|无需|禁止|别|不是|非).{0,24}OpenPrd/i.test(text);
  if (!negative && /(OpenPrd\s*(维护任务|maintenance|maintain|opt[- ]?in)|显式启用\s*OpenPrd|启用\s*OpenPrd|使用\s*OpenPrd|运行\s*OpenPrd|enable\s+OpenPrd|use\s+OpenPrd|openprd-maintenance)/i.test(text)) {
    evidence.push('prompt.openprd-opt-in');
  }
  return [...new Set(evidence)];
}

function detectExecutionSignals(eventName, payload) {
  const evidence = [];
  const mode = normalizedMode(process.env.OPENPRD_EXECUTION_MODE);
  if (['automation', 'cron', 'scheduled', 'headless', 'unattended'].includes(mode)) {
    evidence.push(`env.OPENPRD_EXECUTION_MODE=${mode}`);
  }
  if (truthyFlag(process.env.OPENPRD_AUTOMATION)) {
    evidence.push('env.OPENPRD_AUTOMATION');
  }
  if (compactString(process.env.CODEX_AUTOMATION_ID)) {
    evidence.push('env.CODEX_AUTOMATION_ID');
  }
  if (truthyFlag(process.env.CLAUDE_CODE_HEADLESS)) {
    evidence.push('env.CLAUDE_CODE_HEADLESS');
  }
  const field = compactPayloadField(payload, [
    'automation_id',
    'automationId',
    'automation_name',
    'automationName',
    'automation',
    'scheduled_task',
    'scheduledTask',
    'cron',
    'rrule',
    'headless',
    'unattended',
    'is_automation',
    'isAutomation',
  ]);
  if (field) {
    evidence.push(`payload.${field.key}`);
  }
  const runMode = compactPayloadField(payload, [
    'run_kind',
    'runKind',
    'execution_mode',
    'executionMode',
    'surface',
    'agent_surface',
    'agentSurface',
  ]);
  if (runMode && /(automation|cron|scheduled|headless|unattended)/i.test(runMode.value)) {
    evidence.push(`payload.${runMode.key}=${runMode.value}`);
  }
  const agentType = compactString(payload?.agent_type ?? payload?.agentType);
  if (agentType && /(automation|cron|scheduled|headless|unattended)/i.test(agentType)) {
    evidence.push(`payload.agentType=${agentType}`);
  }
  const promptHeader = automationPromptHeader(promptText(payload));
  if (promptHeader) {
    evidence.push(promptHeader);
  }
  const transcript = compactString(payload?.transcript_path ?? payload?.transcriptPath);
  if (transcript && /(?:^|[/-])(automation|automations|cron|scheduled|headless)(?:[/-]|$)/i.test(transcript)) {
    evidence.push('payload.transcript_path.automation');
  }
  const optInEvidence = explicitOpenPrdOptInEvidence(payload);
  return {
    eventName,
    isAutomation: evidence.length > 0,
    explicitOpenPrdOptIn: optInEvidence.length > 0,
    evidence: [...new Set(evidence)],
    optInEvidence,
    executionMode: optInEvidence.length > 0
      ? 'automation-openprd-opt-in'
      : evidence.length > 0
        ? 'automation'
        : 'interactive',
  };
}

function latestSessionRegistryEntry(root, sessionId) {
  if (!sessionId) {
    return null;
  }
  const filePath = sessionRegistryPath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const workspaceRoot = path.resolve(root);
  let latest = null;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line);
      if (entry?.sessionId !== sessionId) {
        continue;
      }
      const entryRoot = entry?.workspaceRoot ? path.resolve(String(entry.workspaceRoot)) : null;
      if (entryRoot && entryRoot !== workspaceRoot) {
        continue;
      }
      latest = entry;
    } catch {}
  }
  return latest;
}

function rememberAutomationMode(root, sessionId, payload, signals, laneKind) {
  if (!sessionId) {
    return null;
  }
  return writeSessionRegistryEntry(root, sessionId, {
    laneKind,
    tool: 'openprd-hook',
    promptPreview: preview(promptText(payload) || payloadText(payload), 500),
    gateActive: false,
    gateStatus: laneKind === 'automation' ? 'automation-safe-mode' : 'openprd-opt-in',
    title: laneKind === 'automation'
      ? 'Unattended automation bypassed OpenPrd'
      : 'Unattended automation explicitly enabled OpenPrd',
    executionEvidence: signals.evidence,
    optInEvidence: signals.optInEvidence,
  });
}

function automationBypassDecision(root, eventName, payload, sessionId) {
  const signals = detectExecutionSignals(eventName, payload);
  if (signals.explicitOpenPrdOptIn) {
    return { bypass: false, optIn: true, remembered: false, signals };
  }
  if (signals.isAutomation) {
    return { bypass: true, optIn: false, remembered: false, signals };
  }
  const remembered = eventName === 'UserPromptSubmit' ? null : latestSessionRegistryEntry(root, sessionId);
  if (remembered?.laneKind === 'automation' && remembered?.gateStatus === 'automation-safe-mode') {
    return { bypass: true, optIn: false, remembered: true, signals };
  }
  return { bypass: false, optIn: false, remembered: false, signals };
}

function sessionStatePath(root, sessionId = null) {
  if (!sessionId) {
    return null;
  }
  return path.join(harnessDir(root), 'session-states', `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

function currentStatePath(root) {
  return path.join(root, '.openprd', 'state', 'current.json');
}

function normalizeReviewStatus(value) {
  return ['pending-confirmation', 'confirmed', 'needs-revision'].includes(value) ? value : 'missing';
}

function normalizeRequirementApprovalPolicy(policy = {}) {
  const reviewPolicy = ['required', 'silent-record'].includes(policy?.reviewPolicy)
    ? policy.reviewPolicy
    : 'required';
  const maxClarificationQuestionsRaw = Number(policy?.maxClarificationQuestions);
  const maxClarificationQuestions = Number.isFinite(maxClarificationQuestionsRaw) && maxClarificationQuestionsRaw > 0
    ? Math.max(1, Math.floor(maxClarificationQuestionsRaw))
    : null;
  return {
    mode: 'decision-points',
    reviewPolicy,
    executionMode: policy?.executionMode === 'auto-after-review-and-tasks'
      ? 'auto-after-review-and-tasks'
      : 'manual-after-review-and-tasks',
    suppressExtraConfirmation: Boolean(policy?.suppressExtraConfirmation),
    maxClarificationQuestions,
  };
}

function requirementApprovalPolicy(gate) {
  return normalizeRequirementApprovalPolicy(gate?.approvalPolicy);
}

function reviewPolicyRequiresHumanConfirmation(policy) {
  return normalizeRequirementApprovalPolicy(policy).reviewPolicy === 'required';
}

function reviewPolicyAllowsSilentRecord(policy) {
  return normalizeRequirementApprovalPolicy(policy).reviewPolicy === 'silent-record';
}

function resolveRequirementApprovalPolicy(prompt, intent = {}) {
  const suppressExtraConfirmation = Boolean(intent?.noConfirmationRequested);
  const explicitExecution = Boolean(intent?.explicitExecution);
  return normalizeRequirementApprovalPolicy({
    mode: 'decision-points',
    reviewPolicy: explicitExecution && suppressExtraConfirmation ? 'silent-record' : 'required',
    executionMode: explicitExecution ? 'auto-after-review-and-tasks' : 'manual-after-review-and-tasks',
    suppressExtraConfirmation,
    maxClarificationQuestions: explicitExecution
      ? (suppressExtraConfirmation ? 1 : 2)
      : null,
  });
}

function readCliFlagValue(command, flag) {
  const quotedPattern = new RegExp(`${flag}\\s+(?:'([^']+)'|"([^"]+)"|([^\\s]+))`, 'i');
  const match = String(command || '').match(quotedPattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function parseReviewMarkCommand(text) {
  const command = String(text || '');
  if (!/openprd\s+review\b/i.test(command) || !/--mark\b/i.test(command)) {
    return null;
  }
  const mark = readCliFlagValue(command, '--mark')?.toLowerCase() ?? null;
  const versionId = readCliFlagValue(command, '--version');
  const digest = readCliFlagValue(command, '--digest');
  const workUnitId = readCliFlagValue(command, '--work-unit');
  if (!mark) {
    return null;
  }
  return { mark, versionId, digest, workUnitId };
}

function readSessionBinding(root, sessionId = null) {
  return readJsonSync(sessionBindingPath(root, sessionId), null);
}

function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(value) + '\n');
}

function writeSessionRegistryEntry(root, sessionId, patch = {}) {
  if (!sessionId) {
    return null;
  }
  const workspaceRoot = path.resolve(root);
  const recordedAt = patch.recordedAt || now();
  const entry = {
    version: 1,
    sessionId,
    workspaceRoot,
    realpath: workspaceRoot,
    laneKind: patch.laneKind || 'requirement',
    tool: patch.tool || 'codex',
    threadId: patch.threadId || null,
    changeId: patch.changeId || null,
    taskHandle: patch.taskHandle || null,
    workUnitId: patch.workUnitId || null,
    versionId: patch.versionId || null,
    digest: patch.digest || null,
    title: patch.title || null,
    targetRoot: patch.targetRoot ? path.resolve(patch.targetRoot) : null,
    promptPreview: patch.promptPreview || null,
    reviewStatus: patch.reviewStatus || null,
    gateStatus: patch.gateStatus || null,
    gateActive: patch.gateActive === true,
    statePath: patch.statePath || sessionStatePath(root, sessionId),
    bindingPath: patch.bindingPath || sessionBindingPath(root, sessionId),
    firstRegisteredAt: patch.firstRegisteredAt || recordedAt,
    lastRegisteredAt: recordedAt,
    lastUpdatedAt: patch.updatedAt || recordedAt,
    recordedAt,
  };
  appendJsonLine(sessionRegistryPath(), entry);
  return entry;
}

function writeSessionBinding(root, sessionId, patch = {}) {
  if (!sessionId) {
    return null;
  }
  const filePath = sessionBindingPath(root, sessionId);
  const previous = readJsonSync(filePath, null);
  const next = {
    ...(previous ?? {}),
    version: 1,
    sessionId,
    ...patch,
    createdAt: previous?.createdAt ?? patch.createdAt ?? now(),
    updatedAt: patch.updatedAt ?? now(),
  };
  writeJsonSync(filePath, next);
  writeSessionRegistryEntry(root, sessionId, {
    laneKind: patch.laneKind ?? previous?.laneKind ?? 'requirement',
    tool: patch.tool ?? previous?.tool ?? 'codex',
    threadId: patch.threadId ?? previous?.threadId ?? null,
    changeId: patch.changeId ?? next.changeId ?? null,
    taskHandle: patch.taskHandle ?? next.taskHandle ?? null,
    workUnitId: patch.workUnitId ?? next.workUnitId ?? null,
    versionId: patch.versionId ?? next.versionId ?? null,
    digest: patch.digest ?? next.digest ?? null,
    title: patch.title ?? next.title ?? null,
    targetRoot: patch.targetRoot ?? next.targetRoot ?? null,
    promptPreview: patch.promptPreview ?? next.promptPreview ?? null,
    reviewStatus: patch.reviewStatus ?? next.reviewStatus ?? null,
    gateStatus: patch.gateStatus ?? next.gateStatus ?? null,
    gateActive: patch.gateActive ?? next.gateActive ?? false,
    bindingPath: filePath,
    statePath: sessionStatePath(root, sessionId),
    updatedAt: next.updatedAt,
  });
  return next;
}

function readCurrentPrdReview(root) {
  const currentState = readJsonSync(currentStatePath(root), {}) || {};
  const reviewStatus = currentState.reviewStatus ?? {};
  const versionId = String(reviewStatus.versionId || currentState.latestVersionId || '').trim() || null;
  const digest = String(currentState.latestVersionDigest || '').trim() || null;
  const workUnitId = String(reviewStatus.workUnitId || currentState.activeWorkUnitId || '').trim() || null;
  return {
    versionId,
    digest,
    workUnitId,
    status: versionId ? normalizeReviewStatus(reviewStatus.status) : 'missing',
    artifact: reviewStatus.reviewPath || reviewStatus.stableArtifact || reviewStatus.entryPath || reviewStatus.artifact || null,
  };
}

function readRequirementLaneReview(root, sessionId = null) {
  const binding = readSessionBinding(root, sessionId);
  if (binding?.versionId || binding?.digest || binding?.workUnitId) {
    return {
      versionId: binding.versionId ?? null,
      digest: binding.digest ?? null,
      workUnitId: binding.workUnitId ?? null,
      status: binding.versionId ? normalizeReviewStatus(binding.reviewStatus) : 'missing',
      artifact: binding.reviewPath || binding.stableReviewArtifact || binding.activeReviewPath || binding.reviewArtifact || null,
    };
  }
  const globalReview = readCurrentPrdReview(root);
  if (sessionId && globalReview.versionId) {
    // 全局 current.json 里的确认稿可能属于另一个会话的历史需求。
    // 如果 lane 归属明确不是当前会话，就按“本轮还没有确认稿”自愈，
    // 避免把其他需求的旧稿卡成本轮的待确认死锁。
    const laneSessionId = String(readJsonSync(currentStatePath(root), {})?.laneSessionId || '').trim() || null;
    if (laneSessionId && laneSessionId !== sessionId) {
      return {
        versionId: null,
        digest: null,
        workUnitId: null,
        status: 'missing',
        artifact: null,
        staleReview: {
          versionId: globalReview.versionId,
          workUnitId: globalReview.workUnitId,
          laneSessionId,
        },
      };
    }
  }
  return globalReview;
}

function reviewCommandMatchesReview(command, review) {
  if (!command || !review) {
    return false;
  }
  return Boolean(
    command.versionId
    && command.digest
    && command.workUnitId
    && review.versionId
    && review.digest
    && review.workUnitId
    && command.versionId === review.versionId
    && command.digest === review.digest
    && command.workUnitId === review.workUnitId
  );
}

function readTextSync(filePath, maxLength = 20000) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(0, maxLength);
  } catch {
    return '';
  }
}

function readJsonlTailSync(filePath, maxLines = 160, maxBytes = 262144) {
  try {
    const stat = fs.statSync(filePath);
    const size = Number(stat.size || 0);
    const start = Math.max(0, size - maxBytes);
    const length = Math.max(0, size - start);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    fs.closeSync(fd);
    let lines = buffer.toString('utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (start > 0 && lines.length > 0) {
      lines = lines.slice(1);
    }
    return lines.slice(-maxLines).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function stateEventsPath(root) {
  return path.join(root, '.openprd', 'state', 'events.jsonl');
}

function latestDesignStarterRecord(root) {
  const entries = readJsonlTailSync(stateEventsPath(root), 80, 131072);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== 'design_starter_created' || typeof entry.output !== 'string') {
      continue;
    }
    const output = normalizeProjectFile(root, entry.output) || entry.output.trim();
    if (!output) {
      continue;
    }
    return {
      ...entry,
      output,
    };
  }
  return null;
}

const PATCH_MODE_ACTIVE_CONTRACT_FILES = [
  '.openprd/design/active/facts-sheet.md',
  '.openprd/design/active/asset-spec.md',
  '.openprd/design/active/image-preflight.md',
  '.openprd/design/active/direction-plan.md',
  '.openprd/design/active/selected-direction.md',
];

const PATCH_MODE_HANDOFF_FOCUS_ALLOWANCE = 2;

function patchModeDraftCandidates(relativeTarget) {
  const normalized = String(relativeTarget || '').replace(/\\/g, '/').trim();
  if (!normalized) {
    return [];
  }
  const parsed = path.posix.parse(normalized);
  const dirPrefix = parsed.dir ? `${parsed.dir}/` : '';
  const ext = parsed.ext || '';
  const name = parsed.name || normalized;
  return [
    `${dirPrefix}${name}.next${ext}`,
    `${dirPrefix}${name}.rewrite${ext}`,
  ];
}

function safeProjectMtimeMs(root, relativePath) {
  const normalized = normalizeProjectFile(root, relativePath);
  if (!normalized) {
    return null;
  }
  try {
    return fs.statSync(path.join(root, normalized)).mtimeMs;
  } catch {
    return null;
  }
}

function patchModeTargetFiles(gate) {
  return [...new Set([
    gate?.targetFile,
    ...(Array.isArray(gate?.draftFiles) ? gate.draftFiles : []),
  ].filter(Boolean).map((file) => String(file).replace(/\\/g, '/')))];
}

function patchModeFocusFiles(root, gate) {
  return [...new Set([
    gate?.targetFile,
    ...PATCH_MODE_ACTIVE_CONTRACT_FILES.map((file) => normalizeProjectFile(root, file) || file),
  ].filter(Boolean).map((file) => String(file).replace(/\\/g, '/')))];
}

function isPatchModeWriteObserved(root, gate) {
  const threshold = Number(gate?.armedAtMs ?? 0);
  if (!threshold) {
    return false;
  }
  for (const file of patchModeTargetFiles(gate)) {
    const mtimeMs = safeProjectMtimeMs(root, file);
    if (mtimeMs && mtimeMs > threshold) {
      return true;
    }
  }
  return false;
}

function transcriptPathFor(root, payload) {
  const raw = String(payload?.transcript_path || payload?.transcriptPath || '').trim();
  if (!raw) {
    return null;
  }
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  return fs.existsSync(resolved) ? resolved : null;
}

function assistantMessageTextFromTranscriptEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  if (entry.type === 'event_msg' && entry.payload?.type === 'agent_message') {
    return String(entry.payload.message || '');
  }
  if (entry.type !== 'response_item') {
    return '';
  }
  const payload = entry.payload || {};
  if (payload.type !== 'message' || payload.role !== 'assistant') {
    return '';
  }
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function hashProjectFile(root, relativePath) {
  const normalized = normalizeProjectFile(root, relativePath);
  if (!normalized) {
    return null;
  }
  try {
    const buffer = fs.readFileSync(path.join(root, normalized));
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

function patchModeFileHashSnapshot(root, files) {
  const snapshot = {};
  for (const file of files) {
    const normalized = normalizeProjectFile(root, file);
    if (!normalized) {
      continue;
    }
    snapshot[normalized] = hashProjectFile(root, normalized);
  }
  return snapshot;
}

function latestAssistantTranscriptMessage(root, payload) {
  const transcriptPath = transcriptPathFor(root, payload);
  if (!transcriptPath) {
    return null;
  }
  const entries = readJsonlTailSync(transcriptPath, 240, 393216);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const text = assistantMessageTextFromTranscriptEntry(entries[index]);
    if (!text) {
      continue;
    }
    const normalized = stripMarkdown(text).replace(/\s+/g, ' ').trim();
    if (!normalized) {
      continue;
    }
    return {
      text,
      normalized,
      preview: preview(normalized, 500),
      hash: hashText(normalized),
      transcriptPath,
    };
  }
  return null;
}

function looksLikePatchModeDeclaration(text) {
  const normalized = stripMarkdown(text).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }
  if (/(不要|先别|暂时别).{0,10}(覆盖|重写|改写)/.test(normalized)) {
    return false;
  }
  return [
    /(?:开始|现在开始|准备开始|进入).{0,12}(?:整页)?(?:覆盖|重写|改写).{0,20}(?:入口文件|index\.html|首页|页面)/i,
    /(?:开始|现在开始|准备开始).{0,12}(?:对|把)?\s*index\.html.{0,12}(?:覆盖|重写|改写)/i,
    /(?:start|starting|begin|beginning|now).{0,24}(?:overwrite|rewrite|replace).{0,24}(?:index\.html|entry file|home page|landing page|page)/i,
    /(?:overwrite|rewrite|replace).{0,24}(?:index\.html|entry file|home page|landing page).{0,24}(?:now|next)/i,
  ].some((pattern) => pattern.test(normalized));
}

function commandLooksLikeFileWrite(command) {
  const text = String(command || '');
  if (!text) {
    return false;
  }
  return /(?:^|[\s(;])(cat\s*<<|tee\b|cp\b|mv\b|install\b|perl\b|python\b|node\b|ruby\b|sed\s+-i\b|awk\b)|>>?/.test(text);
}

function isPatchModeWriteAttempt(root, payload, gate) {
  const targetFiles = new Set(patchModeTargetFiles(gate));
  if (targetFiles.size === 0) {
    return false;
  }
  const name = toolName(payload) || (commandText(payload) ? 'Bash' : '');
  const touchedFiles = extractTouchedFiles(root, payload);
  if (['Write', 'Edit', 'MultiEdit', 'apply_patch'].includes(name) && touchedFiles.some((file) => targetFiles.has(file))) {
    return true;
  }
  const command = commandText(payload).replace(/\\/g, '/');
  if (!['Bash', 'LS', 'Glob', 'Grep'].includes(name) || !command || !commandLooksLikeFileWrite(command)) {
    return false;
  }
  return [...targetFiles].some((file) => command.includes(file));
}

function isPatchModeFocusAttempt(root, payload, gate) {
  const remaining = Number(gate?.focusAllowanceRemaining ?? 0);
  if (remaining <= 0) {
    return false;
  }
  const focusFiles = new Set(patchModeFocusFiles(root, gate));
  if (focusFiles.size === 0) {
    return false;
  }
  const name = toolName(payload) || (commandText(payload) ? 'Bash' : '');
  const touchedFiles = extractTouchedFiles(root, payload);
  if (name === 'Read') {
    return touchedFiles.length > 0 && touchedFiles.every((file) => focusFiles.has(file));
  }
  if (!['Bash', 'Glob', 'Grep', 'LS'].includes(name)) {
    return false;
  }
  const command = commandText(payload).replace(/\\/g, '/');
  if (!command || commandLooksLikeFileWrite(command)) {
    return false;
  }
  return [...focusFiles].some((file) => command.includes(file));
}

function findChangeDir(root, changeId) {
  const candidates = [
    path.join(root, '.openprd', 'changes', changeId),
    path.join(root, '.openprd', 'archive', 'changes', changeId),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeChangeId(changeId) {
  return String(changeId || '未命名需求').replace(/[-_]+/g, ' ');
}

function firstHeading(text, fallback = '') {
  const match = String(text || '').match(/^#\s+(.+)$/m);
  return stripMarkdown(match?.[1] || fallback);
}

function specRequirementTitle(text) {
  const match = String(text || '').match(/^###\s+需求[:：]\s*(.+)$/m);
  return stripMarkdown(match?.[1] || '');
}

function collectSectionSummary(text, headingPatterns, maxItems = 3) {
  const lines = String(text || '').split(/\r?\n/);
  const collected = [];
  let inSection = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      const headingText = stripMarkdown(heading[1]);
      if (inSection && !headingPatterns.some((pattern) => pattern.test(headingText))) {
        break;
      }
      inSection = headingPatterns.some((pattern) => pattern.test(headingText));
      continue;
    }
    if (!inSection) {
      continue;
    }
    const item = stripMarkdown(line);
    if (item) {
      collected.push(item);
    }
    if (collected.length >= maxItems) {
      break;
    }
  }
  return collected.join('；');
}

function cleanTaskTitle(title) {
  return stripMarkdown(title)
    .replace(/^T\d+\.\d+\s+/, '')
    .replace(/^(实现主流程|实现需求|验证验收目标)[:：]\s*/, '')
    .trim();
}

function pendingTaskTitles(root, changeId, maxItems = 3) {
  const dir = findChangeDir(root, changeId);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((name) => /^tasks(?:-\d+)?\.md$/.test(name)).sort();
  } catch {
    return [];
  }
  const tasks = [];
  for (const file of files) {
    const text = readTextSync(path.join(dir, file));
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^- \[ \]\s+(.+)$/);
      if (!match) {
        continue;
      }
      const title = cleanTaskTitle(match[1]);
      if (title) {
        tasks.push(title);
      }
    }
  }
  const productTasks = tasks.filter((title) => !/(spec|validate|校验|评审|测试|文档|打包)/i.test(title));
  return (productTasks.length > 0 ? productTasks : tasks).slice(0, maxItems);
}

function readLocalTaskSummary(root, changeId) {
  if (!changeId) {
    return null;
  }
  const dir = findChangeDir(root, changeId);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((name) => /^tasks(?:-\d+)?\.md$/.test(name)).sort();
  } catch {
    return null;
  }
  let total = 0;
  let completed = 0;
  let pending = 0;
  for (const file of files) {
    const text = readTextSync(path.join(dir, file));
    for (const line of text.split(/\r?\n/)) {
      if (/^- \[x\]\s+/i.test(line)) {
        total += 1;
        completed += 1;
      } else if (/^- \[ \]\s+/.test(line)) {
        total += 1;
        pending += 1;
      }
    }
  }
  if (total === 0) {
    return null;
  }
  return {
    total,
    completed,
    pending,
    blocked: 0,
  };
}

function changeRequirementSummary(root, changeId) {
  const dir = findChangeDir(root, changeId);
  const proposal = readTextSync(path.join(dir, 'proposal.md'));
  const design = readTextSync(path.join(dir, 'design.md'));
  let spec = '';
  try {
    const specsRoot = path.join(dir, 'specs');
    const capability = fs.readdirSync(specsRoot).find((name) => !name.startsWith('.'));
    if (capability) {
      spec = readTextSync(path.join(specsRoot, capability, 'spec.md'));
    }
  } catch {}

  const title = firstHeading(proposal)
    || specRequirementTitle(spec)
    || firstHeading(design)
    || humanizeChangeId(changeId);
  const summary = collectSectionSummary(proposal, [/背景/, /原因/, /为什么/], 2)
    || collectSectionSummary(spec, [/新增需求/, /需求/], 2)
    || collectSectionSummary(design, [/目标/, /背景/], 3);

  return {
    title,
    summary,
    pendingTasks: pendingTaskTitles(root, changeId),
  };
}

function runOpenPrdContext(cwd, prompt = null) {
  const args = ['run', '.', '--context', '--json', '--hook-inject'];
  if (String(prompt || '').trim()) {
    args.push('--message', String(prompt).trim());
  }
  const json = runOpenPrd(args, cwd);
  if (json.stdout) {
    try {
      const parsed = JSON.parse(json.stdout);
      return {
        ok: true,
        commandOk: json.ok,
        status: json.status,
        parsed,
        stdout: renderRunContextText(parsed),
      };
    } catch {}
  }
  const fallbackArgs = ['run', '.', '--context'];
  if (String(prompt || '').trim()) {
    fallbackArgs.push('--message', String(prompt).trim());
  }
  const text = runOpenPrd(fallbackArgs, cwd);
  return {
    ok: text.ok,
    parsed: null,
    stdout: text.stdout,
  };
}

function knowledgeSkillContextLines(knowledgeSkills) {
  const matched = Array.isArray(knowledgeSkills?.matched) ? knowledgeSkills.matched : [];
  if (matched.length === 0) {
    return [];
  }
  const mandatoryCheck = knowledgeSkills?.mandatoryCheck ?? null;
  const lines = [
    mandatoryCheck?.required
      ? `项目级经验候选: 找到 ${matched.length} 条，并已加入当前上下文供判断`
      : `项目级 Skill: 自动命中 ${matched.length} 个，并已加入当前上下文`,
  ];
  if (mandatoryCheck?.required) {
    lines.push(`${mandatoryCheck.title}: ${mandatoryCheck.summary}`);
    for (const instruction of (mandatoryCheck.instructions ?? []).slice(0, 4)) {
      lines.push(`- ${instruction}`);
    }
    if (Array.isArray(mandatoryCheck.focusSignals) && mandatoryCheck.focusSignals.length > 0) {
      lines.push(`当前判断线索: ${mandatoryCheck.focusSignals.join('；')}`);
    }
  }
  for (const skill of matched.slice(0, 3)) {
    lines.push(`- ${skill.skillName}: ${skill.matchSummary || '命中当前上下文'}`);
    const useWhen = String(skill.useWhen || skill.description || '').trim().replace(/^use when\b[:：]?\s*/i, '').trim();
    if (useWhen) {
      lines.push(`  适用时机: ${useWhen}`);
    } else if (skill.description) {
      lines.push(`  说明: ${skill.description}`);
    }
    if (Array.isArray(skill.reviewFirst) && skill.reviewFirst.length > 0) {
      lines.push(`  先看: ${skill.reviewFirst.slice(0, 3).join('；')}`);
    }
    if (Array.isArray(skill.antiPatterns) && skill.antiPatterns.length > 0) {
      lines.push(`  不要直接套用: ${skill.antiPatterns.slice(0, 2).join('；')}`);
    }
    if (Array.isArray(skill.touchedFiles) && skill.touchedFiles.length > 0) {
      lines.push(`  相关文件: ${skill.touchedFiles.slice(0, 4).join('；')}`);
    }
    if (skill.adoption) {
      lines.push(`  复用指标: 命中 ${skill.adoption.hitCount || 0} / 引用 ${skill.adoption.referencedCount || 0} / 注入 ${skill.adoption.injectedCount || 0}`);
    }
  }
  return lines;
}

function renderRunContextText(result) {
  const lines = [
    '当前进展参考',
    '当前项目: ' + result.projectRoot,
    '基础检查: ' + (result.validation?.valid ? '通过' : '失败'),
  ];
  if (result.activeRequirementGate) {
    const gateStatus = result.activeRequirementGate.status ?? 'active';
    const gateSuffix = result.activeRequirementGate.relevance === 'background' ? '（仅背景提醒）' : '';
    lines.push('当前处理阶段: ' + gateStatus + gateSuffix);
  }
  if (result.activeChange) {
    const label = result.recommendation?.type === 'requirement-intake' ? '历史聚焦事项' : '当前聚焦事项';
    lines.push(label + ': ' + result.activeChange);
  }
  if (result.lane?.summary) {
    lines.push('当前处理路径: ' + result.lane.summary);
  }
  if (result.taskSummary) {
    lines.push('后续任务进度: ' + result.taskSummary.completed + '/' + result.taskSummary.total + ' 完成，' + result.taskSummary.pending + ' 待处理，' + result.taskSummary.blocked + ' 阻塞');
    if (result.taskSummary.implementation) {
      lines.push('待落地任务: ' + result.taskSummary.implementation.completed + '/' + result.taskSummary.implementation.total + ' 完成，' + result.taskSummary.implementation.pending + ' 待处理');
    }
  }
  if (result.discovery) {
    lines.push('调研进度: ' + result.discovery.runId + ' 已覆盖 ' + result.discovery.summary.covered + '/' + result.discovery.summary.total + '，待处理 ' + result.discovery.summary.pending);
  }
  lines.push(...knowledgeSkillContextLines(result.knowledgeSkills));
  lines.push('对外表达: 面向用户时，请优先说“本次调整”“后续任务”“继续落地”“完成后检查”这类人话，不要直接复述内部编号、命令、路径、版本号或流程术语。');
  const recommendation = result.recommendation || {};
  const clarifyReplyRequired = (recommendation.nextAction ?? '') === 'clarify-user'
    || recommendation.title === 'clarify-user'
    || recommendation.title === '继续本轮需求入口澄清';
  lines.push('建议下一步: ' + recommendation.title);
  lines.push('这样安排的原因: ' + recommendation.reason);
  if (clarifyReplyRequired) {
    lines.push('当前回复目标: 先在对话里输出 requirement 摘要或只追问 1 个最高价值澄清点；不要承诺“按默认方案直接实现”，也不要把“请帮我实现/继续实现”当成跳过 requirement 摘要确认的依据。');
  }
  if (recommendation.preparationCommand || recommendation.executionCommand || recommendation.commitCommand) {
    lines.push('开始动手前提: 只有在用户明确要求继续落地、实现、修复、深挖或提交时，才继续往下做；如果还缺这一步，就先用人话说明范围和影响。');
  }
  const checklist = recommendation.executionConfirmationChecklist;
  if (checklist?.required) {
    lines.push((checklist.title || '开始动手前先确认这些') + ':');
    if (checklist.objective) {
      lines.push('- 这次要做什么: ' + checklist.objective);
    }
    if (checklist.scope?.length > 0) {
      lines.push('- 这次范围: ' + checklist.scope.join('；'));
    }
    if (checklist.implementationItems?.length > 0) {
      lines.push('- 我会这样推进: ' + checklist.implementationItems.join('；'));
    }
    if (checklist.outOfScope?.length > 0) {
      lines.push('- 这次先不做: ' + checklist.outOfScope.join('；'));
    }
    if (checklist.verification?.length > 0) {
      lines.push('- 完成后会检查: ' + checklist.verification.join('；'));
    }
    if (checklist.risks?.length > 0) {
      lines.push('- 需要提前知道: ' + checklist.risks.join('；'));
    }
    if (checklist.confirmationPrompt) {
      lines.push('- 如果要我现在继续: ' + checklist.confirmationPrompt);
    }
  }
  if (recommendation.preparationCommand) {
    lines.push('内部准备参考: ' + recommendation.preparationCommand);
  }
  if (recommendation.executionCommand) {
    lines.push('内部执行参考: ' + recommendation.executionCommand);
  }
  if (recommendation.commitCommand) {
    lines.push('内部提交参考: ' + recommendation.commitCommand);
  }
  if (recommendation.loop?.worktreeRecommended || recommendation.isolation?.worktreeRecommended) {
    lines.push('环境建议: 最好放到单独环境里继续，避免和别的事项串线。');
  }
  lines.push('内部检查参考: ' + recommendation.verifyCommand);
  lines.push('内部状态参考: ' + (result.files?.runState || '.openprd/harness/run-state.json'));
  return lines.filter(Boolean).join('\n');
}

function inferLearningGenre(text) {
  const value = String(text || '');
  if (/仙侠|修仙|玄幻/.test(value)) {
    return 'xianxia';
  }
  if (/武侠/.test(value)) {
    return 'wuxia';
  }
  if (/童话|寓言/.test(value)) {
    return 'fairy-tale';
  }
  if (/科幻|赛博|cyberpunk|sci[-\s]?fi/i.test(value)) {
    return 'sci-fi';
  }
  if (/互联网产品|产品经理|PM/i.test(value)) {
    return 'internet-product';
  }
  return null;
}

function detectLearningMaterialIntent(prompt) {
  const text = stripMarkdown(prompt).trim();
  if (!text) {
    return { requested: false, genre: null, reason: null };
  }
  const explicitChatOnly = /(只要|仅要|仅需|就|直接).{0,16}(在对话里|回复|回答|写一段|一段文字|短文|纯文本|普通文本)|不要.{0,18}(文件|阅读器|学习包|HTML|html|openprd)/i.test(text);
  const durableReaderSignal = /(可长期阅读|长期阅读|可回看|阅读器|reader|电子书|学习包|归档)/i.test(text);
  if (explicitChatOnly && !durableReaderSignal) {
    return { requested: false, genre: null, reason: 'chat-only-requested' };
  }

  // This is an intent-shape detector, not a closed keyword table. The hook
  // looks for a requested learning deliverable, its durability/teaching goal,
  // and whether the expected output wants reader-like structure.
  const deliveryAction = /(生成|整理|产出|做一份|做一套|做个|做一个|创建|写一份|准备|沉淀|归档|转成|转换成|变成|输出|构建|给我)/i.test(text);
  const learningGoal = /(学习|教学|培训|复盘|教程|讲义|教材|课程|知识沉淀|经验沉淀|可回看|可复用|长期阅读|新人入门|onboarding)/i.test(text);
  const readerShape = /(学习(材料|资料|包|读本|文档)|复盘材料|教学材料|培训材料|教程|讲义|教材|课程|读本|电子书|阅读器|reader|ebook|章节|目录|证据锚点|图文讲解|检索练习|工作示例|可长期阅读|长期阅读)/i.test(text);
  const workToLearningArtifact = /(把|将|基于|围绕).{0,48}(工作|任务|过程|对话|会话|修复|需求|项目|实现|经验|记录|材料).{0,32}(转成|转换成|整理成|沉淀成|归档成|做成|写成).{0,40}(学习|复盘|教学|教程|讲义|材料|读本|可回看|可复用|长期阅读)/i.test(text);
  const requested = workToLearningArtifact
    || (readerShape && (deliveryAction || learningGoal || durableReaderSignal))
    || (learningGoal && durableReaderSignal);
  return {
    requested,
    genre: requested ? inferLearningGenre(text) : null,
    reason: workToLearningArtifact ? 'work-to-learning-artifact' : (readerShape ? 'reader-shaped-learning-artifact' : (requested ? 'durable-learning-goal' : null)),
  };
}

function analyzePromptIntent(prompt) {
  const text = String(prompt || '').trim();
  const normalized = text.toLowerCase();
  const continuationSessionId = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0] ?? null;
  const continuationTaskHandle = text.match(/\b[a-z0-9._-]+:T\d{3}\.\d{2}:[a-z0-9._-]+\b/i)?.[0] ?? null;
  const continuationWorkUnitId = text.match(/\bwu-[a-z0-9._-]+\b/i)?.[0] ?? null;
  const promptReviewCommand = parseReviewMarkCommand(text);
  const continuationVerbMatched = /(?:(?:继续|续做|接着做|继续执行|继续推进)(?:这个|这条|当前)?\s*(?:对话|任务|会话|记录|历史|Codex\s*任务)|(?:对话|任务|会话|记录|历史|Codex\s*任务).{0,6}(?:继续|续做|接着做|继续执行|继续推进)|^(?:继续|续做|接着做|继续执行|继续推进)\s*(?::|：))/i.test(text);
  const continuationRequest = continuationVerbMatched
    || Boolean(
      continuationTaskHandle
        || (continuationWorkUnitId && !promptReviewCommand)
    );
  const githubRepoPattern = /(?:https?:\/\/)?github\.com\/[^\s/]+\/[^\s/#?]+|(?:^|[\s(])[\w.-]+\/[\w.-]+(?=$|[\s)#?])/i;
  const internalOpenPrdExecution = /^#\s*OpenPrd\s+长程单任务执行会话/m.test(text)
    || /模式:\s*loop-run\b/i.test(text)
    || /模式:\s*loop-finish\b/i.test(text);
  // These signals only decide when to inject/open the requirement-intake lane.
  // The matcher should stay conservative: only likely L2 requests open the
  // heavy gate; L0/L1 stay lightweight unless the user expands the scope.
  const requirementRoutingSignalsStrong = [
    /新增/,
    /增加/,
    /新建/,
    /我希望/,
    /需求/,
    /模块/,
    /入口/,
    /流程/,
    /编排/,
    /一站式/,
    /信息架构/,
    /团队搭建/,
    /agent\s*市场/i,
    /skill\s*library/i,
    /UI/i,
    /cli\s*库/i,
    /workflow/i,
    /wizard/i,
  ];
  const requirementRoutingSignalsWeak = [
    /用户反馈/,
    /功能/,
    /页面/,
    /界面/,
    /视觉/,
    /体验/,
  ];
  const requirementChangeIntentSignals = [
    /新增/,
    /增加/,
    /新建/,
    /改(动|版|造|进|一下)?/,
    /优化/,
    /调整/,
    /重做/,
    /重构/,
    /放到/,
    /移到/,
    /移动到/,
    /切到/,
    /切换到/,
    /替换(成|为)?/,
    /串联/,
    /接入/,
    /实现/,
    /落地/,
  ];
  const tinyEditPatterns = [
    /加(一个|个)?空格/,
    /增加(一个|个)?空格/,
    /删(一个|个)?空格/,
    /去掉(一个|个)?空格/,
    /空格|标点|错别字|拼写|大小写/,
    /文案.{0,8}(改短|调整|替换)/,
    /按钮文案/,
    /typo/i,
    /spacing/i,
    /copy/i,
  ];
  const simpleConcretePatterns = [
    /按钮|文案|颜色|圆角|位置|间距|留白|边距|宽度|高度|卡片|字号|图标|标题|空格|标点|对齐|密度|label|copy|padding|margin|spacing|gap/i,
    /从.+(改到|移到|移动到|换到|变成|改成|改为).+/,
  ];
  const l2StructuralScopePatterns = [
    /模块/,
    /入口/,
    /流程/,
    /导入流/,
    /编排/,
    /workflow/i,
    /wizard/i,
  ];
  const l2StrategicScopePatterns = [
    /一站式/,
    /团队搭建/,
    /agent\s*市场/i,
    /skill\s*library/i,
    /cli\s*库/i,
    /权限/,
    /审批/,
    /计费/,
    /账号/,
    /第三方/,
    /云服务/,
    /迁移/,
    /跨系统/,
    /(AI|模型).{0,8}(接入|集成|编排)/i,
  ];
  const structuralExpansionIntensityPatterns = [
    /串联/,
    /一站式/,
    /整体/,
    /全链路/,
    /端到端/,
    /体系/,
    /平台/,
    /多个/,
  ];
  const featurePlanningPatterns = [
    /需求/,
    /方案/,
    /规划/,
    /产品/,
  ];
  const capabilityCreationPatterns = [
    /新增/,
    /增加/,
    /新建/,
    /做(一个|个)?/,
    /支持/,
    /提供/,
    /搭建/,
    /引入/,
    /接入/,
    /集成/,
  ];
  const crossSystemRiskPatterns = [
    /支付|登录|注册|账号|权限|订单|回调|风控|退款|计费|同步|迁移|数据库|schema|协议|网关|跨系统|第三方|云服务|OSS|CDN|MCP|SDK|CLI/i,
  ];
  const l1OptimizationPatterns = [
    /(优化|调整|改版|重做|重构|增强|补齐|梳理|统一|整理)/,
  ];
  const l0AdjustmentPatterns = [
    /(修复|修一下|改一下|调一下|换成|改成|去掉|补一个|补一下)/,
  ];
  const explicitExecutionPatterns = [
    /直接(帮我|给我)?(改|做|实现|落地|修|修复|处理|解决)/,
    /如果.{0,24}(定位|确认|找到).{0,12}(原因|根因).{0,24}直接.{0,12}(帮我|给我)?(修|修复|改|处理|解决)/,
    /开始(改|做|实现|开发|落地)/,
    /继续(改|做|实现|开发|落地|修|修复|处理|解决)/,
    /请(直接)?(实现|落地|修改|修复|处理|解决)/,
    /可以(执行|落地|实现|开发)/,
    /去(改|做|实现|开发|落地|修|修复|处理|解决)吧/,
    /那你去(改|做|实现|开发|落地|修|修复|处理|解决)吧/,
  ];
  const implementationConfirmationPatterns = [
    /确认.*(执行|落地|实现|继续|开发|修复|修改|处理|解决|改)/,
    /按(这个|刚才|上面|已确认)?.{0,12}(方案|计划|拆解).{0,12}(执行|落地|实现|开发|修复|修改|处理|解决|改)/,
    /按.{0,12}(思路|方案|计划|拆解).{0,12}(来吧|来|走|做|执行|落地|实现|开发|修复|修改|处理|解决|改)/,
  ];
  const noReviewRequestedPatterns = [
    /不需要评审/,
    /不用评审/,
    /无需评审/,
    /不要评审/,
    /别再评审/,
  ];
  const noConfirmationRequestedPatterns = [
    /不需要(再)?确认/,
    /不用(再)?确认/,
    /无需(再)?确认/,
    /不要(再)?确认/,
    /别再确认/,
    /不需要再跟我确认/,
  ];
  const reviewContinuationPatterns = [
    /认可方案并继续/,
    /认可并继续/,
    /继续当前\s*openprd\s*下一步/i,
    /按当前\s*openprd\s*下一步继续/i,
  ];
  const reviewConfirmPatterns = [
    /认可方案/,
    // 容忍“确认 v0276 评审稿”这类中间插版本号/空格的自然语言确认。
    /确认(?:当前|这个|这版|该)?\s*(?:[vV]\d+\s*(?:的)?)?(?:PRD|评审稿|评审页|review|需求稿|版本)/i,
    /确认\s*[vV]\d+/,
    /(?:PRD|评审稿|评审页|review|需求稿|版本)\s*(?:[vV]\d+)?.{0,12}(确认|通过|没问题|认可|可以)/i,
    /按这版(?:PRD|评审|需求稿)/i,
  ];
  const reviewNeedsRevisionPatterns = [
    /(?:PRD|评审稿|评审页|review|需求稿|版本).{0,12}(需要调整|需要修改|要调整|要修改)/i,
  ];
  const readOnlyPatterns = [
    /看看/,
    /看下(一下)?/,
    /你看/,
    /规划/,
    /分析/,
    /先分析(一下)?/,
    /梳理/,
    /评估/,
    /怎么改/,
    /预计动哪些文件/,
    /看(看)?(一下)?(原因|问题|风险|情况)/,
    /什么原因/,
    /怎么看/,
    /你觉得/,
    /可行吗/,
    /有没有可能/,
    /会有什么问题/,
    /值不值得/,
    /review/i,
    /explain/i,
  ];
  const bugfixOrDiagnostic = /诊断包|报错|错误|异常|崩溃|bug|问题|排查|定位|根因|复现|日志|故障/i.test(text)
    || /失败.{0,20}(原因|根因|排查|定位|修|修复|处理|解决)|(?:原因|根因|排查|定位).{0,20}失败/.test(text);
  const tinyEdit = tinyEditPatterns.some((pattern) => pattern.test(text));
  const crossSystemRiskMatched = crossSystemRiskPatterns.some((pattern) => pattern.test(text));
  const localUiScopeMatched = hasLightweightUiVisualSignal(text)
    || /(样式|页面|界面|布局|信息架构|导航|列表|详情页|设置页)/i.test(text);
  const reviewContinuationRequested = reviewContinuationPatterns.some((pattern) => pattern.test(text));
  const explicitExecution = internalOpenPrdExecution
    || continuationVerbMatched
    || reviewContinuationRequested
    || explicitExecutionPatterns.some((pattern) => pattern.test(text));
  const implementationConfirmation = reviewContinuationRequested
    || implementationConfirmationPatterns.some((pattern) => pattern.test(text));
  const noReviewRequested = noReviewRequestedPatterns.some((pattern) => pattern.test(text));
  const noConfirmationRequested = noConfirmationRequestedPatterns.some((pattern) => pattern.test(text));
  const reviewDecision = promptReviewCommand?.mark
    ?? (reviewContinuationRequested ? 'confirmed' : null)
    ?? (reviewConfirmPatterns.some((pattern) => pattern.test(text)) ? 'confirmed' : null)
    ?? (reviewNeedsRevisionPatterns.some((pattern) => pattern.test(text)) ? 'needs-revision' : null);
  const confirmation = implementationConfirmation || Boolean(reviewDecision);
  const readOnly = readOnlyPatterns.some((pattern) => pattern.test(text));
  const codeVisualArtifactRequested = /HTML|SVG|CSS|Canvas|代码稿|源码|source artifact|可编辑矢量|可编辑稿/i.test(text);
  const imageGenerationTerms = /图片|封面图|封面|配图|海报|插画|图标|贴纸|头像|banner|横幅|KV|主视觉|运营图|宣传图|商品图|背景图|壁纸|位图资产|效果图|视觉稿|mockup|样子|设计方向|设计预览/i;
  const imageGenerationAction = /生成|出一张|做一张|做个|做一个|画|绘制|设计|产出|给我|来一张|先看|确认|预览|看看|截图/i;
  const visualMockupRequest = imageGenerationTerms.test(text)
    && imageGenerationAction.test(text)
    && !codeVisualArtifactRequested;
  const learningMaterialIntent = detectLearningMaterialIntent(text);
  const learningMaterialRequest = learningMaterialIntent.requested;
  const canvasCollaborationRequest = /(画布|canvas|excalidraw)/i.test(text)
    && /(标注|批注|协同|改图|回填|贴到画布|放到画布|插入画布|插到画布|画布评审|画布反馈|一起看|openprd\s*canvas|annotation)/i.test(text);
  const visualReview = /效果图|实现截图|视觉对比|视觉评审|对标效果图|复刻|不一致|好丑|没对齐|对不上|不像/i.test(text);
  const directBugfixExecution = explicitExecution && bugfixOrDiagnostic;
  const newFeatureVerbMatched = /(新增|增加|新建)/.test(text);
  const capabilityCreationMatched = capabilityCreationPatterns.some((pattern) => pattern.test(text));
  const featurePlanningMatched = featurePlanningPatterns.some((pattern) => pattern.test(text));
  const structuralL2ScopeMatchCount = l2StructuralScopePatterns.filter((pattern) => pattern.test(text)).length;
  const strategicL2ScopeMatched = l2StrategicScopePatterns.some((pattern) => pattern.test(text));
  const structuralExpansionMatched = structuralL2ScopeMatchCount >= 2
    || (structuralL2ScopeMatchCount >= 1
      && (structuralExpansionIntensityPatterns.some((pattern) => pattern.test(text)) || (capabilityCreationMatched && !localUiScopeMatched)));
  const l2ScopeMatched = strategicL2ScopeMatched || structuralExpansionMatched;
  const simpleConcrete = text.length <= 80
    && simpleConcretePatterns.some((pattern) => pattern.test(text))
    && !l2ScopeMatched;
  const requirementSignalMatched = requirementRoutingSignalsStrong.some((pattern) => pattern.test(text))
    || (requirementRoutingSignalsWeak.some((pattern) => pattern.test(text))
      && requirementChangeIntentSignals.some((pattern) => pattern.test(text)));
  const l2FeatureExpansionMatched = (capabilityCreationMatched && (strategicL2ScopeMatched || structuralExpansionMatched))
    || (!localUiScopeMatched && newFeatureVerbMatched && text.length > 18);
  const l2PlanningRequestMatched = !readOnly
    && featurePlanningMatched
    && requirementChangeIntentSignals.some((pattern) => pattern.test(text))
    && (strategicL2ScopeMatched || structuralExpansionMatched);
  const l1OptimizationMatched = l1OptimizationPatterns.some((pattern) => pattern.test(text))
    && (hasLightweightUiVisualSignal(text) || /(页面|界面|视觉|样式|布局|信息架构|交互|体验|流程|入口|导航|表单|设置页|列表|详情页)/i.test(text));
  // 改现有脚本、CLI、发布/构建流程、参数或文档这类既有资产优化，
  // 不应仅因出现“新增/增加/补一个”动词就升级成 L2 重流程；
  // 只有同时命中真正的结构/战略扩张信号时才保留 L2。
  const existingAssetOptimizationMatched = /(脚本|script|发布|上传|部署|构建|打包|导出|同步|清理|CLI|命令行|命令|参数|选项|flag|配置文件|文档|README)/i.test(text)
    && /(补|加|增加|支持|筛选|过滤|优化|调整|收敛|清理|改成|改为|升级|更新|修改|梳理)/.test(text)
    && !/(新产品|新模块|新平台|新系统|新页面|新界面|新客户端|全新|从零|从\s*0|重写整个|重构整个)/i.test(text);
  const l0AdjustmentMatched = l0AdjustmentPatterns.some((pattern) => pattern.test(text))
    && (hasLightweightUiVisualSignal(text) || /(样式|一处)/i.test(text));
  const publicRepoResearchRequest = githubRepoPattern.test(text)
    && /(github|仓库|repo|项目|参考|对标|复刻|review|学习|架构|模块|流程|构建|测试|扩展点)/i.test(text);
  const externalTechResearchRequest = /(第三方|library|framework|sdk|api|mcp|cli|依赖|包|版本|迁移|弃用|官方文档|参数|返回值|生命周期)/i.test(text)
    && /(怎么用|用法|配置|限制|版本|迁移|报错|集成|接入|最佳实践|示例|安装|参数|返回值|生命周期)/i.test(text);
  const skillWorkflowEditRequest = /SKILL\.md|AGENTS\.md/i.test(text)
    || (/(^|[^a-z])(skill|skills)([^a-z]|$)/i.test(text) && /(创建|修改|优化|重构|合并|拆分|更新|工作流|workflow|流程|路由|router|提示词|规则)/i.test(text))
    || (/AGENTS\.md/i.test(text) && /(创建|修改|优化|精简|收薄|重构|更新)/i.test(text));
  const secretsRequest = /(api\s*key|token|secret|credential|password|凭证|密钥|密码|账号信息|第三方服务凭证|个人信息|登录信息)/i.test(text);
  const weappMention = /(微信小程序|miniprogram|weapp|微信开发者工具|weapp-dev-mcp)/i.test(text);
  const weappValidationAction = /(测试|验证|实测|复现|截图|日志|抓日志|抓包|网络请求|network|运行态|开发者工具自动化|从\s*0\s*到\s*1|冷启动|重开|重新打开|全流程)/i.test(text);
  const weappValidationRequest = /weapp-dev-mcp/i.test(text)
    || (weappMention && weappValidationAction);
  const browserSafetyRequest = /(computer use|browser use|浏览器|browser|网页|页面|窗口|标签页|tab|profile)/i.test(text)
    && /(点击|输入|提交|登录|注销|退出|支付|关闭|send|submit|type|click|switch account|切换账号)/i.test(text);
  const productCopyRequest = /(文案|copy|错误文案|空状态|成功提示|按钮文案|提示语|toast|placeholder|设置项文案|国际化|i18n|locales|translations|localizable)/i.test(text);
  const l2RequirementCandidate = (bugfixOrDiagnostic && crossSystemRiskMatched)
    || l2FeatureExpansionMatched
    || l2PlanningRequestMatched;
  const existingAssetDemotionApplies = existingAssetOptimizationMatched
    && !strategicL2ScopeMatched
    && structuralL2ScopeMatchCount === 0;
  const requirementTier = !internalOpenPrdExecution
    ? (l2RequirementCandidate
        && !existingAssetDemotionApplies
        && !tinyEdit
        && !simpleConcrete
        && !visualMockupRequest
        && !(readOnly && !explicitExecution)
      ? 'l2'
      : (!visualMockupRequest
          && (!readOnly || explicitExecution)
          && (tinyEdit
            || simpleConcrete
            || l0AdjustmentMatched
            || (directBugfixExecution && !crossSystemRiskMatched)
            || (bugfixOrDiagnostic && !crossSystemRiskMatched))
        ? 'l0'
        : (!visualMockupRequest
            && !readOnly
            && (l1OptimizationMatched
              || requirementSignalMatched
              || (l2RequirementCandidate && existingAssetDemotionApplies))
          ? 'l1'
          : null)))
    : null;
  const requiresIntake = requirementTier === 'l2';
  return {
    promptText: text,
    requirementTier,
    requiresIntake,
    explicitExecution,
    confirmation,
    implementationConfirmation,
    noReviewRequested,
    noConfirmationRequested,
    reviewDecision,
    reviewCommand: promptReviewCommand,
    reviewContinuationRequested,
    readOnly,
    simpleConcrete,
    visualMockupRequest,
    continuationRequest,
    continuationSessionId,
    continuationTaskHandle,
    continuationWorkUnitId,
    publicRepoResearchRequest,
    externalTechResearchRequest,
    skillWorkflowEditRequest,
    secretsRequest,
    weappValidationRequest,
    browserSafetyRequest,
    productCopyRequest,
    learningMaterialRequest,
    learningGenre: learningMaterialIntent.genre,
    learningMaterialReason: learningMaterialIntent.reason,
    canvasCollaborationRequest,
    shouldInject: requiresIntake
      || requirementTier === 'l1'
      || explicitExecution
      || confirmation
      || readOnly
      || visualMockupRequest
      || continuationRequest
      || visualReview
      || publicRepoResearchRequest
      || externalTechResearchRequest
      || skillWorkflowEditRequest
      || secretsRequest
      || weappValidationRequest
      || browserSafetyRequest
      || productCopyRequest
      || learningMaterialRequest
      || canvasCollaborationRequest
      || /openprd/i.test(normalized)
      || /\bprd\b/i.test(normalized),
  };
}

function isShortAffirmativeConfirmation(prompt) {
  const text = stripMarkdown(prompt).trim();
  return /^(可以|好|行|确认|确定|没问题|同意|就这样|OK|ok|yes|Yes|yep|Yep)[。！!,.，s]*$/.test(text);
}

function looksLikeClarificationFollowupReply(prompt, intent = null) {
  const text = stripMarkdown(prompt).trim();
  if (!text || text.length > 48 || /[\n\r]/.test(text) || /[?？]/.test(text)) {
    return false;
  }
  if (intent?.requiresIntake || intent?.readOnly || intent?.reviewDecision || intent?.publicRepoResearchRequest || intent?.externalTechResearchRequest || intent?.skillWorkflowEditRequest || intent?.continuationRequest) {
    return false;
  }
  if (/[：:]/.test(text) && text.length > 24) {
    return false;
  }
  return true;
}

function detectRequirementIntakeMode(prompt) {
  const text = String(prompt || '');
  const deep = text.length >= 80
    || /新增|新建|模块|流程|编排|一站式|信息架构|工作流|workflow|wizard/i.test(text)
    || /多角色|权限|审批|协作|团队|客户|后台|管理/.test(text)
    || /AI|agent|模型|生成|自动化|集成|第三方/i.test(text)
    || /体验|优化|提升|更好|智能|自动|高效|完整|体系|平台/.test(text);
  return deep ? 'deep-reflection' : 'focused-reflection';
}

function readRequirementGate(root, sessionId = null) {
  return readJsonSync(requirementGatePath(root, sessionId), null);
}

function writeRequirementGate(root, value, sessionId = null) {
  const next = sessionId ? { ...value, sessionId } : value;
  writeJsonSync(requirementGatePath(root, sessionId), next);
  if (sessionId) {
    writeJsonSync(legacyRequirementGatePath(root), next);
    writeSessionBinding(root, sessionId, {
      promptPreview: next.promptPreview ?? null,
      gateStatus: next.status ?? null,
      gateActive: Boolean(next.active),
    });
  }
}

function mirrorRequirementGate(root, sessionId) {
  if (!sessionId) return null;
  const gate = readRequirementGate(root, sessionId);
  if (gate) {
    writeJsonSync(legacyRequirementGatePath(root), gate);
  }
  return gate;
}

function openRequirementGate(root, prompt, intent, sessionId = null) {
  const current = readRequirementGate(root, sessionId);
  const approvalPolicy = resolveRequirementApprovalPolicy(prompt, intent);
  const gate = {
    version: 1,
    active: true,
    status: 'requires-clarification',
    openedAt: current?.openedAt || now(),
    updatedAt: now(),
    promptPreview: preview(prompt, 500),
    reason: 'likely-l2 requirement flow',
    requiredFlow: ['requirement-intake', 'clarify', 'capture', 'synthesize', 'review', 'change-generate', 'tasks', 'implementation'],
    intakeMode: detectRequirementIntakeMode(prompt),
    intent,
    executionIntent: {
      explicitRequested: Boolean(intent?.explicitExecution),
      suppressExtraConfirmation: approvalPolicy.suppressExtraConfirmation,
      source: approvalPolicy.suppressExtraConfirmation ? 'user-opt-out' : 'default',
      latchedAt: now(),
    },
    approvalPolicy,
    reviewActionAuthorization: null,
  };
  writeRequirementGate(root, gate, sessionId);
  return gate;
}

function confirmRequirementGate(root, prompt, sessionId = null) {
  const current = readRequirementGate(root, sessionId);
  if (!current?.active) {
    return current;
  }
  const next = {
    ...current,
    active: false,
    status: 'user-confirmed-for-execution',
    confirmedAt: now(),
    confirmationPreview: preview(prompt, 500),
    reviewActionAuthorization: null,
  };
  writeRequirementGate(root, next, sessionId);
  return next;
}

function authorizeRequirementGateExecution(root, prompt, sessionId = null, options = {}) {
  const current = readRequirementGate(root, sessionId);
  if (!current?.active) {
    return current;
  }
  const next = {
    ...current,
    active: false,
    status: options.status ?? 'execution-authorized',
    confirmedAt: now(),
    confirmationPreview: preview(prompt || current.promptPreview || '', 500),
    authorizationReason: options.reason ?? null,
    reviewActionAuthorization: null,
  };
  writeRequirementGate(root, next, sessionId);
  return next;
}

function escalateRequirementGateApproval(root, prompt, gate, sessionId = null) {
  // 用户已经确认过一次需求摘要，又再次给出明确肯定/继续意图时，
  // 把当前 lane 升级为 silent-record + 自动执行授权：后续 review 记录、change、tasks
  // 都沿已确认范围静默推进，不再向用户反复索取同一轮确认。
  const approvalPolicy = normalizeRequirementApprovalPolicy({
    ...(gate?.approvalPolicy ?? {}),
    reviewPolicy: 'silent-record',
    executionMode: 'auto-after-review-and-tasks',
    suppressExtraConfirmation: true,
  });
  return updateRequirementGate(root, {
    approvalPolicy,
    intent: { ...(gate?.intent ?? {}), explicitExecution: true },
    executionIntent: {
      ...(gate?.executionIntent ?? {}),
      explicitRequested: true,
      suppressExtraConfirmation: true,
      source: 'repeated-user-confirmation',
      latchedAt: now(),
    },
    confirmationCount: Number(gate?.confirmationCount ?? 1) + 1,
    repeatedConfirmationAt: now(),
    confirmationPreview: preview(prompt, 500),
  }, sessionId);
}

function updateRequirementGate(root, patch, sessionId = null) {
  const current = readRequirementGate(root, sessionId);
  if (!current?.active) {
    return current;
  }
  const next = {
    ...current,
    active: true,
    updatedAt: now(),
    ...patch,
  };
  writeRequirementGate(root, next, sessionId);
  return next;
}

function openResearchGate(root, prompt, intent, sessionId = null) {
  const kind = intent?.publicRepoResearchRequest ? 'deepwiki' : 'context7';
  return writeNamedGate(root, 'research', {
    version: 1,
    active: true,
    kind,
    status: kind === 'deepwiki' ? 'needs-deepwiki-evidence' : 'needs-context7-evidence',
    openedAt: now(),
    updatedAt: now(),
    promptPreview: preview(prompt, 500),
    localEvidenceSeen: false,
    externalEvidence: {
      readWikiStructure: false,
      askQuestion: false,
      resolveLibraryId: false,
      queryDocs: false,
    },
  }, sessionId);
}

function closeResearchGate(root, sessionId = null, patch = {}) {
  const current = readNamedGate(root, 'research', sessionId);
  if (!current) {
    return null;
  }
  return writeNamedGate(root, 'research', {
    ...current,
    active: false,
    status: patch.status || 'closed',
    closedAt: patch.closedAt || now(),
    ...patch,
  }, sessionId);
}

function openSkillVisualizationGate(root, prompt, sessionId = null) {
  return writeNamedGate(root, 'skill-visualization', {
    version: 1,
    active: true,
    status: 'needs-visual-confirmation',
    openedAt: now(),
    updatedAt: now(),
    promptPreview: preview(prompt, 500),
  }, sessionId);
}

function confirmSkillVisualizationGate(root, prompt, sessionId = null) {
  const current = readNamedGate(root, 'skill-visualization', sessionId);
  if (!current) {
    return null;
  }
  return writeNamedGate(root, 'skill-visualization', {
    ...current,
    active: false,
    status: 'user-confirmed-after-visualization',
    confirmedAt: now(),
    confirmationPreview: preview(prompt, 500),
  }, sessionId);
}

function closeSkillVisualizationGate(root, sessionId = null, patch = {}) {
  const current = readNamedGate(root, 'skill-visualization', sessionId);
  if (!current) {
    return null;
  }
  return writeNamedGate(root, 'skill-visualization', {
    ...current,
    active: false,
    status: patch.status || 'closed',
    closedAt: patch.closedAt || now(),
    ...patch,
  }, sessionId);
}

function openWeappGate(root, prompt, sessionId = null) {
  return writeNamedGate(root, 'weapp', {
    version: 1,
    active: true,
    status: 'needs-weapp-runtime-validation',
    openedAt: now(),
    updatedAt: now(),
    promptPreview: preview(prompt, 500),
    validationSignals: {
      ensureConnection: false,
      runtimeAction: false,
    },
  }, sessionId);
}

function closeWeappGate(root, sessionId = null, patch = {}) {
  const current = readNamedGate(root, 'weapp', sessionId);
  if (!current) {
    return null;
  }
  return writeNamedGate(root, 'weapp', {
    ...current,
    active: false,
    status: patch.status || 'validated',
    closedAt: patch.closedAt || now(),
    ...patch,
  }, sessionId);
}

function openPatchModeGate(root, patch, sessionId = null) {
  const current = readNamedGate(root, 'patch-mode', sessionId);
  return writeNamedGate(root, 'patch-mode', {
    version: 1,
    active: true,
    status: 'awaiting-entry-write',
    openedAt: current?.openedAt || now(),
    updatedAt: now(),
    ...current,
    ...patch,
  }, sessionId);
}

function closePatchModeGate(root, sessionId = null, patch = {}) {
  const current = readNamedGate(root, 'patch-mode', sessionId);
  if (!current) {
    return null;
  }
  return writeNamedGate(root, 'patch-mode', {
    ...current,
    active: false,
    status: patch.status || 'closed',
    closedAt: patch.closedAt || now(),
    updatedAt: now(),
    ...patch,
  }, sessionId);
}

function syncPatchModeGate(root, payload, sessionId = null, intent = null) {
  let gate = readNamedGate(root, 'patch-mode', sessionId);
  if (gate?.active && isPatchModeWriteObserved(root, gate)) {
    gate = closePatchModeGate(root, sessionId, {
      status: 'write-observed',
      writeObservedAt: now(),
    });
  }
  const designStarter = latestDesignStarterRecord(root);
  if (!designStarter && !isFrontendTaskIntent(intent)) {
    return gate;
  }
  const targetFile = normalizeProjectFile(root, designStarter?.output || 'index.html') || 'index.html';
  const draftFiles = patchModeDraftCandidates(targetFile);
  const fileHashesAtArm = patchModeFileHashSnapshot(root, [targetFile, ...draftFiles]);
  const assistantMessage = latestAssistantTranscriptMessage(root, payload);
  if (assistantMessage && looksLikePatchModeDeclaration(assistantMessage.normalized)) {
    if (gate?.messageHash === assistantMessage.hash && gate?.targetFile === targetFile && gate?.phase === 'strict') {
      return gate;
    }
    return openPatchModeGate(root, {
      phase: 'strict',
      status: 'awaiting-entry-write',
      targetFile,
      targetHashAtArm: hashProjectFile(root, targetFile),
      fileHashesAtArm,
      draftFiles,
      focusAllowanceRemaining: 0,
      messageHash: assistantMessage.hash,
      messagePreview: assistantMessage.preview,
      transcriptPath: assistantMessage.transcriptPath,
      designStarterOutput: targetFile,
      armedAtMs: Date.now(),
      armedAt: now(),
    }, sessionId);
  }
  if (!designStarter) {
    return gate;
  }
  if (gate?.active && gate?.targetFile === targetFile) {
    return gate;
  }
  return openPatchModeGate(root, {
    phase: 'handoff',
    status: 'awaiting-patch-handoff',
    targetFile,
    targetHashAtArm: hashProjectFile(root, targetFile),
    fileHashesAtArm,
    draftFiles,
    focusAllowanceRemaining: PATCH_MODE_HANDOFF_FOCUS_ALLOWANCE,
    messageHash: assistantMessage?.hash || null,
    messagePreview: assistantMessage?.preview || null,
    transcriptPath: assistantMessage?.transcriptPath || null,
    designStarterOutput: targetFile,
    armedAtMs: Date.now(),
    armedAt: now(),
  }, sessionId);
}

function evaluateRequirementGateProgress(root, sessionId = null) {
  const gate = readRequirementGate(root, sessionId);
  const binding = readSessionBinding(root, sessionId);
  const promptPreview = gate?.promptPreview ?? binding?.promptPreview ?? null;
  const run = runOpenPrdContext(root, promptPreview);
  const parsed = run.parsed ?? {};
  const review = readRequirementLaneReview(root, sessionId);
  const targetedFocusChangeId = parsed?.lane?.kind === 'targeted'
    ? (parsed.focus?.changeId ?? null)
    : null;
  const activeChange = binding?.changeId
    ?? (sessionId
      ? (targetedFocusChangeId ?? null)
      : (targetedFocusChangeId ?? parsed.focus?.changeId ?? parsed.activeChange ?? null));
  const taskSummary = activeChange ? readLocalTaskSummary(root, activeChange) : null;
  const hasTaskBreakdown = Boolean(activeChange && Number(taskSummary?.total ?? 0) > 0);
  const approvalPolicy = requirementApprovalPolicy(gate);
  const clarificationConfirmed = requirementWritePathExplicitlyAuthorized(gate);
  const recommendationNextAction = run.parsed?.recommendation?.nextAction
    ?? run.parsed?.recommendation?.title
    ?? '';
  const missingRequiredFields = Number(run.parsed?.analysis?.missingRequiredFields ?? 0);
  const lacksProductType = !run.parsed?.analysis?.productType;
  const clarificationStillNeedsWriteback = clarificationConfirmed
    && recommendationNextAction === 'clarify-user'
    && (lacksProductType || missingRequiredFields > 0);
  const classificationStillNeeded = clarificationConfirmed && recommendationNextAction === 'classify';
  const interviewStillNeeded = clarificationConfirmed && recommendationNextAction === 'interview';
  let nextStep = 'implementation-ready';
  let reason = '这版需求和后续任务都已经准备好了；如果用户原本就明确要继续做，就直接往下推进，否则再补一句清楚的人话授权。';
  if (!review.versionId) {
    nextStep = clarificationConfirmed
      ? (
          clarificationStillNeedsWriteback
            ? 'clarification-writeback-required'
            : classificationStillNeeded
              ? 'product-type-classification-required'
              : interviewStillNeeded
                ? 'requirement-interview-required'
                : 'prd-synthesis-required'
        )
      : 'clarification-confirmation-required';
    reason = clarificationConfirmed
      ? (
          clarificationStillNeedsWriteback
            ? '用户已经确认当前需求摘要或默认方案，但 current.json 里还没有把这轮确认内容按 canonical 字段稳定写回。不要重新回到泛化 clarify，也不要继续写 agent-inferred / project-derived 事实；请直接用 openprd capture 按 canonical 字段路径并以 user-confirmed 写回这轮已确认内容。'
            : classificationStillNeeded
              ? '用户已经确认当前需求摘要，但当前 lane 还没有锁定产品场景。先完成 openprd classify .，让产品场景和后续写回事实一致，再继续 synthesize。'
              : interviewStillNeeded
                ? '用户已经确认当前需求摘要，但当前 lane 仍缺少必填 requirement 事实。先继续用 openprd capture 按 canonical 字段补齐当前范围、目标、约束和交接信息；如还缺问题，再用 openprd interview . 收敛剩余缺口，然后继续 synthesize。'
            : (
                reviewPolicyAllowsSilentRecord(approvalPolicy)
                  ? '用户已明确表示不需要再停下来确认，本轮可以直接整理需求事实、生成这版确认稿，并继续后面的整理步骤。'
                  : '当前需求摘要已经确认，下一步把已确认内容整理成可确认的需求稿。'
              )
        )
      : '当前还缺需求摘要确认。先在对话里按“需求判断 / 需求理解 / 功能范围 / 技术方案”整理结构化摘要，其中“功能范围”和“技术方案”优先用 Markdown 表格；`需求判断` 和 `需求理解` 先用 1 到 2 句轻量主句说清这次是什么、核心问题和第一版目标，再把边界、风险和技术细项下沉到后续分项或表格。若当前还在判断值不值得做，还要主动补上验证与创业闭环：第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、如果必须开始做产品也只自动化最重复的一步并先压成 forms / lists / CRUD 骨架、第一版只做哪一件事、能不能压成周末级 MVP、第一批客户路径、从第一个客户开始怎么收费、客户 1 如何打平成本、有没有 10 个样本和更强付费信号、达到什么条件才允许产品化、增长阶段守什么纪律、这条路是否可逆、是否真在解决客户问题，以及是否符合团队价值观、是不是你愿意长期住进去的业务形态。用户没确认前，不要直接把核心需求写成既定事实。';
  } else if (review.status === 'needs-revision') {
    nextStep = 'prd-review-required';
    reason = '当前这版需求确认稿已经被标记为需要调整，先改完再继续后面的整理或实现。';
  } else if (review.status !== 'confirmed') {
    nextStep = reviewPolicyAllowsSilentRecord(approvalPolicy)
      ? 'review-recording-required'
      : 'prd-review-required';
    reason = reviewPolicyAllowsSilentRecord(approvalPolicy)
      ? '这版需求确认稿已经生成。由于用户已经明确表示不需要再停下来确认，本轮可以直接记录这次确认结果，再继续整理本次调整和后续任务。'
      : '这版需求确认稿还没有得到用户认可，不能把“请帮我实现/继续实现”当成已经确认这版内容。';
  } else if (!activeChange) {
    nextStep = 'change-generation-required';
    reason = '这版需求已经确认，下一步先整理本次调整范围。';
  } else if (!hasTaskBreakdown) {
    nextStep = 'task-breakdown-required';
    reason = '本次调整范围已经立起来了，但还没拆成可直接执行的后续任务。';
  }
  if (review.staleReview?.versionId) {
    reason += ` 另外检测到工作区里残留了一份属于其他会话的历史确认稿（${review.staleReview.versionId}），本轮已自动忽略它；不要尝试确认或复用那份旧稿，直接按当前需求生成新的确认稿。`;
  }
  return {
    runContext: parsed,
    binding,
    review,
    activeChange,
    taskSummary,
    recommendation: parsed.recommendation ?? null,
    hasTaskBreakdown,
    approvalPolicy,
    nextStep,
    reason,
  };
}

function reviewActionAuthorizationFor(intent, progress, prompt) {
  const review = progress?.review ?? null;
  const requested = intent?.reviewCommand ?? null;
  const mark = requested?.mark ?? intent?.reviewDecision ?? null;
  if (!mark || !review?.versionId || !review?.digest || !review?.workUnitId) {
    return null;
  }
  if (requested && !reviewCommandMatchesReview(requested, review)) {
    return null;
  }
  return {
    mark,
    versionId: review.versionId,
    digest: review.digest,
    workUnitId: review.workUnitId,
    continueAfterReview: Boolean(
      intent?.reviewContinuationRequested
        || intent?.implementationConfirmation
        || intent?.explicitExecution
    ),
    promptPreview: preview(prompt, 500),
    grantedAt: now(),
    source: 'explicit-user-review-decision',
  };
}

function silentReviewActionAuthorizationFor(gate, progress, prompt) {
  const policy = requirementApprovalPolicy(gate);
  const review = progress?.review ?? null;
  if (!reviewPolicyAllowsSilentRecord(policy) || !review?.versionId || !review?.digest || !review?.workUnitId) {
    return null;
  }
  if (review.status === 'needs-revision') {
    return null;
  }
  return {
    mark: 'confirmed',
    versionId: review.versionId,
    digest: review.digest,
    workUnitId: review.workUnitId,
    promptPreview: preview(prompt || gate?.promptPreview || '', 500),
    grantedAt: now(),
    source: 'silent-record-policy',
  };
}

function holdRequirementGate(root, prompt, progress, sessionId = null, extra = {}) {
  const reviewActionAuthorization = extra.reviewActionAuthorization ?? null;
  const patch = {
    status: extra.status ?? progress.nextStep,
    confirmationPreview: preview(prompt, 500),
    reviewActionAuthorization,
  };
  if (extra.clarificationConfirmedAt) {
    patch.clarificationConfirmedAt = extra.clarificationConfirmedAt;
    patch.clarificationConfirmationPreview = extra.clarificationConfirmationPreview ?? preview(prompt, 500);
  }
  return updateRequirementGate(root, patch, sessionId);
}

function isImplementationAdvanceIntent(intent) {
  return Boolean(intent?.explicitExecution || intent?.implementationConfirmation);
}

function gateHasConfirmedCurrentReview(gate, progress) {
  const authorization = gate?.reviewActionAuthorization;
  const review = progress?.review;
  if (review?.status !== 'confirmed') {
    return false;
  }
  if (authorization) {
    return Boolean(
      authorization.versionId === review.versionId
        && authorization.digest === review.digest
        && authorization.workUnitId === review.workUnitId
    );
  }
  return reviewPolicyAllowsSilentRecord(requirementApprovalPolicy(gate))
    && Boolean(review.versionId && review.digest && review.workUnitId);
}

function canAutoAuthorizeRequirementExecution(gate, progress) {
  return Boolean(
    isBlockingRequirementGate(gate)
      && (
        gate?.intent?.explicitExecution
        || gate?.reviewActionAuthorization?.continueAfterReview
      )
      && progress?.nextStep === 'implementation-ready'
      && gateHasConfirmedCurrentReview(gate, progress)
  );
}

function isAuthorizedReviewMarkCommand(payload, gate) {
  const authorization = gate?.reviewActionAuthorization;
  const command = parseReviewMarkCommand(commandText(payload));
  if (!authorization || !command) {
    return false;
  }
  return authorization.mark === command.mark
    && authorization.versionId === command.versionId
    && authorization.digest === command.digest
    && authorization.workUnitId === command.workUnitId;
}

function isSilentRecordReviewMarkCommand(payload, gate, progress) {
  const authorization = silentReviewActionAuthorizationFor(gate, progress, gate?.promptPreview || '');
  const command = parseReviewMarkCommand(commandText(payload));
  if (!authorization || !command) {
    return false;
  }
  return authorization.mark === command.mark
    && authorization.versionId === command.versionId
    && authorization.digest === command.digest
    && authorization.workUnitId === command.workUnitId;
}

function isReadOnlyRequirementGate(gate) {
  return Boolean(gate?.active && gate?.intent?.readOnly && !gate?.intent?.explicitExecution);
}

function isBlockingRequirementGate(gate) {
  return Boolean(gate?.active && !isReadOnlyRequirementGate(gate));
}

function isRequirementGateActive(root, sessionId = null) {
  return isBlockingRequirementGate(readRequirementGate(root, sessionId));
}

function isMutationPayload(payload, risk) {
  const text = payloadText(payload);
  const tool = String(payload.tool_name || payload.toolName || payload.name || '');
  return risk.level === 'medium'
    || risk.level === 'high'
    || /apply_patch/i.test(tool)
    || /apply_patch/i.test(text)
    || /\*\*\* Begin Patch/.test(text);
}

function isRuntimeAutonomyRiskFile(file) {
  const normalized = String(file || '').split(path.sep).join('/');
  if (!normalized) {
    return true;
  }
  if (/^(docs|test|tests|__tests__|fixtures|examples|templates?)\//i.test(normalized)) {
    return false;
  }
  if (/(^|\/)(AGENTS|CLAUDE|README|CHANGELOG|SKILL)\.md$/i.test(normalized)) {
    return false;
  }
  if (/\.(?:md|mdx|txt|rst)$/i.test(normalized)) {
    return false;
  }
  return true;
}

function hasExplicitAutonomyRiskApproval(intent = null) {
  const text = String(intent?.promptText || '');
  if (!text.trim()) {
    return false;
  }
  const riskTerms = /(云端|线上|生产环境|远端|热修复|hotfix|兜底|临时兜底|fallback|fall\s*back|写死|硬编码|hardcode|hard-coded|hard coded)/i;
  if (!riskTerms.test(text)) {
    return false;
  }
  const negatedRisk = /(不要|禁止|不允许|不得|不能|避免|默认不|未明确|未经|除非).{0,48}(云端|线上|生产环境|远端|热修复|hotfix|兜底|临时兜底|fallback|fall\s*back|写死|硬编码|hardcode|hard-coded|hard coded)|(云端|线上|生产环境|远端|热修复|hotfix|兜底|临时兜底|fallback|fall\s*back|写死|硬编码|hardcode|hard-coded|hard coded).{0,48}(不要|禁止|不允许|不得|不能|避免|默认不|未明确|未经|除非)/i;
  if (negatedRisk.test(text)) {
    return false;
  }
  return /(明确)?(允许|批准|同意|确认|可以|请|直接|必须|这次|现在).{0,40}(云端|线上|生产环境|远端|热修复|hotfix|兜底|临时兜底|fallback|fall\s*back|写死|硬编码|hardcode|hard-coded|hard coded)|(云端|线上|生产环境|远端|热修复|hotfix|兜底|临时兜底|fallback|fall\s*back|写死|硬编码|hardcode|hard-coded|hard coded).{0,40}(允许|批准|同意|确认|可以|直接|必须|这次|现在)/i.test(text);
}

function detectHighRiskAutonomyMutation(root, payload, intent, risk) {
  if (!isMutationPayload(payload, risk)) {
    return null;
  }
  const command = commandText(payload);
  const text = [
    toolName(payload),
    command,
    payloadText(payload),
  ].filter(Boolean).join('\n');
  const touched = extractTouchedFiles(root, payload);
  const runtimeTarget = touched.length === 0 || touched.some((file) => isRuntimeAutonomyRiskFile(file));
  const cloudMutation = /(?:\b(?:ssh|scp|rsync)\b[^\n]*(?:prod|production|线上|生产|云端|server|remote)|\b(?:kubectl|helm)\b[^\n]*(?:apply|patch|set|delete|rollout|scale|exec)[^\n]*(?:prod|production|线上|生产|云端|cluster)|\b(?:vercel|wrangler|fly|flyctl|railway|firebase)\b[^\n]*(?:deploy|up)[^\n]*(?:--prod|prod|production|线上|生产)|\bsupabase\s+db\s+push\b[^\n]*(?:--linked|--db-url|prod|production|线上|生产)|\bcurl\b[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b[^\n]*(?:prod|production|线上|生产|云端|api\.))/i.test(text);
  if (cloudMutation) {
    return {
      kind: 'cloud-hotfix',
      title: '云端/生产远端写入',
      details: preview(command || text, 260),
    };
  }
  if (!runtimeTarget) {
    return null;
  }
  // 只保留真实业务权益/计费类词汇；配置、服务端、客户端、缓存、feature 这类
  // 基础设施通用词在正常代码里大量出现，叠加“fallback/兜底”会造成海量误拦。
  const businessTerms = /(业务|权益|会员|额度|价格|计费|订阅|套餐|entitlement|membership|billing|quota|price|paywall|subscription|localstorage)/i;
  const fallbackTerms = /(兜底|fallback|fall\s*back|临时补|临时插入|补行|补进|本地补|客户端补|服务端补|缓存补|默认插入|补一条|补数据)/i;
  const hardcodeTerms = /(写死|硬编码|hardcode|hard-coded|hard coded)/i;
  const fixedBusinessValue = /(unlimited|premium|pro|vip|admin|owner|free|trial|quota|limit|count_limit|free_limit|权益|会员).{0,80}(?:=|:).{0,80}(?:unlimited|premium|pro|vip|admin|owner|free|true|false|999999|Infinity)/i;
  if ((businessTerms.test(text) && (fallbackTerms.test(text) || hardcodeTerms.test(text))) || fixedBusinessValue.test(text)) {
    return {
      kind: 'hardcoded-fallback',
      title: '业务兜底/写死逻辑',
      details: preview(touched.length > 0 ? `${touched.join(', ')}\n${command || text}` : command || text, 260),
    };
  }
  return null;
}

function formatHighRiskAutonomyBlock(detection) {
  return [
    `OpenPrd blocked a high-risk autonomy action: ${detection.title}.`,
    '当前用户消息只授权了本轮实现范围，不等于授权 Agent 私自做云端热修复、生产远端写入、业务兜底、写死逻辑或缓存补行。',
    detection.details ? `Matched action: ${detection.details}` : null,
    '默认路径：先改本地源码、配置、迁移或数据修复脚本，让本地与云端保持同一事实源；完成后再按正常发布/部署路径验证。',
    '如果这次确实必须临时处理，请先让用户明确说“允许这次云端热修复”或“允许这次临时兜底/写死”，并说明影响范围、回滚方式和如何同步回本地源码/配置/迁移。',
  ].filter(Boolean).join('\n');
}

const LIGHTWEIGHT_UI_VISUAL_SIGNAL_PATTERN = /(按钮|文案|颜色|圆角|位置|间距|留白|边距|内边距|外边距|宽度|高度|卡片|字号|字体|行高|图标|标题|空格|标点|对齐|密度|阴影|边框|层级|组件|输入框|菜单|侧栏|表格|列表|头像|badge|label|copy|toast|placeholder|padding|margin|spacing|gap|太宽|太窄|太挤|拥挤|松散|留得多|留着有点多|没对齐|好看|美观|审美|气质|记忆点|高级|太丑|丑|视觉风格|上架图|截图优化)/i;

function hasLightweightUiVisualSignal(text = '') {
  return LIGHTWEIGHT_UI_VISUAL_SIGNAL_PATTERN.test(String(text || ''));
}

function isFrontendTaskIntent(intent = null) {
  const text = String(intent?.promptText || '').trim();
  if (!text || intent?.visualMockupRequest) {
    return false;
  }
  return /(界面|页面|前端|首页|落地页|原型|导览|展览|馆藏|网站|web\s*page|landing|dashboard|hero|layout|静态单页|静态页|样式|视觉|app\s*首页|官网)/i.test(text);
}

function promptHasExplicitVisualReference(intent = null) {
  const text = String(intent?.promptText || '');
  return /(参考图|效果图|设计稿|按这个做|照着这个做|复刻|跟这个|reference|mockup|figma)/i.test(text);
}

function shouldRequireFactsSheet(intent = null) {
  const text = String(intent?.promptText || '');
  return /(开放时间|营业时间|票价|价格|英镑|美元|会员|版本|发布|规格|排名|数据|hours?|price|ticket|version|release|spec)/i.test(text);
}

function shouldRequireImagePreflight(intent = null) {
  const text = String(intent?.promptText || '');
  return /(馆藏|展览|导览|展品|museum|gallery|travel|旅行|内容|专题|story|editorial|摄影|图片|photo|地图|route|路线规划)/i.test(text);
}

function shouldRequireAssetSpec(intent = null) {
  return isFrontendTaskIntent(intent);
}

function designActiveFilePath(root, filename) {
  return path.join(root, '.openprd', 'design', 'active', filename);
}

function designArtifactHasPlaceholder(root, filename) {
  const text = readTextSync(designActiveFilePath(root, filename), 12000);
  return !text || /待填写/.test(text);
}

function looksLikeFrontendImplementationFile(relativePath) {
  const file = String(relativePath || '');
  if (!file || file.startsWith('.openprd/')) {
    return false;
  }
  if (/^(miniprogram|wechat|weapp)\//i.test(file)) {
    return false;
  }
  if (/(^|\/)(index|home|landing)\.(html|jsx|tsx|vue|svelte|astro)$/i.test(file)) {
    return true;
  }
  if (/\.(html|css|scss|sass|less|jsx|tsx|vue|svelte|astro)$/i.test(file)) {
    return true;
  }
  if (!/\.(js|ts)$/i.test(file)) {
    return false;
  }
  return /(^|\/)(app|pages?|components?|ui|layouts?|views?|screens?|routes?|frontend|web)\//i.test(file);
}

function frontendImplementationTargets(root, payload) {
  return extractTouchedFiles(root, payload).filter((file) => looksLikeFrontendImplementationFile(file));
}

function frontendDesignPreflightIssues(root, intent, implementationFiles) {
  if (!isFrontendTaskIntent(intent) || implementationFiles.length === 0) {
    return [];
  }
  const issues = [];
  if (shouldRequireFactsSheet(intent) && designArtifactHasPlaceholder(root, 'facts-sheet.md')) {
    issues.push({
      file: 'facts-sheet.md',
      reason: '这次页面要写明确事实，先把已知事实和来源或用户给定值写进去。',
    });
  }
  if (shouldRequireAssetSpec(intent) && designArtifactHasPlaceholder(root, 'asset-spec.md')) {
    issues.push({
      file: 'asset-spec.md',
      reason: '进入实现前先冻结资产口径；没有官方资产也要写“缺失 / 暂无 / 不适用”，不要留模板占位。新功能出现新入口、按钮、tab、卡片或空态时，同步补“功能图标”行：先复用项目已有图标体系，缺失时按最佳实践路由（Phosphor / Lucide / Tabler / React Icons / LobeHub / Tech Icons / iconfont）选型并登记图标名、来源、用途，不等用户要求。',
    });
  }
  if (shouldRequireImagePreflight(intent) && designArtifactHasPlaceholder(root, 'image-preflight.md')) {
    issues.push({
      file: 'image-preflight.md',
      reason: '这是内容型页面，先判断真实图片是不是成立前提，以及缺失时怎么降级。',
    });
  }
  if (!promptHasExplicitVisualReference(intent) && designArtifactHasPlaceholder(root, 'direction-plan.md')) {
    issues.push({
      file: 'direction-plan.md',
      reason: '当前没有明确参考方向，先把 3 个异源方向写实，而不是直接落回同一种安全解。',
    });
  }
  if (!promptHasExplicitVisualReference(intent) && designArtifactHasPlaceholder(root, 'selected-direction.md')) {
    issues.push({
      file: 'selected-direction.md',
      reason: '进入实现前先锁定选中的 lens、theme、layout 和组件。',
    });
  }
  return issues;
}

function captureSourceFromCommand(command) {
  return readCliFlagValue(command, '--source');
}

function captureFieldFromCommand(command) {
  return readCliFlagValue(command, '--field');
}

function isNonSemanticCaptureCommand(command) {
  return /openprd\s+capture\b/i.test(command)
    && captureSourceFromCommand(command) === 'agent-normalized';
}

function isDerivedClarificationCaptureCommand(command) {
  if (!/openprd\s+capture\b/i.test(command)) {
    return false;
  }
  const source = captureSourceFromCommand(command);
  return source === 'agent-inferred' || source === 'project-derived';
}

function isMetaStatusCaptureCommand(command) {
  return /openprd\s+capture\b/i.test(command) && captureFieldFromCommand(command) === 'meta.status';
}

function gateHasClarificationConfirmation(gate) {
  return Boolean(gate?.clarificationConfirmedAt || gate?.status === 'clarification-confirmed');
}

function requirementWritePathExplicitlyAuthorized(gate) {
  return gateHasClarificationConfirmation(gate)
    || reviewPolicyAllowsSilentRecord(requirementApprovalPolicy(gate));
}

function isRequirementWritePathMutation(command) {
  return /openprd\s+(capture|classify|synthesize|diagram)\b/i.test(command);
}

function isAllowedDuringRequirementGate(root, payload, gate, sessionId = null) {
  const text = payloadText(payload);
  const command = commandText(payload);
  const progress = evaluateRequirementGateProgress(root, sessionId);
  const alwaysAllowed = [
    /openprd\s+status\b/i,
    /openprd\s+next\b/i,
    /openprd\s+run\s+\.\s+--context\b/i,
    /openprd\s+run\s+\.\s+--verify\b/i,
    /openprd\s+clarify\b/i,
    /openprd\s+interview\b/i,
    /openprd\s+standards\s+.*--verify/i,
    /openprd\s+quality\s+.*--verify/i,
    /openprd\s+doctor\b/i,
  ];
  if (alwaysAllowed.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (/openprd\s+capture\b/i.test(command)) {
    if (isNonSemanticCaptureCommand(command)) {
      return true;
    }
    if (!requirementWritePathExplicitlyAuthorized(gate)) {
      return false;
    }
    if (progress.nextStep === 'clarification-writeback-required') {
      if (isMetaStatusCaptureCommand(command)) {
        return false;
      }
      if (isDerivedClarificationCaptureCommand(command)) {
        return false;
      }
    }
    return true;
  }
  if (/openprd\s+synthesize\b/i.test(command)) {
    return requirementWritePathExplicitlyAuthorized(gate)
      && !['clarification-writeback-required', 'product-type-classification-required', 'requirement-interview-required'].includes(progress.nextStep);
  }
  if (/openprd\s+(classify|diagram)\b/i.test(command)) {
    return requirementWritePathExplicitlyAuthorized(gate);
  }
  if (/openprd\s+review-presentation\b/i.test(command)) {
    return /--template\b/i.test(command) || Boolean(progress.review.versionId);
  }
  if (/openprd\s+review\b/i.test(command)) {
    if (!/--mark\b/i.test(command)) {
      return true;
    }
    return isAuthorizedReviewMarkCommand(payload, gate)
      || isSilentRecordReviewMarkCommand(payload, gate, progress);
  }
  if (/openprd\s+change\s+.*--generate/i.test(command)) {
    return progress.review.status === 'confirmed';
  }
  if (/openprd\s+change\s+.*--validate/i.test(command)) {
    return true;
  }
  if (/openprd\s+tasks\b/i.test(command) || /openprd\s+loop\s+.*--plan/i.test(command)) {
    return progress.review.status === 'confirmed' && Boolean(progress.activeChange);
  }
  return false;
}

function toolProbe(payload) {
  return `${toolName(payload)}\n${payloadText(payload)}\n${commandText(payload)}`.toLowerCase();
}

function looksLikeLocalEvidenceRead(payload) {
  const probe = toolProbe(payload);
  return /\b(rg|grep|cat|sed|head|tail|less|more|wc|ls|find|git show|read_file|open_file|view_file)\b/.test(probe)
    || /openprd\s+(status|next|doctor|run\s+\.\s+--context|run\s+\.\s+--verify)/.test(probe);
}

function applyResearchToolSignal(root, payload, sessionId = null) {
  const current = readNamedGate(root, 'research', sessionId);
  if (!current?.active) {
    return current;
  }
  const probe = toolProbe(payload);
  const externalEvidence = { ...(current.externalEvidence || {}) };
  if (looksLikeLocalEvidenceRead(payload)) {
    current.localEvidenceSeen = true;
  }
  if (/read[_-]?wiki[_-]?structure|readwikistructure/.test(probe)) {
    externalEvidence.readWikiStructure = true;
  }
  if (/ask[_-]?question|askquestion/.test(probe)) {
    externalEvidence.askQuestion = true;
  }
  if (/resolve[_-]?library[_-]?id|resolvelibraryid/.test(probe)) {
    externalEvidence.resolveLibraryId = true;
  }
  if (/query[_-]?docs|querydocs/.test(probe)) {
    externalEvidence.queryDocs = true;
  }
  const satisfied = current.kind === 'deepwiki'
    ? externalEvidence.readWikiStructure && externalEvidence.askQuestion
    : externalEvidence.resolveLibraryId && externalEvidence.queryDocs;
  if (satisfied) {
    return closeResearchGate(root, sessionId, {
      status: 'evidence-collected',
      externalEvidence,
      localEvidenceSeen: current.localEvidenceSeen,
      satisfiedAt: now(),
    });
  }
  return updateNamedGate(root, 'research', {
    externalEvidence,
    localEvidenceSeen: current.localEvidenceSeen,
  }, sessionId);
}

function looksLikeSkillContractMutation(root, payload) {
  const files = extractTouchedFiles(root, payload);
  if (files.some((file) => /(^|\/)(AGENTS\.md|SKILL\.md)$/i.test(file) || /(^|\/)skills\/.+/i.test(file))) {
    return true;
  }
  const probe = toolProbe(payload);
  return /AGENTS\.md|SKILL\.md|\/skills\//i.test(probe);
}

function isRawVaultReadAttempt(payload) {
  const probe = toolProbe(payload);
  const readLike = /\b(cat|sed|head|tail|less|more|rg|grep|read_file|open_file)\b/.test(probe);
  return readLike && /\bvault\b/.test(probe);
}

function applyWeappToolSignal(root, payload, sessionId = null) {
  const current = readNamedGate(root, 'weapp', sessionId);
  if (!current?.active) {
    return current;
  }
  const probe = toolProbe(payload);
  const validationSignals = { ...(current.validationSignals || {}) };
  if (/mp[_-]?ensureconnection|ensureconnection/.test(probe)) {
    validationSignals.ensureConnection = true;
  }
  if (/mp[_-]|weapp|miniprogram|page_|element_|mp_screenshot|network\b|evaluate\b/.test(probe)) {
    validationSignals.runtimeAction = true;
  }
  const satisfied = validationSignals.ensureConnection && validationSignals.runtimeAction;
  if (satisfied) {
    return closeWeappGate(root, sessionId, {
      status: 'validated-through-weapp-runtime-evidence',
      validationSignals,
      validatedAt: now(),
    });
  }
  return updateNamedGate(root, 'weapp', { validationSignals }, sessionId);
}

function isHighRiskBrowserAction(payload) {
  const probe = toolProbe(payload);
  const browserTool = /(computer|browser|chrome|playwright)/.test(probe);
  const dangerousAction = /(submit|send|delete|remove|logout|sign out|switch account|pay|purchase|close tab|close window|关闭标签页|关闭窗口|退出登录|切换账号|支付|删除|发送|提交)/.test(probe);
  return browserTool && dangerousAction;
}

function researchGateMessage(gate) {
  if (!gate?.active) {
    return null;
  }
  if (gate.kind === 'deepwiki') {
    return [
      'OpenPrd 外部仓库调研门禁: active。',
      '当前请求涉及公开 GitHub 仓库的架构、模块、流程或对标判断；在修改实现或把结论表述为已确认之前，先读本地证据，再使用 DeepWiki。',
      '最小动作: `read_wiki_structure` 一次，再用 `ask_question` 聚焦 1-2 个关键问题；证据够用后立即停止扩展。',
      gate.externalEvidence?.readWikiStructure ? '已记录: read_wiki_structure。' : '缺少: read_wiki_structure。',
      gate.externalEvidence?.askQuestion ? '已记录: ask_question。' : '缺少: ask_question。',
    ].join('\n');
  }
  return [
    'OpenPrd 外部技术调研门禁: active。',
    '当前请求涉及项目外技术事实、第三方库、框架、API、SDK、MCP 或 CLI 用法；在修改实现或输出配置/代码结论前，先检查本地代码、锁文件、README、类型定义是否足够，不足时再使用 Context7。',
    '最小动作: `resolve_library_id` 一次，再 `query_docs` 1-2 次；若覆盖不足，明确缺口后再补官方文档或源码。',
    gate.externalEvidence?.resolveLibraryId ? '已记录: resolve_library_id。' : '缺少: resolve_library_id。',
    gate.externalEvidence?.queryDocs ? '已记录: query_docs。' : '缺少: query_docs。',
  ].join('\n');
}

function skillVisualizationGateMessage(gate) {
  if (!gate?.active) {
    return null;
  }
  return [
    'OpenPrd skill/AGENTS 可视化确认门禁: active。',
    '当前请求涉及 skill、SKILL.md、AGENTS.md 或相关 workflow 规则变更。编辑前必须先读取现状，输出彩色 Mermaid 方案图，再用简短文字说明新增、修改、保持不变和删除/阻断项。',
    'Mermaid 必须包含 `unchanged`、`added`、`changed`、`removed` 四种 classDef，并等待用户明确确认后才能修改相关文件。',
  ].join('\n');
}

function credentialMessage(intent) {
  if (!intent?.secretsRequest) {
    return null;
  }
  return [
    'OpenPrd 敏感信息规则:',
    '如果任务需要 API key、token、账号信息、第三方服务凭证或个人信息，先使用 `secrets-vault` skill 获取已有凭证，不要立即向用户索要。',
    '不要直接读取原始 vault 文件，也不要在日志、代码或回复里暴露完整密钥。',
  ].join('\n');
}

function weappGateMessage(gate) {
  if (!gate?.active) {
    return null;
  }
  return [
    'OpenPrd 微信小程序验证门禁: active。',
    '只有当用户明确要求小程序实测、复现、截图、抓日志/网络、从 0 到 1 走流程，或当前改动高风险到必须依赖运行态证据时，才升级到本地小程序运行态验证。',
    '一旦进入小程序运行态验证，默认沿用当前小程序运行态或开发者工具会话连续验证，不要为了验证自动重开应用；只有用户明确要求从 0 到 1、冷启动、重开或重新打开时，才从头启动。',
    '优先使用当前环境已配置的小程序本地验证能力；如果当前客户端没有相应工具，不要假定已经安装，也不要把缺少工具本身当成任务失败。',
    '未拿到本地运行态证据前，不要宣称“小程序已验证”。',
  ].join('\n');
}

function browserSafetyMessage(intent) {
  if (!intent?.browserSafetyRequest) {
    return null;
  }
  return [
    'OpenPrd 浏览器安全提醒:',
    '用户明确要求 Computer Use 时，优先使用 Computer Use，并尽量在 Codex-owned browser window 中操作。',
    '执行点击、输入、提交、关闭、切换账号、退出登录、支付等高风险动作前，先确认窗口归属，检查当前窗口标题、目标页面和可见内容仍属于本任务。',
  ].join('\n');
}

function productCopyMessage(intent) {
  if (!intent?.productCopyRequest) {
    return null;
  }
  return [
    'OpenPrd 产品内文案提醒:',
    '先检查项目是否已有 i18n、locales、translations、Localizable 或其他语言资源；若已有，多语言要同步维护。',
    '产品界面上用户能看到的文案必须站在当前用户视角写：说明用户现在能做什么、会发生什么、为什么值得点、下一步怎么走。',
    '除非这是面向开发者或专业技术人员的技术型产品，否则默认用普通人能看懂的语言写结果、状态、限制和行动，不要把 API、SDK、模型、数据库、缓存、错误码或其他实现细节直接暴露给用户。',
    '快速正反例：不要写“适合想保留全部工具入口的用户”，改成“首页会显示所有工具入口，你可以直接选择需要的功能”；不要写“API 请求失败，错误码 500”，改成“暂时保存失败，请稍后再试”。技术型产品可以保留必要术语，但仍要写清用户动作、影响和修复路径。',
  ].join('\n');
}

function composeHookContext(root, intent = null, gate = null, progress = null, sessionId = null) {
  return [
    contextMessage(root, intent, gate, progress),
    researchGateMessage(readNamedGate(root, 'research', sessionId)),
    skillVisualizationGateMessage(readNamedGate(root, 'skill-visualization', sessionId)),
    credentialMessage(intent),
    weappGateMessage(readNamedGate(root, 'weapp', sessionId)),
    browserSafetyMessage(intent),
    productCopyMessage(intent),
    largeUiVisualDirectionMessage(intent),
  ].filter(Boolean).join('\n');
}

function runOpenPrd(args, cwd) {
  const configuredCommand = String(process.env.OPENPRD_CLI || 'openprd').trim() || 'openprd';
  const jsEntry = /\.(?:c|m)?js$/i.test(configuredCommand);
  let command = configuredCommand;
  let commandArgs = args;
  if (jsEntry) {
    const candidates = [];
    const addCollapsedPackageCandidate = (candidatePath) => {
      if (!candidatePath) {
        return;
      }
      const normalized = path.resolve(candidatePath);
      const binDir = path.dirname(normalized);
      const packageDir = path.dirname(binDir);
      const packageName = path.basename(packageDir);
      if (path.basename(binDir) === 'bin' && packageName === 'openprd') {
        candidates.push(path.join(path.dirname(packageDir), 'bin', 'openprd.js'));
      }
    };
    if (path.isAbsolute(configuredCommand)) {
      candidates.push(configuredCommand);
      addCollapsedPackageCandidate(configuredCommand);
    } else {
      candidates.push(path.resolve(cwd, configuredCommand));
      candidates.push(path.resolve(configuredCommand));
      addCollapsedPackageCandidate(path.resolve(cwd, configuredCommand));
      addCollapsedPackageCandidate(path.resolve(configuredCommand));
    }
    candidates.push(path.join(cwd, 'bin', 'openprd.js'));
    const resolvedEntry = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    command = process.execPath;
    commandArgs = [resolvedEntry || configuredCommand, ...args];
  }
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function parseJsonOutput(text) {
  const source = String(text || '').trim();
  if (!source) {
    return null;
  }
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function compactSingleLine(text, limit = 240) {
  const singleLine = String(text || '').replace(/\s+/g, ' ').trim();
  if (!singleLine) {
    return '';
  }
  if (singleLine.length <= limit) {
    return singleLine;
  }
  return `${singleLine.slice(0, Math.max(0, limit - 1))}…`;
}

function devCheckWrapUpMessage(root, turnState) {
  const files = Array.isArray(turnState?.touchedFiles)
    ? [...new Set(turnState.touchedFiles)].filter(Boolean)
    : [];
  if (files.length === 0) {
    return null;
  }
  const result = runOpenPrd(['dev-check', '.', ...files, '--json'], root);
  if (!result.ok && !result.stdout) {
    return [
      'OpenPrd 收工回顾：本轮有 touched code files，但 dev-check 未能完成。',
      '最终回复里请说明无法生成大文件审查表，并列出失败原因。',
      result.stderr ? `错误: ${result.stderr}` : null,
    ].filter(Boolean).join('\n');
  }
  const parsed = parseJsonOutput(result.stdout);
  if (!parsed?.wrapUp?.required || !parsed.wrapUp.markdownTable) {
    return null;
  }
  const autoMode = parsed.wrapUp.mode === 'auto-refactor';
  return [
    autoMode
      ? 'OpenPRD 自动优化报告：本轮有超行改动对象，自动优化默认开启。'
      : 'OpenPrd 后续建议：本轮有改动对象需要主动说明。',
    autoMode
      ? '先在本轮按 dev-check 给出的动作完成高内聚低耦合拆分（不丢任何功能、行为不变，拆完重跑测试与 dev-check），把每行“本次处理结果”回填为真实优化产出；最终回复必须以 **OpenPRD 自动优化报告** 为标题直接复用下面的 Markdown 表格，按 🔴 → 🟠 → 🟡 排序，并附一句：“如果下次不需要自动优化代码结构，回复关闭自动优化即可”。用户确认关闭后运行 `openprd dev-check . --auto-refactor off`。'
      : '最终回复必须以 **后续建议** 为标题直接复用下面的 Markdown 表格，按 🔴 → 🟠 → 🟡 的顺序帮助产品或业务理解影响对象、本次处理结果和后续建议；不要只用工具名或一段话带过。',
    autoMode
      ? '如果你改写了“源文件规模 / 优化原因 / 本次处理结果 / 后续建议”，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试。'
      : '如果你改写了“规模信号 / 预警原因 / 本次处理结果 / 后续建议”，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试。',
    autoMode
      ? '不要把“问题级别”列改写成纯 emoji；必须保留例如“🟠 中风险｜建议优先关注”这类完整标签。'
      : '不要把“关注程度”列改写成纯 emoji；必须保留例如“🟠 中风险｜建议优先关注”这类完整标签。',
    parsed.wrapUp.markdownBlock ?? parsed.wrapUp.markdownTable,
    parsed.visualEvidence?.required
      ? `视觉证据提醒：${parsed.visualEvidence.reason} 建议命令：${(parsed.visualEvidence.suggestedCommands ?? []).join('；')}。${parsed.visualEvidence.chatEmbedHint ?? ''}`
      : null,
  ].filter(Boolean).join('\n');
}

function shouldRunDoctorForHighRisk(payload) {
  const text = commandText(payload) || payloadText(payload);
  return /(git\s+(commit|push)\b|npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish|gh\s+release|openprd\s+(freeze|handoff|setup|update|fleet|doctor)\b|openprd\s+change\s+.*--(apply|archive)\b|release|publish)/i.test(text);
}

function summarizeRunVerifyCheck(parsed, fallbackText = '') {
  if (!parsed) {
    return fallbackText || 'run verify result unavailable';
  }
  const readiness = parsed.readiness ?? {};
  const failedTaskChecks = Array.isArray(parsed.checks)
    ? parsed.checks.filter((check) => check.scope !== 'workspace' && !check.ok).map((check) => check.name)
    : [];
  const workspaceWarnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  if (readiness.taskReady === false) {
    return `run-verify: taskReady=no${failedTaskChecks.length ? ` (${failedTaskChecks.join(', ')})` : ''}`;
  }
  if (readiness.workspaceReady === false) {
    const workspaceDetail = parsed.workspaceAttention?.summary ?? workspaceWarnings[0] ?? null;
    return `run-verify: taskReady=yes, workspaceReady=no${workspaceDetail ? ` (${workspaceDetail})` : ''}`;
  }
  return 'run-verify: taskReady=yes, workspaceReady=yes';
}

function summarizeDoctorCheck(parsed, fallbackText = '') {
  if (!parsed?.agentIntegration && !parsed?.standards && !parsed?.validation) {
    const compact = compactSingleLine(fallbackText);
    return compact || 'doctor result unavailable';
  }
  const parts = [];
  if (parsed.agentIntegration) {
    parts.push(`agentIntegration=${parsed.agentIntegration.ok ? 'ok' : 'failed'}`);
  }
  if (parsed.standards) {
    parts.push(`standards=${parsed.standards.ok ? 'ok' : 'failed'}`);
  }
  if (parsed.validation) {
    parts.push(`validation=${parsed.validation.valid ? 'ok' : 'failed'}`);
  }
  return `doctor: ${parts.join(', ')}`;
}

function buildGateFailureEnvelope(result) {
  const runCheck = result.checks.find((check) => check.name === 'run-verify') ?? null;
  const doctorCheck = result.checks.find((check) => check.name === 'doctor' && check.ok === false && check.agentIntegrationOk === false) ?? null;
  const changeCheck = result.checks.find((check) => check.name === 'change-validate' && check.ok === false) ?? null;
  if (doctorCheck) {
    return {
      kind: 'integration-drift',
      details: [doctorCheck.summary, ...(doctorCheck.details ?? [])].filter(Boolean),
      repair: 'Repair path: run openprd doctor . to inspect drift, then use openprd update . or the targeted repair command before retrying this high-risk action.',
    };
  }
  if (runCheck?.taskReady === false || changeCheck) {
    return {
      kind: 'task-failure',
      details: [
        runCheck?.summary,
        ...(runCheck?.errors ?? []),
        ...(changeCheck?.details ?? []),
      ].filter(Boolean),
      repair: 'Repair path: fix the task-scoped failure, rerun the relevant verification command, then retry this high-risk action.',
    };
  }
  if (runCheck?.workspaceReady === false) {
    return {
      kind: 'workspace-debt',
      details: [
        runCheck.summary,
        runCheck.workspaceAttention?.detail ?? null,
        ...(runCheck.warnings ?? []),
      ].filter(Boolean),
      repair: 'Repair path: resolve the workspace-level debt from openprd run . --verify or openprd quality . --verify, then retry this high-risk action.',
    };
  }
  return {
    kind: 'task-failure',
    details: result.checks.filter((check) => !check.ok).flatMap((check) => [check.summary, ...(check.details ?? [])]).filter(Boolean),
    repair: 'Repair path: rerun the relevant verification command, fix the failing check, then retry.',
  };
}

function formatHighRiskGateBlock(result) {
  const envelope = result.envelope ?? buildGateFailureEnvelope(result);
  const headline = envelope.kind === 'workspace-debt'
    ? 'OpenPrd blocked a high-risk action because the current task is done but the workspace is not fully ready.'
    : envelope.kind === 'integration-drift'
      ? 'OpenPrd blocked a high-risk action because the integration health gate failed.'
      : 'OpenPrd blocked a high-risk action because the current task is not ready.';
  return [
    headline,
    result.summary,
    ...envelope.details,
    envelope.repair,
  ].filter(Boolean).join('\n');
}

function classifyToolFailure(text) {
  const normalized = String(text || '').toLowerCase();
  if (/doctor|hook|hook-profile|hooks\.json|config\.toml|command-catalog|openprd-router|skill|integration|drift/.test(normalized)) {
    return 'integration-drift';
  }
  if (/production-ready|needs-attention|smoke evidence|feature coverage|workspace ready|workspace debt|quality/.test(normalized)) {
    return 'workspace-debt';
  }
  return 'task-failure';
}

function toolFailureMessage(kind) {
  if (kind === 'integration-drift') {
    return 'A tool command failed in a way that looks like integration drift. Use openprd doctor . first; if drift is confirmed, repair it with openprd update . or the targeted fix before continuing.';
  }
  if (kind === 'workspace-debt') {
    return 'A tool command failed against workspace-level readiness. Re-run openprd run . --verify or openprd quality . --verify, separate current-task status from historical workspace debt, and only then choose the repair path.';
  }
  return 'A tool command failed against the current task. Use openprd next . and the relevant verification command to identify the smallest task-scoped repair path.';
}

function recordRunHook(cwd, baseEvent, outcome) {
  const args = [
    'run',
    '.',
    '--record-hook',
    '--event',
    baseEvent.eventName,
    '--risk',
    baseEvent.risk.level,
    '--outcome',
    outcome,
  ];
  if (baseEvent.preview) {
    args.push('--preview', baseEvent.preview.slice(0, 300));
  }
  runOpenPrd(args, cwd);
}

function requirementGateMessage(intent, gate) {
  const gateBlocksImplementation = isBlockingRequirementGate(gate);
  const approvalPolicy = requirementApprovalPolicy(gate);
  if (!intent?.requiresIntake && !gateBlocksImplementation) {
    return null;
  }
  if (intent?.visualMockupRequest) {
    return [
      'OpenPrd requirement intake gate is active only for implementation writes.',
      'The user is asking for an image asset such as a cover image, poster, illustration, icon, sticker, visual mockup, or effect image, not code implementation.',
      'For logo, icon, avatar, badge, and similar development assets, default to a standalone asset: full-frame single subject with no extra UI frame, card shell, device mockup, or presentation container unless the user explicitly asked for one.',
      'If the final development asset should be transparent for UI use, use an icon-asset pipeline: generate three visibly different standalone candidates first, each on a solid #00ff00 chroma-key background with no text, no UI container, centered subject, and enough padding; do not write project files before the user chooses one. After selection, verify the selected source or contact sheet, keep the green-screen source, run remove_chroma_key.py to produce a transparent PNG/WebP, crop and center it, export 384px or required sizes, tune the display ratio per real UI placement, and record the source, transparent output, integration point, and verification in asset-spec.md / selected-direction.md before claiming completion.',
      'Do not create temporary HTML/SVG/CSS files for this image unless the user explicitly requested that format.',
      'Image tool routing: on a Codex surface use native `imagegen` (Image 2); on a Cursor surface use the built-in `GenerateImage` tool; both are free inside the conversation tool. If neither surface applies, read the confirmed preference in `.openprd/harness/image-generation-preference.json`; when no preference exists, ask the user which image-generation path to use and persist the answer to that file as the future default. NEVER silently call the user\'s own paid image API. The image tool is the tool path, not an aesthetic exemption, so first state the purpose, audience, intended tone, constraints, and memory point, then put them into the image prompt.',
      'Before generation, do a quick anti-slop check: without brand or reference support, avoid default purple/blue-purple gradients, generic font taste, white card piles, and context-free decoration.',
    ].join('\n');
  }
  const status = gateBlocksImplementation ? 'active' : 'opened';
  return [
    'OpenPrd requirement intake gate: ' + status + '.',
    'This prompt looks like a likely 新功能/新流程方案 (L2), so the heavy requirement-intake lane is active. Do not decide from fixed keywords; first use $openprd-requirement-intake to classify the user-visible requirement type by impact, unknowns, decision cost, and validation cost.',
    'Keep this mapping visible for internal review: 直接处理=L0, 现有功能优化=L1, 新功能/新流程方案=L2.',
    'L0 and L1 stay on lightweight paths and should not be forced through formal PRD/review/change/tasks unless the scope expands.',
    'If the requirement type is 新功能/新流程方案 (L2), do not edit implementation files yet and proceed through PRD/review/change/tasks with the appropriate PRD scene lens: 通用场景、面向个人消费者场景、面向企业服务场景，或以 Agent 为主要使用场景。 Keep raw enum values such as base / consumer / b2b / agent for internal commands or records only; do not surface them to the user unless truly necessary.',
    reviewPolicyAllowsSilentRecord(approvalPolicy)
      ? 'Decision-point policy: because the user explicitly said there is no need for any confirmation stop, you may skip the requirement-summary confirmation stop, write back the requirement facts, synthesize the PRD, record the exact current stable review artifact, generate the OpenPrd change, prepare the task breakdown, then implement within the confirmed scope.'
      : 'Decision-point policy: first output a short structured requirement summary in chat with 需求判断 / 需求理解 / 功能范围 / 技术方案, where 功能范围 and 技术方案 should prefer Markdown tables; if this is still a 0-to-1 or worth-doing discussion, also surface the validation/startup loop with 第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、什么承诺才算真需求、有没有 10 个样本和更强付费信号、最低成本先验证什么、达到什么条件才允许产品化、增长阶段守什么纪律、以及验证阶段怎样先活下来; wait for the user to confirm that summary, then write back confirmed facts, synthesize the PRD, wait for a human decision on the stable review artifact, generate the OpenPrd change, prepare the task breakdown, then implement within the confirmed scope.',
    reviewPolicyAllowsSilentRecord(approvalPolicy)
      ? 'This lane is in silent-record mode only because the user explicitly said there is no need for any further review or confirmation stop. Plain "请帮我实现" is not enough; you may record only the exact current version, digest, and work unit.'
      : 'Requirement-summary confirmation, review-artifact confirmation, and implementation authorization are different gates: do not treat "可以开做", "继续实现", plain "请帮我实现", or "不需要评审" as permission to skip them.',
    'If the original request already asked to implement, execution can continue once the active approval policy and tasks are ready; otherwise wait for a clear execution request.',
    'Recommended next action: write a short 需求类型判断 in chat, and by default merge the route into the label as 需求类型：新功能/新流程方案（L2）; only add a separate 内部路由码 when internal debugging truly benefits. Then run openprd clarify ., summarize the requirement in chat using 需求判断 / 需求理解 / 功能范围 / 技术方案, prefer Markdown tables for 功能范围 and 技术方案, and if the ask still looks like 0-to-1 validation also add 第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、什么承诺才算真需求、有没有 10 个样本和更强付费信号、最低成本先验证什么、达到什么条件才允许产品化、增长阶段守什么纪律、以及验证阶段怎样先活下来; ask for confirmation, and only after that write back confirmed facts. Do not open a clarification HTML page; the formal HTML review happens after synthesize/review.',
  ].join('\n');
}

function lightweightRequirementMessage(intent) {
  if (intent?.requirementTier === 'l0') {
    return [
      'OpenPrd 轻量需求路径: 当前更接近直接处理 (L0)。',
      '先在 chat 用短格式写出“需求类型 / 理由 / 推荐下一步”，并默认写成“需求类型：直接处理（L0）”；只有内部排障确实需要时，才额外单列“内部路由码”。',
      '对用户先用一句轻量主句说清这次是什么和为什么先这样处理；边界和技术细项放到后一句，不要揉成一大段解释。',
      '直接处理并事后说明即可，不打开正式 PRD/review/change/tasks。',
      '优先做最小足够验证，并用 1-2 句说明本轮特别需要强化的测试点；默认不要求正式测试报告。',
      '如果过程中暴露出跨系统依赖、支付/账号/权限/回调等高风险因素，再升级到 L2 重流程。',
    ].join('\n');
  }
  if (intent?.requirementTier === 'l1') {
    return [
      'OpenPrd 轻量需求路径: 当前更接近现有功能优化 (L1)。',
      '先在 chat 用短格式写出“需求类型 / 理由 / 推荐下一步”，并默认写成“需求类型：现有功能优化（L1）”，再给 3-5 行 mini-plan；只有内部排障确实需要时，才额外单列“内部路由码”。',
      '主句先轻一点：先说这次调整是什么、要解决什么，再把范围边界和技术细项留给 mini-plan，不要一上来写成长段。',
      '先在对话里给 3-5 行 mini-plan，至少写清目标、范围内、范围外和验证方式。',
      '默认不要打开正式 PRD/review/change/tasks；只有在 mini-plan 暴露新决策缺口、跨系统风险或范围升级时，才提升到 L2 重流程。',
      '验证采用最小足够组合即可，重点说明需要强化测试的地方；默认不要求正式测试报告。',
    ].filter(Boolean).join('\n');
  }
  return null;
}

function imageGenerationPreferencePath(root) {
  return path.join(harnessDir(root), 'image-generation-preference.json');
}

function imageGenerationRoutingLines(root) {
  const preference = readJsonSync(imageGenerationPreferencePath(root), null);
  const lines = [
    '生图路由: 第一层先判断当前对话工具面——Codex 环境用原生 `imagegen`（Image 2），Cursor 环境用内置 `GenerateImage` 工具；两者都是对话工具内免费能力，优先默认使用。',
    '如果当前既不是 Codex 也不是 Cursor，或内置生图工具面证据不存在，先读 `.openprd/harness/image-generation-preference.json` 里用户已确认的生图偏好；没有已确认偏好时必须先询问用户要用哪种生图方式，并把用户答复以 `{"provider","source":"user-confirmed","updatedAt"}` 写回该文件，下次直接作为默认。',
    '成本护栏: 绝对不要在用户未明确指定的情况下擅自调用用户本地或自有付费生图 API（如用户自己的 OpenAI / Stability key），避免产生额外成本；只有偏好文件或当前消息明确授权时才可以使用。',
  ];
  if (preference?.provider) {
    lines.push(`当前已保存的用户生图偏好: ${preference.provider}（来源: ${preference.source || 'user-confirmed'}）。内置免费生图工具不可用时优先使用它，不要再重复询问。`);
  }
  return lines;
}

function visualMockupMessage(intent, root = null) {
  if (!intent?.visualMockupRequest) {
    return null;
  }
  return [
    '当前用户要的是图片内容生成，例如图片、封面图、配图、海报、插画、图标、贴纸、头像、banner、主视觉/KV、运营图、效果图、视觉稿或 mockup。',
    ...(root ? imageGenerationRoutingLines(root) : []),
    '按生图路由选定的内置生图工具生成图片（Codex=`imagegen`/Image 2，Cursor=`GenerateImage`）；生图工具是工具路径，不是审美豁免；生图前先写清用途、受众、气质、约束和记忆点，并把这些写进 prompt。',
    '生图前用 `.openprd/design/anti-slop.md` 做快速自检：没有品牌或参考图依据时，不要默认紫白/蓝紫渐变、通用字体、白底卡片堆叠或无语境装饰。',
    '除非用户明确指定 HTML、SVG、CSS、Canvas、代码稿或可编辑矢量/source artifact，不要改用临时 HTML/SVG/CSS 再截图。',
    '对 logo、icon、avatar、badge 等开发素材，如果用户没有明确要求 mockup、场景图、设备框、卡片承载、名片/包装展示或参考界面复刻，默认按独立素材输出（standalone asset）处理：使用全画布单主体，不额外添加 UI frame、卡片、设备壳、名片、桌面陈列、手持实拍或其他展示容器；如果最终要接入 UI 并需要透明背景，先生成 3 个差异足够大的纯 `#00ff00` 绿幕候选方向，用户选定前不写项目文件，选定后再保留源图、抠透明、裁切居中、导出 384px 或多尺寸资产，按真实 UI 场景调显示比例，并把源图、透明产物、接入位置和验证结果写回 `asset-spec.md` / `selected-direction.md`。',
    '只有当用户明确要求 mockup、场景化效果图、容器化呈现，或参考图本身就包含这些承载结构时，才生成对应的容器或场景。',
    '只有在实际发生生图工具调用后，才能汇报生图结果、失败或限流；未调用前，不要声称“生图限流”或“生图失败”。',
    '把生图结果先当成候选效果图，不要默认登记到 `.openprd/harness/visual-reviews/`，也不要自动当成后续验收参考；看图时不仅判断是否生成成功，还要判断气质、层级、字体/色彩/表面角色和记忆点是否成立。',
    '如果用户看完图后还要继续做实现，主动连问三件事：是否符合预期、是否纳入后续效果图/实现截图对比、是否按此继续后续实现。只有用户确认纳入对比或继续实现后，才把这张图、这组图或其中选定子图整理成后续 reference-set；如果用户只是认可图片但暂不实现，就继续把它当候选效果图。',
    '如果一张图里有多个子图、网格、多对象或多个方向，不要把整板直接当成单一参考图；先运行 `openprd visual-prepare . --reference <效果图> --grid <列>x<行>` 或 `--boxes <plan.json>` 生成 reference-set、contact sheet 和 compare-plan，确认 contact sheet 后再逐项对比或统一验收。',
    'OpenPrd review.html 只用于需求评审，visual-compare 只用于实现阶段视觉证据：已有参考图时做效果图/实现截图对比；没有参考图时先判断新建界面还是修改既有界面，新建界面回到实现前 3 方向方案评审，修改既有界面做修改前/修改后自检；局部细节优先补局部焦点证据板，并行优化方向优先补并行实验证据板；同构列表、卡片、网格或表格需要补对齐辅助线证据板，并同时检查容器轨道和内部内容槽位轨道；单个 logo、icon、avatar、badge、按钮图形或图片内部需要居中判定、视觉重心评估或偏心排查时，需要补内部居中证据板，并同时检查画布中心、主体外接框中心和视觉重心偏移。',
  ].join('\n');
}

function canvasCollaborationMessage(intent) {
  if (!intent?.canvasCollaborationRequest) {
    return null;
  }
  return [
    '当前请求涉及 OpenPrd 画布协同（生图上画布、人在画布上标注、标注结果回到对话继续改）。',
    '打开或复用画布：运行 `openprd canvas .`；无法自动识别当前对话时用 `--thread <id> --thread-title <name>` 或 `--session <id> --session-title <name>` 显式绑定，画布必须绑定当前对话。',
    '结构化读画布：需要知道用户正在圈哪些元素时，优先 `GET /api/selection` 读取选中元素的 ID、类型、坐标、尺寸和文本，不要只靠截图猜；需要全量场景再读 `GET /api/scene`。',
    '结构化写画布：把生成的新图放上画布时，优先 `POST /api/insert-image`，用 `anchorElementId` + `placement`（right/left/below/above）把新图放到指定元素旁边，不要覆盖原图；回填 AI 生图占位卡时继续用 `POST /api/images` 带 `placeholderId`。',
    '标注改图闭环：如果交接记录（handoff）的 `selection` 是 `annotation-edit`，或带有 `sourceImageElementIds` / `annotationElementIds`，说明用户在原图上画了标注要求改图。把截图里的标注当修改指令，生成修改后的新图，再用 `POST /api/insert-image` 以原图为 anchor 放到旁边，方便用户对比原图和新版。',
    '生图尺寸契约：handoff 或占位卡带 `sizeContract`（width/height/aspectRatio）时，生成图片必须按这个宽高比出图，避免回填时变形拉伸。',
    '每轮改图后主动确认：新图是否符合标注意图、是否继续下一轮标注迭代；用户可以继续在新图上标注，形成多轮改图闭环。',
  ].join('\n');
}

function learningGenreFlag(intent = null) {
  return intent?.learningGenre ? ` --genre ${intent.learningGenre}` : '';
}

function learningReviewCommand(intent = null) {
  return `openprd learn . --topic "<学习主题>"${learningGenreFlag(intent)} --open`;
}

function learningReviewMessage(intent = null) {
  const command = learningReviewCommand(intent);
  const lines = [
    '如果当前交付目标是把一次工作转成可学习、可复用、可回看、可教学或可沉淀的材料，不要先按关键词判断，也不要只停留在普通说明文档。',
    '先判断期望产物形态：是否需要章节结构、证据锚点、图文讲解、检索练习、工作示例或阅读体验。需要这些形态时，优先使用 `openprd learn .` 生成学习包骨架、阅读器和证据清单，再补充正文内容；普通 Markdown 只能作为辅助讲义。',
  ];
  if (intent?.learningMaterialRequest) {
    lines.unshift('当前输入已被识别为学习型交付物请求：这是按产物形态和长期阅读/教学目的判断，不是固定关键词表。');
    lines.push(`建议先运行 \`${command}\`。如果用户指定了仙侠、科幻、童话等风格，把它当作学习包题材/文体参数，而不是绕过阅读器流程的理由。`);
    lines.push('生成骨架后，读取 `.openprd/learning/archive/<packageId>/agent-prompt.md`，由 Agent 基于证据写入 `learning-content.json`，再运行 `openprd learn . --content-json <file> --open` 渲染最终 reader；不要把聊天里的普通 Markdown 成稿当完成。');
  }
  return lines.join('\n');
}

function largeUiVisualDirectionMessage() {
  return [
    'OpenPrd 大界面改动视觉方案评审:',
    '位置: 需求分流之后、PRD 定稿或实现开工之前；它不同于 review.html，也不同于实现后的 visual-compare。',
    '判断: 先从用户目标、信息架构变化、视觉决策成本和验收风险判断是否需要方向评审，不用关键词触发。会决定首屏、核心布局、主视觉、关键路径、组件层级/密度，或用户需要先选设计方向时触发。',
    '步骤: 已有界面时用 Codex Computer Use 进入产品内对应功能并截当前真实界面；冷启动没有现有界面时，基于已确认 PRD、用户画像、第一版切片和视觉目标写设计 brief。brief 必须写清用途、受众、气质端点、约束和记忆点，3 个方向要分别说明审美主张和主动避开的模板味。然后按生图路由调用内置生图工具（Codex=`imagegen`/Image 2，Cursor=`GenerateImage`；都不可用时按 `.openprd/harness/image-generation-preference.json` 的用户已确认偏好，没有偏好先问用户）生成至少 3 个不同设计思想方向；把效果图横向拼成一张带 1/2/3 序号的大图，先作为候选效果图给用户评审，不要默认写入 `.openprd/harness/visual-reviews/` 当验收参考。',
    '交互: 主动追问三件事：是否符合预期、是否纳入后续效果图/实现截图对比、是否按此继续后续实现。只有用户确认纳入后续对比或继续实现后，才把选定方向、整张图或其中子图整理成 reference-set 并写入 `.openprd/harness/visual-reviews/`；用户确认前，不进入大 UI 实现，也不要声称界面方案已定。',
    '多对象参考处理: 如果候选效果图是一张图里包含多个子图、网格、多对象或多方向，不要拿整板直接硬比；先运行 `openprd visual-prepare . --reference <效果图> --grid <列>x<行>` 或 `--boxes <plan.json>`，检查 contact sheet，确认 reference-set 后再逐项进入实现和验收。',
  ].join('\n');
}

function visualLocalAdjustmentMessage() {
  return [
    '如果这轮验收重点在局部变化，不要只改代码后凭主观判断收尾。',
    '修改前先用一句话锁定本次审美意图和记忆点；收口的 visual-compare/focus-board 不只看位置，也要看气质、层级、色彩、字号、间距和表面角色是否被保住。',
    '先判断这是新建界面还是修改既有界面：新建界面走实现前 3 方向方案评审；修改既有界面先保留修改前截图。完成后从同一入口、视口、账号和数据状态截修改后截图，再运行 `openprd visual-compare . --before <修改前截图> --after <修改后截图> --locale <zh-CN|en>`。',
    '如果局部细节需要放到同一张证据板里审阅，再补一份 `openprd visual-compare . --board <focus-board.json> --locale <zh-CN|en>` 的局部焦点证据板，把局部变化组合到同一张证据板里统一验收；如果只是普通截图、Computer/Browser/Playwright 实测截图，也要用 `openprd visual-compare . --board <verification-board.json> --locale <zh-CN|en>` 拼成截图实测证据板；如果界面存在同构列表、卡片、网格或表格，或用户反馈元素没有对齐，要用 `openprd visual-compare . --board <alignment-board.json> --locale <zh-CN|en>` 拼成对齐辅助线证据板，且同一张板里同时覆盖容器轨道和标题/副标题/描述/标签/状态/价格/按钮/图标等内部内容槽位；如果单个素材/图标/头像/徽标/按钮图形/图片内部需要居中或视觉重心判定，要用 `openprd visual-compare . --board <centering-board.json> --locale <zh-CN|en>` 拼成内部居中证据板，且同一张板里同时覆盖红色画布中心、绿色主体外接框和黄色视觉重心点，不能把单张截图当最终视觉证据。',
    '如果参考图是一张整板、网格图或多对象组合图，先运行 `openprd visual-prepare . --reference <效果图> --grid <列>x<行>` 或 `--boxes <plan.json>`，确认 contact sheet 后，再决定是逐项 `--reference/--actual` 还是统一做 `focus-board` / `parallel-board`。',
    '当用户后续说“跟效果图”“不一致”“好丑”“复刻”“没对齐”“偏心”“不居中”这类反馈时，不能只口头说已经对比过了；至少先产出一份 `openprd visual-compare`、`focus-board`、`parallel-board`、`verification-board`、`alignment-board` 或 `centering-board` 证据图再下结论。'
  ].join('\n');
}

function codexConfirmationReplyRule() {
  return 'Codex 回复规则: 只有当前真的还缺人来拍板时，才在 final answer 里停下来请求确认。停下请求确认时执行“一次确认合同”：把本条需求后续本来会出现的全部确认点合并成一段话一次性说清，并告诉用户只要回一句“确认，继续执行”，剩余环节会自动连续推进；同一条需求不允许出现第二个人工确认停顿。绝对不要让用户粘贴 digest、work unit、版本号或任何 openprd 命令——这些值 hook 会自动绑定，需要时由你自己填进命令。只要用户已经明确说了“认可并继续”，或已经确认了 mini-plan、范围边界、正式产品边界，就直接沿着已确认路径继续，不要再写“如果你认可”“确认的话我就继续”这类二次索取确认的话。面向用户时，不要直接抛 lane、change、tasks、review artifact、work unit、digest、worker shard、write-scope、worktree、内部版本号、命令或文件路径这些内部词；统一改说“需求确认稿”“本次调整”“后续任务”“继续落地”“完成后检查”。如果后面真的还需要额外授权，再用人话把会做什么、不会做什么、完成后怎么检查说清楚。如果当前仍在 L2 的首轮澄清或需求摘要确认阶段，不要写成“你回我一句我就开始实现”；只能承诺“我先整理需求摘要给你确认，确认后再继续”。如果当前 lane 已进入 silent-record 策略，只能说明用户已经明确说了“不需要进行任何确认”；单纯的“请帮我实现/继续实现”不能把 lane 切到 silent-record。';
}

function confirmationGateMessage(gate) {
  if (!gate || gate.active) {
    return null;
  }
  const intro = gate.status === 'execution-authorized'
    ? 'OpenPrd requirement intake gate auto-authorized execution after review confirmation and task preparation because the original user request already asked to implement.'
    : 'OpenPrd requirement intake gate was explicitly confirmed by the user.';
  return [
    intro,
    'Implementation may proceed only within the confirmed scope, with docs/basic, file manuals, folder README docs, standards verification, and OpenPrd run verification kept up to date. For backend, script, agent, tooling, service, or data-processing changes, keep CLI and API surface review current in docs/basic/backend-structure.md.',
    'For UI or visual work with an existing reference image, first confirm the user has accepted that image as a later comparison reference; if one image contains multiple sub-images, grid cells, or objects, run openprd visual-prepare . --reference <effect-image> --grid <columns>x<rows> or --boxes <plan.json>, inspect the contact sheet, and use the generated reference-set / compare-plan before comparing. Then capture the implemented UI and run openprd visual-compare . --reference <effect-image> --actual <implementation-screenshot>; if local detail matters more than the whole screen, add openprd visual-compare . --board <focus-board.json> --locale <zh-CN|en> so the agent can review numbered zoom regions. When there is no reference image, capture the before screenshot first, implement, capture the after screenshot from the same entry, viewport, account, and data state, then run openprd visual-compare . --before <before-screenshot> --after <after-screenshot>; if the agent explored multiple optimization directions, add openprd visual-compare . --board <parallel-board.json> --locale <zh-CN|en>. If ordinary screenshots or Computer/Browser/Playwright checks are used as evidence, assemble them with the checked path and checkpoints through openprd visual-compare . --board <verification-board.json> --locale <zh-CN|en> before claiming visual completion. If the UI contains repeated homogeneous cards, lists, grids, or tables, or the user reports misalignment, capture the real screen, overlay guide lines, measure both container-track and internal content-slot x/y/size/baseline spread, and assemble an alignment-board through openprd visual-compare . --board <alignment-board.json> --locale <zh-CN|en>. If a single logo, icon, avatar, badge, button graphic, or image crop needs internal-centering or visual-centroid judgment, crop the target and assemble a centering-board through openprd visual-compare . --board <centering-board.json> --locale <zh-CN|en> before claiming it is centered.',
    'If the user later says the implementation does not match the effect image, looks wrong, or asks for replication, do not rely on subjective narration alone; produce at least one visual evidence artifact before claiming completion.',
  ].join('\n');
}

function currentRequirementStatusLine(gate, progress) {
  if (gate?.status === 'review-confirmation-authorized') {
    return gate?.reviewActionAuthorization?.continueAfterReview
      ? '用户刚刚已经确认这版需求，并且明确表示继续。先记录这次确认结果，然后直接接着整理本次调整和后续任务；只有后面真的还缺额外授权时，再用人话说明影响和下一步。'
      : '用户刚刚已经确认这版需求；本回合只允许记录这次确认结果，不能把它直接扩展成开工授权。';
  }
  if (gate?.status === 'review-recording-authorized') {
    return '这版需求确认稿已经按免再次确认的规则授权记录；只记录这一次确认结果，然后继续整理本次调整和后续任务。';
  }
  switch (progress?.nextStep) {
    case 'clarification-confirmation-required':
      return '当前卡点: 先让用户确认当前需求摘要；在此之前不要把核心需求写成既定事实，也不要直接往后推进。请求确认时按“一次确认合同”表达：明确告诉用户这是本条需求默认唯一的一次人工确认，只要回复“确认，继续执行”，后面的需求稿整理、调整范围、任务拆解和实现都会自动连续推进，不会再逐环节找他确认。';
    case 'clarification-writeback-required':
      return '当前卡点: 用户已经确认这轮需求摘要或默认方案，但 current.json 里还没有把确认后的事实稳定写回。先按 canonical 字段路径用 user-confirmed 回写，再继续 synthesize；不要再回退成泛化 clarify，也不要继续写 agent-inferred。';
    case 'product-type-classification-required':
      return '当前卡点: 用户已经确认这轮需求摘要，但产品场景还没锁定。先完成 classify 并让当前 lane 的产品场景与写回事实一致，再继续 synthesize。';
    case 'requirement-interview-required':
      return '当前卡点: 用户已经确认这轮需求摘要，但 current.json 里还缺这轮 requirement 的关键事实。先补齐 canonical 字段，必要时再用 openprd interview 收敛剩余问题，然后继续 synthesize。';
    case 'prd-synthesis-required':
      return reviewPolicyAllowsSilentRecord(requirementApprovalPolicy(gate))
        ? '当前卡点: 用户已明确表示不需要再停下来确认，可以直接整理已确认内容，并生成这版需求确认稿。'
        : '当前卡点: 当前需求摘要已确认，下一步把已确认内容整理成这版需求确认稿。';
    case 'prd-review-required':
      return progress?.review?.versionId
        ? '当前卡点: 先等用户确认这版需求确认稿；不要把“继续做”“开落地吧”或单纯的“请帮我实现/继续实现”当成已经认可这版内容。请求确认时只需要用户回一句自然语言，例如“确认这版，继续执行”；版本、digest、work unit 由 hook 自动绑定，绝对不要让用户粘贴 digest、work unit 或任何 openprd 命令。同时说明这一句确认之后整条链会自动执行到实现，不会再停。'
        : '当前卡点: 先整理出这版需求确认稿，再等待用户确认。';
    case 'review-recording-required':
      return '当前卡点: 这版需求确认稿已经生成，而且用户已明确表示不需要再停下来确认；可以先记录这次确认结果，再继续后面的整理。';
    case 'change-generation-required':
      return '当前卡点: 这版需求已经确认，下一步先整理本次调整范围；这是当前流程的直接延续，不需要再重复索取同一轮确认。';
    case 'task-breakdown-required':
      return '当前卡点: 本次调整范围已经立起来了，下一步把它拆成可直接执行的后续任务。';
    case 'implementation-ready':
      return '当前卡点: 这版需求和后续任务都准备好了。如果用户一开始就明确要继续做，就直接进入实现；否则再用人话说明这次会做什么、不会做什么、完成后怎么检查。若用户刚刚确认的是 L1 范围边界或 mini-plan，承接话术要写成“已确认，我按这个继续”，不要再写成像二次索取确认的句子。';
    default:
      return '当前卡点: 继续按“澄清需求 -> 确认需求 -> 整理本次调整 -> 拆分后续任务 -> 开始实现”的顺序推进。';
  }
}

function currentRequirementMessage(intent, gate, progress) {
  const prompt = stripMarkdown(gate?.promptPreview || '');
  const approvalPolicy = requirementApprovalPolicy(gate);
  const gateStatus = isImplementationAdvanceIntent(intent)
    ? 'OpenPrd requirement intake gate was explicitly confirmed by the user.'
    : 'OpenPrd requirement intake gate: active.';
  const lines = [
    'OpenPrd 当前需求入口',
    gateStatus,
    '对外表达要求: 面向用户不要直接复述 PRD、review artifact、change、tasks、lane、approval policy、work unit、digest、worker shard、write-scope、worktree、内部版本号、命令或文件路径；改说“需求确认稿”“本次调整”“后续任务”“继续落地”“完成后检查”。',
    '当前输入已被判定为可能的新功能/新流程方案（L2），因此进入重流程需求入口。不要按固定关键词判断；先用 $openprd-requirement-intake 按影响面、未知数、决策成本和验证成本判断用户可见需求类型。',
    '内部审查保留固定对照：直接处理=L0，现有功能优化=L1，新功能/新流程方案=L2。',
    '如果用户刚刚已经确认了现有功能优化（L1）的 mini-plan、范围边界或正式产品边界，下一句要明确写成“已确认，我按这个继续/收口/落地”；不要只写一个“确认”，更不要写成“确认，我们就按这个……”这种容易让用户误以为还要再表态的句子。',
    '如果需求类型是新功能/新流程方案（L2），本轮只围绕这个新需求推进 PRD/review/change/tasks，并选择通用场景 / 面向个人消费者场景 / 面向企业服务场景 / 以 Agent 为主要使用场景的 PRD 视角，不自动继续历史 active change。对用户复述时不要直接把 consumer / b2b / agent 当展示词；这些枚举值只用于内部记录和命令。',
    prompt ? '本轮需求: ' + prompt : '',
    gate?.intakeMode === 'deep-reflection'
      ? '需求入口: 先运行需求自省，再输出对话内澄清摘要或简短清单。'
      : '需求入口: 先做轻量项目映射，再确认影响点和验收方式。',
    reviewPolicyAllowsSilentRecord(approvalPolicy)
      ? '当前 approval policy: decision-points / silent-record。之所以进入 silent-record，是因为用户已经明确表示不需要进行任何确认；单纯的“请帮我实现/继续实现”或“不要评审”都不够，仍然只能记录版本、digest、work unit 精确匹配的 artifact。'
      : '当前 approval policy: decision-points / human-review。当前 lane 仍需要一次 requirement 摘要确认和一次稳定 review artifact 的明确人类决策；单纯的“请帮我实现/继续实现”不算这两次决策。',
    intent?.reviewContinuationRequested
      ? '这条消息同时表达了“确认当前稳定评审稿并继续当前 OpenPrd 下一步”的意图：先记录精确 review artifact，再继续当前 lane；如果 review 后 tasks 已就绪但还需要执行授权，立刻展示执行确认清单，不要停在“如果你要我继续”。'
      : '',
    currentRequirementStatusLine(gate, progress),
    reviewPolicyAllowsSilentRecord(approvalPolicy)
      ? 'Decision-point order: because the user explicitly waived any confirmation stop, you may skip requirement-summary confirmation, write back requirement facts, synthesize the PRD, record the exact stable review artifact, generate the OpenPrd change, prepare the task breakdown, then implement within the confirmed scope.'
      : 'Decision-point order: clarify the requirement, summarize it in chat using 需求判断 / 需求理解 / 功能范围 / 技术方案, prefer Markdown tables for 功能范围 and 技术方案, and if the ask still looks like 0-to-1 validation also surface 第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、什么承诺才算真需求、有没有 10 个样本和更强付费信号、最低成本先验证什么、达到什么条件才允许产品化、增长阶段守什么纪律、以及验证阶段怎样先活下来; wait for the user to confirm that requirement summary, write back only confirmed facts, synthesize the PRD, wait for a human review decision on the stable artifact, generate the OpenPrd change, prepare the task breakdown, then implement within the confirmed scope.',
    'Recommended next action: 先在 chat 输出“需求类型判断”，默认把路由码并进“需求类型：新功能/新流程方案（L2）”这类标签里；只有内部排障确实需要时，才额外写“内部路由码”。若为新功能/新流程方案（L2），再运行 openprd clarify .，并按“需求判断 / 需求理解 / 功能范围 / 技术方案”给出结构化摘要，其中“功能范围”和“技术方案”优先用 Markdown 表格；`需求判断` 和 `需求理解` 先用轻量主句说清这次是什么、核心问题和第一版目标，再把边界、风险、异常例子和技术细项下沉到后续分项或表格，不要把某条示例文案写成固定模板。如果这轮本质上还在判断值不值得做，还要主动补上：第一批最容易触达的社区或种子用户、当前替代方案、先怎么手工交付、什么承诺才算真需求、最低成本先验证什么，以及验证阶段怎样先活下来。请求确认后再写回 requirement 事实并继续 classify/synthesize，不要把这一步表述成“确认后直接开始实现”。Do not open clarification HTML; use review.html only after synthesize/review.',
  ];
  if (isImplementationAdvanceIntent(intent)) {
    lines.splice(2, 1, gate?.active
      ? '用户表达了继续实现的意图；但在 review 评审、change 和任务拆解走完之前，仍然阻断实现写入。'
      : '用户已确认当前需求可以进入执行范围；仍需保持实现范围与已确认的需求入口一致。');
  }
  lines.push(codexConfirmationReplyRule());
  return lines.filter(Boolean).join('\n');
}

function requirementRoutingSummary() {
  return '需求类型由 $openprd-requirement-intake 按影响面、未知数、决策成本和验证成本判断：直接处理(L0)可直接处理并事后说明，不打开正式 PRD/review/change/tasks；现有功能优化(L1)先给对话内 mini-plan，默认不生成正式 PRD/change/tasks；新功能/新流程方案(L2)才进入 requirement intake 与 PRD/review/change/tasks，并选择通用场景 / 面向个人消费者场景 / 面向企业服务场景 / 以 Agent 为主要使用场景的 PRD 视角。对用户复述时不要直接把 consumer / b2b / agent 当展示词；这些枚举值只用于内部记录和命令。单纯的“请帮我实现/继续实现”只表示有执行意图，不表示跳过 requirement 摘要确认或 review；只有用户明确表示不需要进行任何确认时，才允许静默走完整 requirement write path。';
}

function historicalRequirementReminder(root, runContext, intent, gate) {
  const activeChange = runContext?.activeChange;
  if (!activeChange || (!intent?.requiresIntake && !(intent?.confirmation && gate?.promptPreview))) {
    return null;
  }
  const summary = changeRequirementSummary(root, activeChange);
  const taskSummary = runContext.taskSummary;
  const status = taskSummary
    ? '当前状态: OpenPrd 仍显示 ' + taskSummary.completed + '/' + taskSummary.total + ' 项完成，' + taskSummary.pending + ' 项待处理，' + taskSummary.blocked + ' 项阻塞。它可能是真的未完成、已经开发完但忘记更新状态，或只是项目状态未收口。'
    : '当前状态: OpenPrd 仍把它标记为 active。它可能是真的未完成、已经开发完但忘记更新状态，或只是项目状态未收口。';
  const pending = summary.pendingTasks.length > 0
    ? '待判断的需求点: ' + summary.pendingTasks.join('；')
    : '';
  return [
    'OpenPrd 历史需求提醒',
    '检测到一个未收口的历史需求，但它和本轮新需求分开处理，本轮不会自动继续它。',
    '历史需求: ' + summary.title,
    summary.summary ? '需求说明: ' + summary.summary : '',
    status,
    pending,
    '可选处理: 继续当前新需求；查看这个历史需求还差什么；如果已完成则运行验证并收口；如果未完成再切回继续。',
  ].filter(Boolean).join('\n');
}

function knowledgeSkillReminder(runContext) {
  const lines = knowledgeSkillContextLines(runContext?.knowledgeSkills);
  return lines.length > 0 ? lines.join('\n') : null;
}

function contextMessage(cwd, intent = null, gate = null, progress = null) {
  const run = progress?.runContext
    ? { ok: true, parsed: progress.runContext, stdout: renderRunContextText(progress.runContext) }
    : runOpenPrdContext(cwd, intent?.promptText ?? null);
  const effectiveProgress = progress ?? evaluateRequirementGateProgress(cwd);
  const gateMessage = requirementGateMessage(intent, gate) || confirmationGateMessage(gate);
  if (run.ok) {
    const separateCurrentRequirement = Boolean(intent?.requiresIntake || ((intent?.confirmation || intent?.reviewDecision) && gate?.promptPreview));
    if (separateCurrentRequirement) {
      return [
        currentRequirementMessage(intent, gate, effectiveProgress),
        historicalRequirementReminder(cwd, run.parsed, intent, gate),
        knowledgeSkillReminder(run.parsed),
        'OpenPrd 上下文只是建议，不是自动执行指令。请先判断用户当前意图。',
        lightweightRequirementMessage(intent),
        visualMockupMessage(intent, cwd),
        canvasCollaborationMessage(intent),
        learningReviewMessage(intent),
        largeUiVisualDirectionMessage(),
        visualLocalAdjustmentMessage(),
        requirementRoutingSummary(),
        '如果用户只是要求看看、规划、分析、审查、解释影响或列出文件，请保持只读并基于证据回答；不要运行 OpenPrd loop、任务推进、discovery 推进、commit 或其他写入命令。',
        '只有当用户当前明确要求开发、实现、修复、继续任务、深度调研、对标复刻或提交时，才运行 openprd loop --run、openprd tasks --advance、openprd discovery --advance、commit/push 等执行命令。',
        '代码修改完成后、最终回复前，针对本轮实际 touched code files 运行 openprd dev-check . <file...>；若出现需要关注的文件：自动优化开启（默认）时，先在本轮完成高内聚低耦合拆分（不丢功能、行为不变、拆完重跑测试），最终回复以 **OpenPRD 自动优化报告** 为标题直接复用 dev-check 生成的 Markdown 表格（列：影响对象、问题级别、源文件规模、优化原因、本次处理结果、后续建议），并附自动优化开关确认一句话；自动优化关闭时，以 **后续建议** 为标题复用表格（列：影响对象、关注程度、规模信号、预警原因、本次处理结果、后续建议）。两种模式都按 🔴 → 🟠 → 🟡 排序；不要把“问题级别／关注程度”列改写成纯 emoji，必须保留例如“🟠 中风险｜建议优先关注”这类完整标签；如果你改写了表格文案，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试。',
        '大界面改动的效果图先当候选效果图；出图后主动确认是否符合预期、是否纳入后续效果图/实现截图对比、是否按此继续实现。只有确认后，才把选定方向、整张图或其中子图整理到 `.openprd/harness/visual-reviews/` 并进入大 UI 实现。',
        '涉及界面、页面、视觉、样式或前端体验时，已有确认参考图才运行 openprd visual-compare . --reference <效果图> --actual <实现截图> --locale <zh-CN|en>；如果一张参考图里有多个子图/对象/网格，先运行 openprd visual-prepare . --reference <效果图> --grid <列>x<行> 或 --boxes <plan.json>，确认 contact sheet 后再逐项对比。没有明确参考图时先判断新建还是修改：新建界面走实现前 3 方向方案评审；修改既有界面则动手前先截修改前截图，完成后运行 openprd visual-compare . --before <修改前截图> --after <修改后截图> --locale <zh-CN|en>；如果并行试了多个优化方向，再补一份 openprd visual-compare . --board <parallel-board.json> --locale <zh-CN|en>。普通截图、Computer/Browser/Playwright 实测截图只能作为原始素材，收口前要补 openprd visual-compare . --board <verification-board.json> --locale <zh-CN|en> 的截图实测证据板。新开发或修改同构列表、卡片、网格、表格时，或用户反馈没对齐/排版漂移时，还要补 openprd visual-compare . --board <alignment-board.json> --locale <zh-CN|en> 的对齐辅助线证据板，同时量测容器轨道和标题/副标题/描述/标签/状态/价格/按钮/图标等内部内容槽位的 x/y/宽高/baseline spread。单个素材/图标/头像/徽标/按钮图形/图片内部居中、偏心或视觉重心判断时，还要补 openprd visual-compare . --board <centering-board.json> --locale <zh-CN|en> 的内部居中证据板，同时量测画布中心、主体外接框中心和视觉重心偏移。用户后续如果说“跟效果图”“不一致”“好丑”“复刻”，不能只口头说对比过了，至少产出一份 visual-compare / focus-board / parallel-board / verification-board / alignment-board / centering-board 证据图。',
        '发现可沉淀项时不要中途打断任务：代码扩展识别这类白名单工具补全会自动应用并记录；用户偏好、项目协作规矩和 OpenPrd 默认行为先记录为候选，收工时运行 openprd grow . --review 集中确认。',
        '维护 OpenPrd 本身且涉及配置类能力时，先判断是否应纳入 openprd grow；高置信可成长默认纳入，不确定则主动询问用户。',
        '涉及后端、脚本、Agent、工具链、服务或数据处理变更时，把 CLI 与 API 视为同级接入面：同步检查命令入口、参数、输出契约、help/doctor/dry-run/status 与接口协议、返回结构、身份边界是否受影响，并更新 docs/basic/backend-structure.md 或明确写不适用原因。',
        '声明实现就绪前，先运行 openprd standards . --verify、openprd quality . --verify 和 openprd run . --verify；L2 或跨页面实现的最终回复要列出最新 HTML 质量报告和 task-scoped Markdown/HTML 测试报告路径。',
      ].filter(Boolean).join('\n');
    }
    return [
      run.stdout,
      gateMessage,
      knowledgeSkillReminder(run.parsed),
      'OpenPrd 上下文只是建议，不是自动执行指令。请先判断用户当前意图。',
      lightweightRequirementMessage(intent),
      visualMockupMessage(intent, cwd),
      canvasCollaborationMessage(intent),
      learningReviewMessage(intent),
      largeUiVisualDirectionMessage(),
      visualLocalAdjustmentMessage(),
      requirementRoutingSummary(),
      '如果用户只是要求看看、规划、分析、审查、解释影响或列出文件，请保持只读并基于证据回答；不要运行 OpenPrd loop、任务推进、discovery 推进、commit 或其他写入命令。',
      '只有当用户当前明确要求开发、实现、修复、继续任务、深度调研、对标复刻或提交时，才运行 openprd loop --run、openprd tasks --advance、openprd discovery --advance、commit/push 等执行命令。',
      '代码修改完成后、最终回复前，针对本轮实际 touched code files 运行 openprd dev-check . <file...>；若出现需要关注的文件：自动优化开启（默认）时，先在本轮完成高内聚低耦合拆分（不丢功能、行为不变、拆完重跑测试），最终回复以 **OpenPRD 自动优化报告** 为标题直接复用 dev-check 生成的 Markdown 表格（列：影响对象、问题级别、源文件规模、优化原因、本次处理结果、后续建议），并附自动优化开关确认一句话；自动优化关闭时，以 **后续建议** 为标题复用表格（列：影响对象、关注程度、规模信号、预警原因、本次处理结果、后续建议）。两种模式都按 🔴 → 🟠 → 🟡 排序；不要把“问题级别／关注程度”列改写成纯 emoji，必须保留例如“🟠 中风险｜建议优先关注”这类完整标签；如果你改写了表格文案，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试。',
      '大界面改动的效果图先当候选效果图；出图后主动确认是否符合预期、是否纳入后续效果图/实现截图对比、是否按此继续实现。只有确认后，才把选定方向、整张图或其中子图整理到 `.openprd/harness/visual-reviews/` 并进入大 UI 实现。',
      '涉及界面、页面、视觉、样式或前端体验时，已有确认参考图才运行 openprd visual-compare . --reference <效果图> --actual <实现截图> --locale <zh-CN|en>；如果一张参考图里有多个子图/对象/网格，先运行 openprd visual-prepare . --reference <效果图> --grid <列>x<行> 或 --boxes <plan.json>，确认 contact sheet 后再逐项对比。没有明确参考图时先判断新建还是修改：新建界面走实现前 3 方向方案评审；修改既有界面则动手前先截修改前截图，完成后运行 openprd visual-compare . --before <修改前截图> --after <修改后截图> --locale <zh-CN|en>；如果并行试了多个优化方向，再补一份 openprd visual-compare . --board <parallel-board.json> --locale <zh-CN|en>。普通截图、Computer/Browser/Playwright 实测截图只能作为原始素材，收口前要补 openprd visual-compare . --board <verification-board.json> --locale <zh-CN|en> 的截图实测证据板。新开发或修改同构列表、卡片、网格、表格时，或用户反馈没对齐/排版漂移时，还要补 openprd visual-compare . --board <alignment-board.json> --locale <zh-CN|en> 的对齐辅助线证据板，同时量测容器轨道和标题/副标题/描述/标签/状态/价格/按钮/图标等内部内容槽位的 x/y/宽高/baseline spread。单个素材/图标/头像/徽标/按钮图形/图片内部居中、偏心或视觉重心判断时，还要补 openprd visual-compare . --board <centering-board.json> --locale <zh-CN|en> 的内部居中证据板，同时量测画布中心、主体外接框中心和视觉重心偏移。用户后续如果说“跟效果图”“不一致”“好丑”“复刻”，不能只口头说对比过了，至少产出一份 visual-compare / focus-board / parallel-board / verification-board / alignment-board / centering-board 证据图。',
      '发现可沉淀项时不要中途打断任务：代码扩展识别这类白名单工具补全会自动应用并记录；用户偏好、项目协作规矩和 OpenPrd 默认行为先记录为候选，收工时运行 openprd grow . --review 集中确认。',
      '维护 OpenPrd 本身且涉及配置类能力时，先判断是否应纳入 openprd grow；高置信可成长默认纳入，不确定则主动询问用户。',
      '涉及后端、脚本、Agent、工具链、服务或数据处理变更时，把 CLI 与 API 视为同级接入面：同步检查命令入口、参数、输出契约、help/doctor/dry-run/status 与接口协议、返回结构、身份边界是否受影响，并更新 docs/basic/backend-structure.md 或明确写不适用原因。',
      '声明实现就绪前，先运行 openprd standards . --verify、openprd quality . --verify 和 openprd run . --verify；L2 或跨页面实现的最终回复要列出最新 HTML 质量报告和 task-scoped Markdown/HTML 测试报告路径。',
    ].filter(Boolean).join('\n');
  }
  const status = runOpenPrd(['status', '.'], cwd);
  const next = runOpenPrd(['next', '.'], cwd);
  if (!status.ok && !next.ok) {
    return '已安装 OpenPrd harness，但本轮无法读取工作区状态。声明就绪前请先运行 openprd doctor .。';
  }
  return [
    'OpenPrd harness 上下文:',
    status.ok ? status.stdout : '',
    next.ok ? next.stdout : '',
    gateMessage,
    lightweightRequirementMessage(intent),
    visualMockupMessage(intent, cwd),
    canvasCollaborationMessage(intent),
    learningReviewMessage(intent),
    largeUiVisualDirectionMessage(intent),
    requirementRoutingSummary(),
    'OpenPrd 下一步只是建议。规划、分析、审查类请求保持只读；只有用户当前明确要求开发、深度调研、对标复刻或继续任务时才执行。',
    '代码修改完成后、最终回复前，针对本轮实际 touched code files 运行 openprd dev-check . <file...>；若出现需要关注的文件：自动优化开启（默认）时，先在本轮完成高内聚低耦合拆分（不丢功能、行为不变、拆完重跑测试），最终回复以 **OpenPRD 自动优化报告** 为标题直接复用 dev-check 生成的 Markdown 表格（列：影响对象、问题级别、源文件规模、优化原因、本次处理结果、后续建议），并附自动优化开关确认一句话；自动优化关闭时，以 **后续建议** 为标题复用表格（列：影响对象、关注程度、规模信号、预警原因、本次处理结果、后续建议）。两种模式都按 🔴 → 🟠 → 🟡 排序；不要把“问题级别／关注程度”列改写成纯 emoji，必须保留例如“🟠 中风险｜建议优先关注”这类完整标签；如果你改写了表格文案，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试。',
    '发现可沉淀项时不要中途打断任务：代码扩展识别这类白名单工具补全会自动应用并记录；用户偏好、项目协作规矩和 OpenPrd 默认行为先记录为候选，收工时运行 openprd grow . --review 集中确认。',
    '维护 OpenPrd 本身且涉及配置类能力时，先判断是否应纳入 openprd grow；高置信可成长默认纳入，不确定则主动询问用户。',
    '涉及后端、脚本、Agent、工具链、服务或数据处理变更时，把 CLI 与 API 视为同级接入面，并同步更新 docs/basic/backend-structure.md 或明确写不适用原因。',
    '声明就绪前请验证 docs/basic 标准。',
  ].filter(Boolean).join('\n');
}

function shouldInjectOpenPrdContext(payload) {
  const prompt = promptText(payload);
  if (!prompt.trim()) {
    return false;
  }
  const intent = analyzePromptIntent(prompt);
  const hasProjectPathReference = /(?:^|[\s`"'(])(?:src|app|lib|server|scripts|test|tests|docs|skills|openprd|openspec)\/[^\s`"'()]+/i.test(prompt);
  if (
    intent.simpleConcrete
    && !intent.visualMockupRequest
    && !intent.continuationRequest
    && !hasProjectPathReference
    && !intent.productCopyRequest
    && !intent.secretsRequest
    && !intent.weappValidationRequest
    && !intent.browserSafetyRequest
    && !intent.publicRepoResearchRequest
    && !intent.externalTechResearchRequest
    && !intent.skillWorkflowEditRequest
    && !intent.learningMaterialRequest
  ) {
    return false;
  }
  if (intent.shouldInject) {
    return true;
  }
  const normalized = prompt.toLowerCase();
  const triggers = [
    /openprd/i,
    /opens*prd/i,
    /\bprd\b/i,
    /openprd\s+(run|loop|fleet|doctor|standards|change|discovery|handoff|freeze)/i,
    /\b(fleet|standards)\b/i,
    /深度调研/,
    /深度对标/,
    /持续调研/,
    /复刻/,
    /对标/,
    /文件说明书/,
    /文件夹说明书/,
    /基础文档/,
    /docs\/basic/i,
    /standards/i,
    /handoff/i,
    /freeze/i,
    /新增/,
    /增加/,
    /新建/,
    /我希望/,
    /用户反馈/,
    /需求/,
    /功能/,
    /模块/,
    /页面/,
    /入口/,
    /流程/,
    /编排/,
    /一站式/,
    /体验/,
  ];
  return triggers.some((pattern) => pattern.test(normalized));
}

function classifyRisk(payload) {
  const text = payloadText(payload);
  const normalized = text.toLowerCase();
  const highPatterns = [
    /git\s+push/,
    /git\s+commit/,
    /npm\s+publish/,
    /pnpm\s+publish/,
    /yarn\s+npm\s+publish/,
    /gh\s+release/,
    /rm\s+-rf/,
    /\b(?:ssh|scp|rsync)\b[^\n]*(?:prod|production|线上|生产|云端|server|remote)/,
    /\b(?:kubectl|helm)\b[^\n]*(?:apply|patch|set|delete|rollout|scale|exec)[^\n]*(?:prod|production|线上|生产|云端|cluster)/,
    /\b(?:vercel|wrangler|fly|flyctl|railway|firebase)\b[^\n]*(?:deploy|up)[^\n]*(?:--prod|prod|production|线上|生产)/,
    /\bsupabase\s+db\s+push\b[^\n]*(?:--linked|--db-url|prod|production|线上|生产)/,
    /\bcurl\b[^\n]*(?:-x|--request)\s*(?:post|put|patch|delete)\b[^\n]*(?:prod|production|线上|生产|云端|api\.)/,
    /openprd\s+freeze\b/,
    /openprd\s+handoff\b/,
    /openprd\s+change\s+.*--apply/,
    /openprd\s+change\s+.*--archive/,
  ];
  const mediumPatterns = [
    /apply_patch/,
    /npm\s+install/,
    /npm\s+i\s/,
    /pnpm\s+add/,
    /yarn\s+add/,
    /bun\s+add/,
    /openprd\s+setup\b/,
    /openprd\s+update\b/,
    /openprd\s+standards\s+.*--init/,
    /openprd\s+change\s+.*--generate/,
    /openprd\s+review\s+.*--mark\s+(pending-confirmation|confirmed|needs-revision)/,
    /openprd\s+tasks\s+.*--advance/,
    /openprd\s+discovery\s+.*--advance/,
    /openprd\s+(capture|classify|synthesize|diagram)\b/,
  ];
  if (highPatterns.some((pattern) => pattern.test(normalized))) {
    return { level: 'high', reason: 'release, history, freeze, handoff, destructive, or accepted-change action' };
  }
  if (mediumPatterns.some((pattern) => pattern.test(normalized))) {
    return { level: 'medium', reason: 'workspace mutation or dependency/configuration change' };
  }
  return { level: 'low', reason: 'read-only or local exploratory action' };
}

function extractChangeId(text) {
  const match = String(text || '').match(/--change\s+([a-zA-Z0-9._-]+)/);
  return match ? match[1] : null;
}

function runGateChecks(cwd, payload, risk) {
  const checks = [];
  const run = runOpenPrd(['run', '.', '--verify', '--json'], cwd);
  const runParsed = parseJsonOutput(run.stdout);
  const runTaskReady = runParsed?.readiness?.taskReady ?? run.ok;
  const runWorkspaceReady = runParsed?.readiness?.workspaceReady ?? run.ok;
  checks.push({
    name: 'run-verify',
    ok: runWorkspaceReady,
    taskReady: runTaskReady,
    workspaceReady: runWorkspaceReady,
    summary: summarizeRunVerifyCheck(runParsed, run.stdout || run.stderr),
    workspaceAttention: runParsed?.workspaceAttention ?? null,
    warnings: Array.isArray(runParsed?.warnings) ? runParsed.warnings : [],
    errors: Array.isArray(runParsed?.errors) ? runParsed.errors : [],
    details: [
      ...(Array.isArray(runParsed?.errors) ? runParsed.errors : []),
      ...(Array.isArray(runParsed?.warnings) ? runParsed.warnings : []),
    ],
    output: run.stdout || run.stderr,
  });
  const text = payloadText(payload);
  const changeId = extractChangeId(text);
  if (changeId && /openprd\s+change\s+.*--(apply|archive|validate)/i.test(text)) {
    const change = runOpenPrd(['change', '.', '--validate', '--change', changeId], cwd);
    checks.push({
      name: 'change-validate',
      ok: change.ok,
      summary: `change-validate: ${change.ok ? 'ok' : 'failed'}`,
      details: [change.stdout || change.stderr].filter(Boolean),
      output: change.stdout || change.stderr,
    });
  }
  if (risk.level === 'high' && shouldRunDoctorForHighRisk(payload) && runWorkspaceReady) {
    const doctor = runOpenPrd(['doctor', '.', '--tools', 'codex', '--json'], cwd);
    const doctorParsed = parseJsonOutput(doctor.stdout);
    checks.push({
      name: 'doctor',
      ok: doctor.ok,
      agentIntegrationOk: doctorParsed?.agentIntegration?.ok ?? null,
      standardsOk: doctorParsed?.standards?.ok ?? null,
      validationOk: doctorParsed?.validation?.valid ?? null,
      summary: summarizeDoctorCheck(doctorParsed, doctor.stdout || doctor.stderr),
      details: [doctor.stderr || doctor.stdout].filter(Boolean),
      output: doctor.stdout || doctor.stderr,
    });
  }
  const envelope = buildGateFailureEnvelope({ checks });
  return {
    ok: checks.every((check) => check.ok),
    checks,
    envelope,
    summary: checks.map((check) => check.summary || `${check.name}: ${check.ok ? 'ok' : 'failed'}`).join(', '),
  };
}

function hasTurnReviewSignal(turnState, kind) {
  return Array.isArray(turnState?.reviewSignals)
    && turnState.reviewSignals.some((signal) => signal?.kind === kind);
}

function parseShanghaiTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}+08:00`;
  const parsed = Date.parse(withZone);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectRecentArtifactPaths(dir, startedAtMs, matcher, output = []) {
  if (!fs.existsSync(dir)) {
    return output;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRecentArtifactPaths(absolutePath, startedAtMs, matcher, output);
      continue;
    }
    if (typeof matcher === 'function' && !matcher(absolutePath)) {
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (startedAtMs && Number.isFinite(startedAtMs) && stat.mtimeMs < startedAtMs) {
      continue;
    }
    output.push(absolutePath);
  }
  return output;
}

function hasRecentArtifacts(root, relativeDir, turnState, matcher) {
  const dir = path.join(root, relativeDir);
  const startedAtMs = parseShanghaiTimestamp(turnState?.startedAt);
  return collectRecentArtifactPaths(dir, startedAtMs, matcher, []).length > 0;
}

function hasRecentVisualReviewArtifact(root, turnState) {
  return hasRecentArtifacts(root, '.openprd/harness/visual-reviews', turnState, (artifactPath) => {
    const normalized = artifactPath.split(path.sep).join('/');
    return /\.(?:jpe?g|png|webp|json)$/i.test(normalized)
      && /visual-(?:compare|before-after|focus-board|parallel-board|verification-board|alignment-board|centering-board)|reference-actual|before-after|focus-board|parallel-board|verification-board|alignment-board|centering-board|center-board/i.test(normalized);
  });
}

function isVisualEvidenceIntent(intent = null) {
  const text = String(intent?.promptText || '');
  return isFrontendTaskIntent(intent)
    || hasLightweightUiVisualSignal(text)
    || /(界面|页面|前端|视觉|样式|布局|信息架构|效果图|设计稿|参考图|实现截图|视觉对比|视觉评审|截图|实测|Computer\s*Use|Browser|Playwright|复刻|不一致|好丑|没对齐|没有对齐|不对齐|对不齐|对不上|不像|对齐有问题|对齐问题|排版漂移|布局漂移|左右偏差|上下偏差|横向偏差|竖向偏差|同构|重复单元|列表卡片|卡片列表|卡片网格|网格卡片|网格列表|列表网格|对齐辅助线|内容槽位|内部槽位|内部居中|视觉重心|主体外接框|画布中心|偏心|不居中|没居中|图标内部|图片内部|素材内部)/i.test(text);
}

function visualEvidenceStopReminder(root, turnState, stopIntent) {
  if (stopIntent?.visualMockupRequest) {
    return null;
  }
  const touchedFiles = Array.isArray(turnState?.touchedFiles) ? turnState.touchedFiles : [];
  const frontendTouched = touchedFiles.some((file) => looksLikeFrontendImplementationFile(file));
  const rawScreenshotObserved = hasTurnReviewSignal(turnState, 'visual-raw-screenshot');
  const visualArtifactObserved = hasTurnReviewSignal(turnState, 'visual-review-artifact')
    || hasTurnReviewSignal(turnState, 'visual-verification-board')
    || hasTurnReviewSignal(turnState, 'visual-alignment-board')
    || hasTurnReviewSignal(turnState, 'visual-centering-board')
    || hasRecentVisualReviewArtifact(root, turnState);
  const needsVisualEvidence = isVisualEvidenceIntent(stopIntent)
    && (rawScreenshotObserved || frontendTouched || /截图|实测|Computer\s*Use|Browser|Playwright/i.test(String(stopIntent?.promptText || '')));
  if (!needsVisualEvidence || visualArtifactObserved) {
    return null;
  }
  const preferred = rawScreenshotObserved
    ? '`openprd visual-compare . --board <verification-board.json> --locale <zh-CN|en>`，把普通截图、Computer/Browser/Playwright 实测路径和检查点拼成截图实测证据板'
    : '有参考图时用 `--reference/--actual`，无参考且改既有界面用 `--before/--after`，普通截图实测用 `--board <verification-board.json>`，同构列表/卡片/网格/表格用 `--board <alignment-board.json>`，单元素内部居中/视觉重心用 `--board <centering-board.json>`';
  return [
    'OpenPrd 在本轮收工回顾里发现 UI/视觉任务已有截图、实测或前端改动，但还没有本轮拼图证据。',
    '即便只是卡片宽度、间距、留白、对齐、颜色、圆角、字号这类轻量可视优化，也需要留下视觉证据；build、package 和 dev-check 不能替代视觉收口。',
    '如果这轮新开发或修改了同构列表、卡片、网格、表格，或用户反馈元素没对齐，要截真实页面、叠辅助线，同时量容器轨道和标题/副标题/描述/标签/状态/价格/按钮/图标等内部内容槽位的 spread，并生成 alignment-board；只量外框、列宽或行顶不算完整对齐验收。',
    '如果这轮判断的是单个素材、图标、头像、徽标、按钮图形或图片内部是否居中，要截取或裁出目标元素，用 centering-board 量画布中心、主体外接框中心和视觉重心偏移；单张截图或主观“看起来居中”不算完整居中验收。',
    '视觉证据还要检查本轮审美意图是否成立：气质、层级、颜色、字号、间距、表面角色和记忆点不能只靠口头描述。',
    `普通截图和 Computer 实测截图只能作为原始素材，不能单独替代视觉收口。请先运行 ${preferred}。`,
    '补齐前不要宣称界面视觉已经完成；可以如实说功能或代码已改，但视觉拼图证据还没补齐。',
  ].join('\n');
}

function recentLearningArtifactPaths(root, turnState, matcher) {
  const dir = path.join(root, '.openprd/learning/archive');
  const startedAtMs = parseShanghaiTimestamp(turnState?.startedAt);
  return collectRecentArtifactPaths(dir, startedAtMs, matcher, []);
}

function hasRecentLearningSkeletonArtifact(root, turnState) {
  return recentLearningArtifactPaths(root, turnState, (artifactPath) => {
    const normalized = artifactPath.split(path.sep).join('/');
    return /\/(?:agent-prompt\.md|reader\.html|learning-package\.json|learning-content\.json)$/i.test(normalized);
  }).length > 0;
}

function hasRecentAuthoredLearningReaderArtifact(root, turnState) {
  const contentPaths = recentLearningArtifactPaths(root, turnState, (artifactPath) => artifactPath.endsWith('learning-content.json'));
  return contentPaths.some((contentPath) => {
    const content = readJsonSync(contentPath, null);
    if (!content || content.authoringStatus !== 'agent-authored') {
      return false;
    }
    if (!Array.isArray(content.chapters) || content.chapters.length === 0) {
      return false;
    }
    const readerPath = path.join(path.dirname(contentPath), 'reader.html');
    return fs.existsSync(readerPath);
  });
}

function learningMaterialStopReminder(root, turnState, stopIntent) {
  if (!stopIntent?.learningMaterialRequest) {
    return null;
  }
  if (hasRecentAuthoredLearningReaderArtifact(root, turnState)) {
    return null;
  }
  const command = learningReviewCommand(stopIntent);
  if (!hasRecentLearningSkeletonArtifact(root, turnState)) {
    return [
      'OpenPrd 在本轮收工回顾里识别到用户要的是学习型交付物，但还没有看到本轮新生成的学习包阅读器。',
      '请先运行 `' + command + '`，生成 `.openprd/learning/archive/<packageId>/` 下的证据清单、Agent 写作提示、learning-content.json 骨架和 reader.html。',
      '这类请求按产物形态和长期阅读/教学目的判断，不是固定关键词表；普通 Markdown 只能作为辅助讲义，不能替代 OpenPrd reader。',
    ].join('\n');
  }
  return [
    'OpenPrd 在本轮收工回顾里发现学习包骨架已经出现，但还没有本轮 Agent-authored 的最终 reader 内容。',
    '请读取 `.openprd/learning/archive/<packageId>/agent-prompt.md`，基于证据写入 `learning-content.json`，再运行 `openprd learn . --content-json <file> --open` 重新渲染。',
    '完成前不要把聊天里的普通 Markdown 成稿当作学习材料交付完成。',
  ].join('\n');
}

function closeoutVerificationReminder(root, turnState, stopIntent) {
  const touchedFiles = Array.isArray(turnState?.touchedFiles) ? turnState.touchedFiles : [];
  if (touchedFiles.length === 0) {
    return null;
  }
  if (stopIntent?.requirementTier !== 'l2' && !hasTurnReviewSignal(turnState, 'loop-finish')) {
    return null;
  }
  const codeTouched = touchedFiles.some((file) => /^(app|src|lib|components|pages|server|backend|frontend|scripts|openprd\/src)\//.test(String(file))
    || /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|java|kt|swift|css|scss|less|vue|svelte|html)$/i.test(String(file)));
  if (!codeTouched) {
    return null;
  }
  const missing = [];
  if (!hasTurnReviewSignal(turnState, 'quality-verify')) {
    missing.push('最终 `openprd quality . --verify` 与 HTML 质量报告');
  }
  if (!hasTurnReviewSignal(turnState, 'run-verify')) {
    missing.push('最终 `openprd run . --verify`');
  }
  const hasMarkdownReport = hasRecentArtifacts(root, '.openprd/harness/test-reports', turnState, (artifactPath) => artifactPath.endsWith('.md'));
  const hasHtmlReport = hasRecentArtifacts(root, '.openprd/harness/test-reports', turnState, (artifactPath) => artifactPath.endsWith('.html'));
  if (!hasMarkdownReport || !hasHtmlReport) {
    missing.push('本轮 task-scoped Markdown / HTML 测试报告');
  }
  if (missing.length === 0) {
    return null;
  }
  return [
    'OpenPrd 在本轮收工回顾里发现项目级收口证据还没补齐。',
    `如果你准备宣称“本次调整已经整体完成”或“项目级完成”，请先补齐：${missing.join('；')}。`,
    '未补齐前，只能如实说“代码或局部实现已完成，但项目级收口还没做完”，不要把缺少最终验证的状态表述成已完全闭环。',
  ].join('\n');
}

function hookSuppressed(root) {
  const state = readJsonSync(path.join(harnessDir(root), 'hook-state.json'), {});
  const lockPath = path.join(harnessDir(root), 'input-lock.json');
  const lock = readJsonSync(lockPath, null);
  return Boolean(state?.suppressions?.inputLock || (lock && lock.active));
}

function allowHook(additionalContext = null, outputEventName = eventName) {
  const result = { continue: true };
  if (additionalContext) {
    result.hookSpecificOutput = {
      hookEventName: outputEventName,
      additionalContext,
    };
  }
  return result;
}

function blockHook(reason) {
  return {
    decision: 'block',
    reason,
    systemMessage: reason,
  };
}

function handle(eventName, cwd, payload) {
  const root = findProjectRoot(cwd);
  const sessionId = sessionIdFor(payload);
  const automationDecision = automationBypassDecision(root, eventName, payload, sessionId);
  if (automationDecision.optIn) {
    rememberAutomationMode(root, sessionId, payload, automationDecision.signals, 'openprd-maintenance');
  } else if (automationDecision.bypass) {
    rememberAutomationMode(root, sessionId, payload, automationDecision.signals, 'automation');
    return allowHook();
  }
  ensureHarness(root);
  const risk = classifyRisk(payload);
  const fingerprint = fingerprintFor(eventName, payload, risk);
  const duplicate = isDuplicate(root, fingerprint);
  const runtimeEnvironment = recordRuntimeEnvironment(root, eventName, payload, sessionId);
  const baseEvent = {
    eventName,
    risk,
    fingerprint,
    duplicate,
    sessionId,
    runtimeEnvironment: runtimeEnvironment.active,
    preview: preview(payloadText(payload)),
  };

  if (eventName === 'SessionStart') {
    appendEvent(root, { ...baseEvent, outcome: 'session-start' });
    updateHookState(root, baseEvent);
    return allowHook();
  }

  if (eventName === 'UserPromptSubmit') {
    if (duplicate) {
      return allowHook();
    }
    const prompt = promptText(payload);
    beginTurnReview(root, baseEvent, prompt);
    let intent = analyzePromptIntent(prompt);
    let gate = readRequirementGate(root, sessionId);
    let skillGate = readNamedGate(root, 'skill-visualization', sessionId);
    let researchGate = readNamedGate(root, 'research', sessionId);
    let weappGate = readNamedGate(root, 'weapp', sessionId);
    const shortAffirmative = isShortAffirmativeConfirmation(prompt);
    let progress = isBlockingRequirementGate(gate) ? evaluateRequirementGateProgress(root, sessionId) : null;
    const clarificationFollowup = isBlockingRequirementGate(gate)
      ? looksLikeClarificationFollowupReply(prompt, intent)
      : false;
    if (isBlockingRequirementGate(gate) && shortAffirmative) {
      intent = {
        ...intent,
        shouldInject: true,
      };
    }
    if (!intent.confirmation && isBlockingRequirementGate(gate) && shortAffirmative && progress?.nextStep === 'implementation-ready') {
      intent = {
        ...intent,
        confirmation: true,
        implementationConfirmation: true,
        shouldInject: true,
      };
    }
    if (skillGate?.active && (shortAffirmative || intent.confirmation)) {
      skillGate = confirmSkillVisualizationGate(root, prompt, sessionId);
    } else if (intent.skillWorkflowEditRequest) {
      skillGate = openSkillVisualizationGate(root, prompt, sessionId);
    } else if (skillGate?.active) {
      skillGate = closeSkillVisualizationGate(root, sessionId, { status: 'superseded-by-new-prompt' });
    }
    if (intent.publicRepoResearchRequest || intent.externalTechResearchRequest) {
      researchGate = openResearchGate(root, prompt, intent, sessionId);
    } else if (researchGate?.active) {
      researchGate = closeResearchGate(root, sessionId, { status: 'superseded-by-new-prompt' });
    }
    if (intent.weappValidationRequest) {
      weappGate = openWeappGate(root, prompt, sessionId);
    } else if (weappGate?.active) {
      weappGate = closeWeappGate(root, sessionId, { status: 'superseded-by-new-prompt' });
    }
    if (canAutoAuthorizeRequirementExecution(gate, progress)) {
      gate = authorizeRequirementGateExecution(root, prompt, sessionId, {
        reason: 'original-execution-intent-after-reviewed-task-ready',
      });
      progress = null;
    }
    if (isBlockingRequirementGate(gate)) {
      if ((intent.confirmation || shortAffirmative || clarificationFollowup) && progress?.nextStep === 'clarification-confirmation-required') {
        gate = holdRequirementGate(root, prompt, progress, sessionId, {
          status: 'clarification-confirmed',
          clarificationConfirmedAt: now(),
          clarificationConfirmationPreview: preview(prompt, 500),
        });
        progress = evaluateRequirementGateProgress(root, sessionId);
        appendEvent(root, { ...baseEvent, outcome: 'requirement-gate-clarification-confirmed' });
        recordRunHook(root, baseEvent, 'requirement-gate-clarification-confirmed');
        updateHookState(root, baseEvent);
        return allowHook(composeHookContext(root, intent, gate, progress, sessionId));
      }
      const repeatedConfirmationSignal = intent.confirmation
        || shortAffirmative
        || (clarificationFollowup && /(确认|继续|落地|开始|推进|按(这个|你的)|就这么|开做)/.test(stripMarkdown(prompt)));
      if (
        repeatedConfirmationSignal
        && intent.reviewDecision !== 'needs-revision'
        && !intent.reviewCommand
        && gateHasClarificationConfirmation(gate)
        && !reviewPolicyAllowsSilentRecord(requirementApprovalPolicy(gate))
      ) {
        gate = escalateRequirementGateApproval(root, prompt, gate, sessionId);
        progress = evaluateRequirementGateProgress(root, sessionId);
        if (canAutoAuthorizeRequirementExecution(gate, progress)) {
          gate = authorizeRequirementGateExecution(root, prompt, sessionId, {
            reason: 'repeated-user-confirmation-after-summary',
          });
          progress = null;
        }
        appendEvent(root, { ...baseEvent, outcome: 'requirement-gate-approval-escalated' });
        recordRunHook(root, baseEvent, 'requirement-gate-approval-escalated');
        updateHookState(root, baseEvent);
        return allowHook(composeHookContext(root, intent, gate, progress, sessionId));
      }
      if (intent.reviewDecision) {
        const authorization = reviewActionAuthorizationFor(intent, progress, prompt);
        gate = holdRequirementGate(root, prompt, progress, sessionId, {
          status: authorization ? 'review-confirmation-authorized' : progress.nextStep,
          reviewActionAuthorization: authorization,
        });
        if (
          authorization
          && intent.reviewDecision === 'confirmed'
          && (authorization.continueAfterReview || gateHasClarificationConfirmation(gate))
        ) {
          // 用户确认评审稿时要么同句要求继续执行，要么此前已确认过需求摘要（重复确认）：
          // 一次确认解锁整条链，后续 change/tasks/实现不再停下索取确认。
          gate = escalateRequirementGateApproval(root, prompt, gate, sessionId);
          progress = evaluateRequirementGateProgress(root, sessionId);
        }
        const outcome = authorization ? 'requirement-gate-review-authorized' : 'requirement-gate-awaiting-review';
        appendEvent(root, {
          ...baseEvent,
          outcome,
          reviewDecision: intent.reviewDecision,
          reviewVersionId: progress?.review?.versionId ?? null,
        });
        recordRunHook(root, baseEvent, outcome);
        updateHookState(root, baseEvent);
        return allowHook(composeHookContext(root, intent, gate, progress, sessionId));
      }
      if (isImplementationAdvanceIntent(intent)) {
        if (progress?.nextStep !== 'implementation-ready') {
          gate = holdRequirementGate(root, prompt, progress, sessionId);
          appendEvent(root, { ...baseEvent, outcome: 'requirement-gate-held', progress });
          recordRunHook(root, baseEvent, 'requirement-gate-held');
          updateHookState(root, baseEvent);
          return allowHook(composeHookContext(root, intent, gate, progress, sessionId));
        }
        gate = confirmRequirementGate(root, prompt, sessionId);
        appendEvent(root, { ...baseEvent, outcome: 'requirement-gate-confirmed', progress });
        recordRunHook(root, baseEvent, 'requirement-gate-confirmed');
        updateHookState(root, baseEvent);
        return allowHook(composeHookContext(root, intent, gate, progress, sessionId));
      }
    }
    if (intent.requiresIntake) {
      gate = openRequirementGate(root, prompt, intent, sessionId);
      const result = allowHook(composeHookContext(root, intent, gate, evaluateRequirementGateProgress(root, sessionId), sessionId));
      appendEvent(root, { ...baseEvent, outcome: 'requirement-gate-opened' });
      recordRunHook(root, baseEvent, 'requirement-gate-opened');
      updateHookState(root, baseEvent);
      return result;
    }
    if (!shouldInjectOpenPrdContext(payload)) {
      return allowHook();
    }
    const result = allowHook(composeHookContext(root, intent, gate, progress, sessionId));
    appendEvent(root, { ...baseEvent, outcome: 'context-injected' });
    recordRunHook(root, baseEvent, 'context-injected');
    updateHookState(root, baseEvent);
    return result;
  }

  if (eventName === 'PreToolUse') {
    const turnIntent = analyzePromptIntent(readTurnState(root).prompt || '');
    let gate = readRequirementGate(root, sessionId);
    const skillGate = readNamedGate(root, 'skill-visualization', sessionId);
    const researchGate = applyResearchToolSignal(root, payload, sessionId);
    const weappGate = applyWeappToolSignal(root, payload, sessionId);
    let progress = isBlockingRequirementGate(gate) ? evaluateRequirementGateProgress(root, sessionId) : null;
    if (canAutoAuthorizeRequirementExecution(gate, progress)) {
      gate = authorizeRequirementGateExecution(root, readTurnState(root).prompt || '', sessionId, {
        reason: 'original-execution-intent-after-reviewed-task-ready',
      });
      progress = null;
    }
    if (sessionId && isAllowedDuringRequirementGate(root, payload, gate, sessionId)) {
      mirrorRequirementGate(root, sessionId);
    }
    const authorizedReviewMutation = /openprd\s+review\b/i.test(commandText(payload))
      && /--mark\b/i.test(commandText(payload))
      && (
        isAuthorizedReviewMarkCommand(payload, gate)
        || isSilentRecordReviewMarkCommand(payload, gate, progress)
      );
    if (skillGate?.active && looksLikeSkillContractMutation(root, payload)) {
      appendEvent(root, { ...baseEvent, outcome: 'blocked-skill-visualization-gate' });
      recordRunHook(root, baseEvent, 'blocked-skill-visualization-gate');
      updateHookState(root, baseEvent);
      return blockHook([
        'OpenPrd blocked a skill/AGENTS mutation because the visualization-confirmation gate is still active.',
        'Before editing SKILL.md, AGENTS.md, or related skill workflow files, first output a color-coded Mermaid plan, summarize added/changed/unchanged/removed items, then wait for explicit user confirmation.',
      ].join('\n'));
    }
    if (researchGate?.active && isMutationPayload(payload, risk) && !authorizedReviewMutation) {
      const researchBlockStreak = bumpProcessGateBlockCount(root, 'external-evidence');
      if (researchBlockStreak > PROCESS_GATE_FUSE_LIMIT) {
        appendEvent(root, { ...baseEvent, outcome: 'research-gate-fuse-open' });
        recordRunHook(root, baseEvent, 'research-gate-fuse-open');
        updateHookState(root, baseEvent);
        recordTouchedFiles(root, payload);
        return allowHook(processGateFuseMessage('external-evidence', researchBlockStreak, researchGateMessage(researchGate)));
      }
      appendEvent(root, { ...baseEvent, outcome: 'blocked-research-gate' });
      recordRunHook(root, baseEvent, 'blocked-research-gate');
      updateHookState(root, baseEvent);
      return blockHook([
        'OpenPrd blocked a mutating action because the external-evidence gate is still active.',
        researchGateMessage(researchGate),
      ].filter(Boolean).join('\n'));
    }
    if (turnIntent.secretsRequest && isRawVaultReadAttempt(payload)) {
      appendEvent(root, { ...baseEvent, outcome: 'blocked-raw-vault-read' });
      recordRunHook(root, baseEvent, 'blocked-raw-vault-read');
      updateHookState(root, baseEvent);
      return blockHook([
        'OpenPrd blocked a raw vault read attempt.',
        'Use the `secrets-vault` skill first and only read the minimum required fields; do not read the original vault file directly.',
      ].join('\n'));
    }
    const autonomyRisk = detectHighRiskAutonomyMutation(root, payload, turnIntent, risk);
    if (autonomyRisk && !hasExplicitAutonomyRiskApproval(turnIntent)) {
      appendEvent(root, { ...baseEvent, outcome: 'blocked-high-risk-autonomy', autonomyRisk });
      recordRunHook(root, baseEvent, 'blocked-high-risk-autonomy');
      updateHookState(root, baseEvent);
      return blockHook(formatHighRiskAutonomyBlock(autonomyRisk));
    }
    if (isBlockingRequirementGate(gate) && isMutationPayload(payload, risk) && !isAllowedDuringRequirementGate(root, payload, gate, sessionId)) {
      const reviewMark = parseReviewMarkCommand(commandText(payload));
      const approvalPolicy = requirementApprovalPolicy(gate);
      const silentRecord = reviewPolicyAllowsSilentRecord(approvalPolicy);
      const writePathMutation = isRequirementWritePathMutation(commandText(payload));
      const reason = reviewMark
        ? [
            silentRecord
              ? 'OpenPrd blocked review status writing because this command does not match the exact stable PRD review artifact allowed by the current approval policy.'
              : 'OpenPrd blocked review status writing because the current user message did not explicitly confirm this exact PRD review artifact.',
            silentRecord
              ? 'This lane is in silent-record mode: you may record only the exact current version, digest, and work unit, then continue without another user stop.'
              : 'A plain natural-language user confirmation of the current review (for example "确认这版，继续") is sufficient; the hook binds it to the exact version, digest, and work unit automatically. NEVER ask the user to paste a digest, work-unit id, or a full openprd command.',
            progress?.review?.versionId
              ? `Current review artifact: version ${progress.review.versionId}, digest ${progress.review.digest}, work unit ${progress.review.workUnitId}. Fill these exact values into the review --mark command yourself; do not ask the user for them.`
              : 'Current review artifact has not been synthesized yet. Run openprd synthesize . --open first.',
            silentRecord
              ? 'Do not mark any stale or different review artifact; only the exact current artifact is allowed.'
              : 'Implementation approval and review confirmation are different gates; do not treat "可以开做", plain "请帮我实现/继续实现", or similar wording as permission to run openprd review --mark confirmed. But if the latest user message did confirm this review, retry the mark command with the exact current artifact values above instead of asking the user again.',
          ].filter(Boolean).join('\n')
        : [
            'OpenPrd blocked a mutating action because the requirement gate is still active.',
            progress?.reason || 'The requirement still needs PRD review, change generation, or task preparation.',
            progress?.nextStep === 'implementation-ready'
              ? 'Do not edit implementation files until the user clearly asks to execute this reviewed requirement.'
              : writePathMutation && progress?.nextStep === 'clarification-confirmation-required'
                ? 'Do not write requirement facts, classify, or synthesize yet. First summarize the requirement in chat using 需求判断 / 需求理解 / 功能范围 / 技术方案, prefer Markdown tables for 功能范围 and 技术方案, use light lead sentences for 需求判断 and 需求理解 before sinking details into later bullets or tables, and if this is still a 0-to-1 or worth-doing discussion also surface 第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、什么承诺才算真需求、有没有 10 个样本和更强付费信号、最低成本先验证什么、达到什么条件才允许产品化、增长阶段守什么纪律、以及验证阶段怎样先活下来; wait for the user to confirm that summary, then continue the requirement write path.'
                : writePathMutation && progress?.nextStep === 'clarification-writeback-required'
                  ? 'Do not synthesize yet. The user has already confirmed the current summary or default choice, but current.json still lacks canonical write-back for this lane. Write the confirmed facts back with openprd capture using canonical field paths and source user-confirmed; do not fall back to generic clarify, and do not keep writing agent-inferred / project-derived clarification fields.'
                : writePathMutation && progress?.nextStep === 'product-type-classification-required'
                  ? 'Do not synthesize yet. The current lane still lacks a confirmed product-type classification. Run openprd classify . so the lane scenario is locked before you synthesize.'
                : writePathMutation && progress?.nextStep === 'requirement-interview-required'
                  ? 'Do not synthesize yet. The current lane still lacks required requirement facts. Fill the missing canonical fields with openprd capture, and only use openprd interview . to surface the remaining gaps before you synthesize.'
                : writePathMutation && progress?.nextStep === 'prd-synthesis-required'
                  ? 'You may continue the requirement write path only within the confirmed summary: write back confirmed facts, classify if needed, synthesize the PRD, then proceed to review/change/tasks.'
              : progress?.nextStep === 'review-recording-required'
                ? 'Do not edit implementation files yet. First record the exact current stable review artifact, then generate change and tasks.'
                : 'Do not edit implementation files until the active approval policy is satisfied and the OpenPrd change has generated tasks.',
            silentRecord
              ? 'Decision-point order: because the user explicitly waived any confirmation stop, you may skip requirement-summary confirmation, write back requirement facts, synthesize the PRD, record the exact stable review artifact, generate the OpenPrd change, prepare the task breakdown, then implement within the confirmed scope.'
              : 'Decision-point order: clarify the requirement, summarize it in chat using 需求判断 / 需求理解 / 功能范围 / 技术方案, prefer Markdown tables for 功能范围 and 技术方案, and if the ask still looks like 0-to-1 validation also surface 第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、什么承诺才算真需求、有没有 10 个样本和更强付费信号、最低成本先验证什么、达到什么条件才允许产品化、增长阶段守什么纪律、以及验证阶段怎样先活下来; wait for the user to confirm that requirement summary, write back only confirmed facts, synthesize the PRD, wait for a human review decision on the stable artifact, generate the OpenPrd change, prepare the task breakdown, then implement within the confirmed scope.',
          ].join('\n');
      const requirementBlockStreak = bumpProcessGateBlockCount(root, 'requirement-intake');
      if (requirementBlockStreak > PROCESS_GATE_FUSE_LIMIT) {
        appendEvent(root, { ...baseEvent, outcome: 'requirement-gate-fuse-open' });
        recordRunHook(root, baseEvent, 'requirement-gate-fuse-open');
        updateHookState(root, baseEvent);
        recordTouchedFiles(root, payload);
        return allowHook(processGateFuseMessage('requirement-intake', requirementBlockStreak, reason));
      }
      appendEvent(root, { ...baseEvent, outcome: 'blocked-requirement-intake' });
      recordRunHook(root, baseEvent, 'blocked-requirement-intake');
      updateHookState(root, baseEvent);
      return blockHook(reason);
    }
    let patchModeGate = syncPatchModeGate(root, payload, sessionId, turnIntent);
    if (patchModeGate?.active) {
      if (isPatchModeWriteAttempt(root, payload, patchModeGate)) {
        patchModeGate = updateNamedGate(root, 'patch-mode', {
          status: 'write-attempted',
          lastWriteAttemptAt: now(),
          lastWriteAttemptAtMs: Date.now(),
          lastWriteAttemptTool: toolName(payload) || null,
          lastWriteAttemptFiles: extractTouchedFiles(root, payload),
        }, sessionId) || patchModeGate;
      } else if (patchModeGate.phase === 'handoff' && isPatchModeFocusAttempt(root, payload, patchModeGate)) {
        const nextRemaining = Math.max(0, Number(patchModeGate.focusAllowanceRemaining ?? PATCH_MODE_HANDOFF_FOCUS_ALLOWANCE) - 1);
        patchModeGate = updateNamedGate(root, 'patch-mode', {
          status: nextRemaining > 0 ? 'handoff-focus-read' : 'handoff-awaiting-entry-write',
          focusAllowanceRemaining: nextRemaining,
          lastFocusAt: now(),
          lastFocusAtMs: Date.now(),
          lastFocusTool: toolName(payload) || null,
          lastFocusFiles: extractTouchedFiles(root, payload),
        }, sessionId) || patchModeGate;
      } else {
        const patchModeBlockStreak = bumpProcessGateBlockCount(root, 'patch-mode');
        if (patchModeBlockStreak > PROCESS_GATE_FUSE_LIMIT) {
          appendEvent(root, { ...baseEvent, outcome: 'patch-mode-gate-fuse-open' });
          recordRunHook(root, baseEvent, 'patch-mode-gate-fuse-open');
          updateHookState(root, baseEvent);
          recordTouchedFiles(root, payload);
          return allowHook(processGateFuseMessage(
            'patch-mode',
            patchModeBlockStreak,
            `下一步仍应尽快真实写入 ${patchModeGate.targetFile} 或它的 sibling draft。`,
          ));
        }
        appendEvent(root, {
          ...baseEvent,
          outcome: 'blocked-patch-mode-hover',
          targetFile: patchModeGate.targetFile,
        });
        recordRunHook(root, baseEvent, 'blocked-patch-mode-hover');
        updateHookState(root, baseEvent);
        if (patchModeGate.phase === 'handoff') {
          return blockHook([
            'OpenPrd blocked a post-starter hover because Patch Mode handoff is already active.',
            `design-starter has already landed ${patchModeGate.targetFile} and the active design contracts. You may do at most one immediate orientation pass over the generated entry and the active contracts, then the next action must be a real write to that entry file or one of its sibling drafts.`,
            `Remaining orientation reads: ${Math.max(0, Number(patchModeGate.focusAllowanceRemaining ?? 0))}.`,
            `Allowed orientation files: ${patchModeFocusFiles(root, patchModeGate).join(', ')}.`,
            `Allowed write files: ${patchModeTargetFiles(patchModeGate).join(', ')}.`,
            'Do not go back to web search, docs/basic, template scans, or another shell-only loop after starter output has landed.',
          ].join('\n'));
        }
        return blockHook([
          'OpenPrd blocked a non-writing tool call because Patch Mode is already in the entry-overwrite stage.',
          `You already announced an entry rewrite/overwrite step for ${patchModeGate.targetFile}. The very next action must be a real write to that entry file or one of its sibling drafts, not more reading, scanning, image handling, or shell exploration.`,
          `Allowed next files: ${patchModeTargetFiles(patchModeGate).join(', ')}.`,
          'If the user gave a mockup or reference image, keep it as the style judge, but apply that judgment inside the actual page write instead of pausing in another read-only loop.',
        ].join('\n'));
      }
    }
    const frontendTargets = frontendImplementationTargets(root, payload);
    const designIssues = frontendDesignPreflightIssues(root, turnIntent, frontendTargets);
    if (designIssues.length > 0) {
      const designBlockStreak = bumpProcessGateBlockCount(root, 'frontend-design-preflight');
      if (designBlockStreak > PROCESS_GATE_FUSE_LIMIT) {
        appendEvent(root, { ...baseEvent, outcome: 'frontend-design-gate-fuse-open' });
        recordRunHook(root, baseEvent, 'frontend-design-gate-fuse-open');
        updateHookState(root, baseEvent);
        recordTouchedFiles(root, payload);
        return allowHook(processGateFuseMessage(
          'frontend-design-preflight',
          designBlockStreak,
          designIssues.map((issue) => `- ${issue.file}: ${issue.reason}`).join('\n'),
        ));
      }
      appendEvent(root, { ...baseEvent, outcome: 'blocked-frontend-design-preflight' });
      recordRunHook(root, baseEvent, 'blocked-frontend-design-preflight');
      updateHookState(root, baseEvent);
      return blockHook([
        'OpenPrd blocked a frontend implementation write because the design-preflight contract is still incomplete.',
        frontendTargets.length > 0 ? `Trying to edit: ${frontendTargets.join(', ')}.` : null,
        'Before touching implementation files, update the required files under `.openprd/design/active/` and remove every `待填写` placeholder. If something truly does not apply, write `不适用` or a clear gap note instead of leaving the template unchanged.',
        ...designIssues.map((issue) => `- ${issue.file}: ${issue.reason}`),
      ].filter(Boolean).join('\n'));
    }
    if (turnIntent.browserSafetyRequest && isHighRiskBrowserAction(payload)) {
      appendEvent(root, { ...baseEvent, outcome: 'browser-safety-reminder' });
      recordRunHook(root, baseEvent, 'browser-safety-reminder');
      updateHookState(root, baseEvent);
      return allowHook(browserSafetyMessage(turnIntent));
    }
    if (risk.level === 'high') {
      const gates = runGateChecks(root, payload, risk);
      appendEvent(root, { ...baseEvent, gates, outcome: gates.ok ? 'allowed-high-risk' : 'blocked-high-risk' });
      recordRunHook(root, baseEvent, gates.ok ? 'allowed-high-risk' : 'blocked-high-risk');
      updateHookState(root, baseEvent);
      if (!gates.ok) {
        return blockHook(formatHighRiskGateBlock(gates));
      }
      recordTouchedFiles(root, payload);
      return allowHook(`OpenPrd high-risk gate passed: ${gates.summary}.`);
    }
    if (risk.level === 'medium') {
      appendEvent(root, { ...baseEvent, outcome: 'allowed-medium-risk' });
      recordRunHook(root, baseEvent, 'allowed-medium-risk');
      updateHookState(root, baseEvent);
      recordTouchedFiles(root, payload);
      return allowHook('OpenPrd 检测到写入动作。本轮写入完成后、最终回复前，请针对实际 touched code files 运行 openprd dev-check . <file...>；如出现需要关注的文件：自动优化开启（默认）时先在本轮完成高内聚低耦合拆分（不丢功能、行为不变），最终回复以 **OpenPRD 自动优化报告** 为标题复用 dev-check 表格（列：影响对象、问题级别、源文件规模、优化原因、本次处理结果、后续建议）并附开关确认；关闭时以 **后续建议** 为标题复用表格（列：影响对象、关注程度、规模信号、预警原因、本次处理结果、后续建议）。两种模式都按 🔴 → 🟠 → 🟡 排序；不要把“问题级别／关注程度”列改写成纯 emoji，必须保留例如“🟠 中风险｜建议优先关注”这类完整标签；如果你改写了表格文案，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试；如涉及界面视觉，包括卡片宽度、间距、留白、对齐、颜色、圆角、字号等轻量可视优化，build、package 和 dev-check 只能证明代码或构建状态，不能替代视觉证据；写入前先说明本次审美意图和记忆点，视觉证据也要检查气质、层级、颜色、字号、间距和表面角色是否成立；已有参考效果图并进入实现阶段时，阶段性完成后运行 openprd visual-compare . --reference <效果图> --actual <实现截图> --locale <zh-CN|en> 并查看 JPG 对比图；如果参考图来自本轮或前序 `imagegen`，先确认用户已接受它作为后续对比参考；若一张图里有多个子图、对象或网格，先运行 openprd visual-prepare . --reference <效果图> --grid <列>x<行> 或 --boxes <plan.json>，确认 contact sheet 后再逐项对比。若局部细节更重要，再补 openprd visual-compare . --board <focus-board.json> --locale <zh-CN|en>；如无参考图，先判断新建界面还是修改既有界面：新建界面应先完成 3 方向方案评审，修改既有界面确认已先截修改前截图，并在完成后运行 openprd visual-compare . --before <修改前截图> --after <修改后截图> --locale <zh-CN|en> 查看 JPG 自检图；若并行试了多个优化方向，再补 openprd visual-compare . --board <parallel-board.json> --locale <zh-CN|en>；若普通截图、Computer/Browser/Playwright 实测截图被用作证据，再补 openprd visual-compare . --board <verification-board.json> --locale <zh-CN|en> 的截图实测证据板；若新开发或修改同构列表、卡片、网格、表格，或用户反馈没对齐/排版漂移，再补 openprd visual-compare . --board <alignment-board.json> --locale <zh-CN|en> 的对齐辅助线证据板，截真实页面、叠辅助线，同时量容器轨道和标题/副标题/描述/标签/状态/价格/按钮/图标等内部内容槽位的 x/y/宽高/baseline spread；只量外框、列宽或行顶不算完整对齐验收；当用户说“跟效果图”“不一致”“好丑”“复刻”时，至少给出一份视觉证据图，不要只口头判断。发现可沉淀项时不要中途打断任务，代码扩展识别这类白名单工具补全会自动应用并记录，用户偏好、项目协作规矩和 OpenPrd 默认行为留到收工时用 openprd grow . --review 集中确认；维护 OpenPrd 本身且涉及配置类能力时，先判断是否应纳入 openprd grow；声明就绪前，请同步维护 docs/basic、文件说明书、文件夹 README，以及相关 OpenPrd change/task 状态；如果涉及后端、脚本、Agent、工具链、服务或数据处理变更，还要把 CLI 与 API 视为同级接入面并更新 docs/basic/backend-structure.md。');
    }
    return allowHook();
  }

  if (eventName === 'PostToolUse') {
    const text = payloadText(payload);
    const failed = /command not found|no such file|permission denied|failed|error|exception/i.test(text);
    if (!failed) {
      recordVisualEvidenceSignals(root, payload);
    }
    if (!failed) {
      return allowHook();
    }
    appendEvent(root, { ...baseEvent, outcome: failed ? 'tool-failure-detected' : 'tool-complete' });
    recordRunHook(root, baseEvent, failed ? 'tool-failure-detected' : 'tool-complete');
    updateHookState(root, baseEvent);
    if (failed && !duplicate) {
      return allowHook(toolFailureMessage(classifyToolFailure(text)));
    }
    return allowHook();
  }

  if (eventName === 'Stop') {
    appendEvent(root, { ...baseEvent, outcome: 'stop-check' });
    recordRunHook(root, baseEvent, 'stop-check');
    updateHookState(root, baseEvent);
    if (hookSuppressed(root)) {
      return allowHook();
    }
    const turnState = readTurnState(root);
    const stopIntent = analyzePromptIntent(turnState.prompt || '');
    const weappGate = readNamedGate(root, 'weapp', sessionId);
    if (weappGate?.active && stopIntent.weappValidationRequest) {
      return allowHook([
        'OpenPrd 在本轮收工回顾里发现小程序运行态验证仍未完成。',
        '如果这次任务是用户明确要求的小程序实测、复现、截图、抓日志/网络，或你已经承诺提供运行态证据，请补齐本地运行态验证；补齐时默认沿用当前小程序运行态或开发者工具会话连续验证，不要为了验证自动重开应用；否则不要把普通代码改动默认升级成小程序实测。',
        '如果当前环境没有可用的小程序本地验证工具，请明确说明未完成运行态验证，不要假定工具已安装。',
      ].join('\n'));
    }
    if (stopIntent.visualMockupRequest && (!Array.isArray(turnState.touchedFiles) || turnState.touchedFiles.length === 0)) {
      return allowHook([
        'OpenPrd 生图事实对齐提醒：如果这轮要汇报图片结果、失败或限流，请确保它来自一次实际的生图工具调用（Codex=`imagegen`，Cursor=`GenerateImage`，或用户已确认的偏好工具）。',
        '未实际调用生图工具前，不要声称“生图限流”“生图失败”或“已经生成图片结果”；若本轮还没调用，请如实说明仍未开始或尚未完成生图。',
        '如果这轮确实已经生图，不要默认把结果登记到 `.openprd/harness/visual-reviews/` 或直接当成验收参考；先把它当候选效果图。',
        '若用户还要继续做实现，主动追问三件事：是否符合预期、是否纳入后续效果图/实现截图对比、是否按此继续后续实现；未确认前不要自动进入实现，也不要声称参考图已定。',
      ].join('\n'));
    }
    const patchModeGate = readNamedGate(root, 'patch-mode', sessionId);
    if (patchModeGate?.active) {
      if (isPatchModeWriteObserved(root, patchModeGate)) {
        closePatchModeGate(root, sessionId, {
          status: 'write-observed',
          writeObservedAt: now(),
        });
      } else if (patchModeGate.phase === 'handoff') {
        return allowHook([
          'OpenPrd 在本轮收工回顾里发现 design-starter 已经落地，但 Patch Mode handoff 还没真正收口。',
          `当前应先把后续真实页面继续写到 ${patchModeGate.targetFile} 或它的 sibling draft（${(patchModeGate.draftFiles || []).join(', ')}）之一，再继续汇报完成。`,
          `如果只是读了入口文件或 active design contracts，那还只算就地对焦，不算真正落盘；starter 之后不要再回头搜网页、翻 docs/basic 或继续模板漫游。`,
        ].join('\n'));
      } else {
        return allowHook([
          'OpenPrd 在本轮收工回顾里发现 Patch Mode 还停在“已宣布开始覆盖，但入口文件还没真正落盘”的状态。',
          `当前应先把真实写入动作落到 ${patchModeGate.targetFile} 或它的 sibling draft（${(patchModeGate.draftFiles || []).join(', ')}）之一，再继续汇报完成。`,
          '如果用户给了效果图或参考图，继续以它为准，但这个判断必须落实在实际页面写入里；只补说明、只补合同、只下载素材或只说“准备开始改”都不算完成。',
        ].join('\n'));
      }
    }
    const visualReminder = visualEvidenceStopReminder(root, turnState, stopIntent);
    if (visualReminder) {
      return allowHook(visualReminder);
    }
    const learningReminder = learningMaterialStopReminder(root, turnState, stopIntent);
    if (learningReminder) {
      return allowHook(learningReminder);
    }
    const devCheckMessage = devCheckWrapUpMessage(root, turnState);
    if (devCheckMessage) {
      return allowHook(devCheckMessage);
    }
    const closeoutReminder = closeoutVerificationReminder(root, turnState, stopIntent);
    if (closeoutReminder) {
      return allowHook(closeoutReminder);
    }
    if (Array.isArray(turnState.touchedFiles) && turnState.touchedFiles.length > 0) {
      const review = runOpenPrd(['quality', '.', '--learn', '--review', '--from', '.openprd/harness/turn-state.json', '--json'], root);
      if (review.ok) {
        try {
          const parsedReview = JSON.parse(review.stdout);
          if (
            parsedReview
            && !parsedReview.skipped
            && parsedReview.ok !== false
            && parsedReview.candidateId
            && parsedReview.status === 'pending-review'
            && parsedReview.candidateId !== turnState.lastKnowledgePromptCandidateId
          ) {
            writeTurnState(root, {
              ...turnState,
              lastKnowledgePromptCandidateId: parsedReview.candidateId,
              lastKnowledgePromptAt: now(),
            });
            const userFacingMessage = String(parsedReview.userFacingExperience?.message || '').trim();
            return allowHook([
              'OpenPrd 在本轮收工回顾里发现了一条适合沉淀为当前项目经验的内容。',
              '请在最终回复结尾主动用下面这段结构化人话询问用户，不要改成内部术语，也不要提 Draft Skill、candidate、promote、路径或命令：',
              userFacingMessage || [
                '这次我观察到一个以后可能重复出现的情况：',
                '这次任务里已经形成了一种以后可能重复出现的处理方式。',
                '',
                '我计划保留一条项目经验：',
                '以后再遇到类似任务时，我会优先复用这次已经验证过的处理顺序和注意事项。',
                '',
                '以后如果再遇到类似任务，我会优先按这套经验来处理，减少重复解释和重复判断。',
                '这条经验只会保留在当前项目里。',
                '要我把它一起保留下来吗？',
              ].join('\n'),
              parsedReview.suggestedLearnCommand
                ? `如果用户明确同意，再执行：${parsedReview.suggestedLearnCommand}`
                : null,
              `如果用户明确表示暂不保留，执行：openprd knowledge reject --path . --id ${parsedReview.candidateId} --reason "<用户原话>"`,
              `如果用户表示先不处理、以后再说，执行：openprd knowledge archive --path . --id ${parsedReview.candidateId} --reason "<用户原话>"`,
            ].filter(Boolean).join('\n'));
          }
        } catch {}
      }
    }
    const run = runOpenPrd(['run', '.', '--context', '--json'], root);
    if (run.ok) {
      try {
        const parsed = JSON.parse(run.stdout);
        const command = parsed?.recommendation?.command || '';
        if (command && !/openprd\s+next\s+\./.test(command)) {
          return {
            continue: true,
            systemMessage: `OpenPrd still has a hook-driven next action:\n${parsed.recommendation.title}\nSuggested command: ${command}`,
          };
        }
      } catch {}
    }
  }

  appendEvent(root, { ...baseEvent, outcome: 'noop' });
  recordRunHook(root, baseEvent, 'noop');
  updateHookState(root, baseEvent);
return allowHook();
}
