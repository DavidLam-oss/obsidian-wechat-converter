/*
## 核心功能

实现 AI layout 服务的 color 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `normalizeHexColor`、`hexToRgb`、`rgbToHex`、`mixHexColor`、`createColorPaletteFromAccent`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

function normalizeHexColor(value, fallback = '#7c3aed') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/** @param {{ r: number, g: number, b: number }} rgb @returns {string} */
function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => {
    const clamped = Math.max(0, Math.min(255, Math.round(channel)));
    return clamped.toString(16).padStart(2, '0');
  }).join('')}`;
}

function mixHexColor(color, target, amount) {
  const sourceRgb = hexToRgb(color);
  const targetRgb = hexToRgb(target);
  return rgbToHex({
    r: sourceRgb.r + (targetRgb.r - sourceRgb.r) * amount,
    g: sourceRgb.g + (targetRgb.g - sourceRgb.g) * amount,
    b: sourceRgb.b + (targetRgb.b - sourceRgb.b) * amount,
  });
}

function createColorPaletteFromAccent(accentColor, { id = 'custom', label = '自定义' } = {}) {
  const accent = normalizeHexColor(accentColor);
  return {
    id,
    label,
    description: 'AI 编排独立自定义色，会根据你选择的颜色自动派生深色、浅底和边框。',
    recommendedFor: ['custom'],
    tokens: {
      accent,
      accentDeep: mixHexColor(accent, '#000000', 0.28),
      accentSoft: mixHexColor(accent, '#ffffff', 0.9),
      text: mixHexColor(accent, '#1f2937', 0.78),
      muted: mixHexColor(accent, '#6b7280', 0.72),
      border: mixHexColor(accent, '#ffffff', 0.78),
      surface: '#ffffff',
      surfaceSoft: mixHexColor(accent, '#ffffff', 0.96),
      quoteBg: mixHexColor(accent, '#ffffff', 0.93),
    },
  };
}

export {
  normalizeHexColor,
  hexToRgb,
  rgbToHex,
  mixHexColor,
  createColorPaletteFromAccent,
};
