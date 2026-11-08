/*
## 核心功能

提供公众号文章标题（H2 / H3 / H4）的轻量级装饰组件库（Heading Ornaments），
涵盖两大类高质感非 Emoji 装饰元素：
1. 纯内联 CSS 几何微件（Geometric CSS Ornaments）：双叠菱形、双色斜杠、几何折角、三点韵律阵、实心微圆点等；
2. 精选开源 Lucide 极简线条矢量图标（Micro Vector SVG Ornaments）：叶片、羽毛笔、终端符、星芒、罗盘、书卷、书签、代码等。

## 输入

- `ornamentId`: 装饰件枚举名（如 `'double-diamond'`, `'feather'`, `'leaf'`, `'terminal'` 等）
- `primaryColor`: 主题主色调（Hex 色值）
- `level`: 标题层级（`'h2' | 'h3' | 'h4'`），自动适配尺寸与对齐偏移

## 输出

- `renderHeadingOrnament(ornamentId, primaryColor, level)`: 返回纯内联样式、单件体积严格 < 350 字符的 HTML 字符串
- `VALID_HEADING_ORNAMENTS`: 支持的装饰件枚举清单

## 定位

位于 services/，属于文章标题视觉增强子模块；无 DOM 依赖，可在 Node 与浏览器环境独立运行。

## 维护规则

- 严禁使用任何 Emoji 字符。
- 单个装饰件产出的 HTML 字符串长度必须严格控制在 380 字符以内，杜绝微信草稿接口内容超长风险。
- 内联 SVG 必须携带 `data-owc-ornament="1"` 属性，供草稿同步管线识别并保持原生矢量直传。
*/

export const VALID_HEADING_ORNAMENTS = /** @type {const} */ ([
  'none',
  // 纯 CSS 几何微件
  'double-diamond',
  'slash-bar',
  'dot-matrix',
  'corner-bracket',
  'square-pip',
  'ring-dot',
  // 精选开源 Lucide 微矢量图标
  'leaf',
  'feather',
  'terminal',
  'sparkles',
  'compass',
  'book-open',
  'bookmark',
  'code',
  'layers',
  'zap',
]);

/**
 * 转换 Hex 色值为 RGB 分量
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  let c = String(hex || '').trim().replace(/^#/, '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (Number.isNaN(num) || c.length !== 6) {
    return { r: 37, g: 99, b: 235 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * 构造极简内联微矢量 SVG（单图标严格控制在 350 字符以内）
 * @param {string} innerSvgPath
 * @param {string} color
 * @param {number} size
 * @param {number} vAlign
 * @param {number} marginRight
 * @returns {string}
 */
function buildMicroSvg(innerSvgPath, color, size, vAlign, marginRight) {
  return `<svg data-owc-ornament="1" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:${vAlign}px;margin-right:${marginRight}px;">${innerSvgPath}</svg>`;
}

/**
 * 根据标题层级计算微矢量与几何件尺寸参数
 * @param {'h2' | 'h3' | 'h4'} level
 * @returns {{ svgSize: number, vAlign: number, marginRight: number, scale: number }}
 */
function getLevelMetrics(level) {
  if (level === 'h4') {
    return { svgSize: 14, vAlign: -2, marginRight: 6, scale: 0.8 };
  }
  if (level === 'h3') {
    return { svgSize: 16, vAlign: -2, marginRight: 7, scale: 0.9 };
  }
  return { svgSize: 18, vAlign: -3, marginRight: 8, scale: 1 };
}

/**
 * 渲染指定的标题装饰微件（支持 H2 / H3 / H4）
 * @param {string | undefined | null} ornamentId
 * @param {string} primaryColor
 * @param {'h2' | 'h3' | 'h4'} [level='h2']
 * @returns {string}
 */
export function renderHeadingOrnament(ornamentId, primaryColor, level = 'h2') {
  const id = typeof ornamentId === 'string' ? ornamentId.trim().toLowerCase() : '';
  if (!id || id === 'none') return '';

  const color = primaryColor || '#2563EB';
  const rgb = hexToRgb(color);
  const softColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.28)`;
  const { svgSize, vAlign, marginRight, scale } = getLevelMetrics(level);

  switch (id) {
    // === 1. 纯 CSS 几何微件 ===
    case 'double-diamond': {
      const s1 = Math.round(8 * scale);
      const s2 = Math.round(6 * scale);
      return `<span style="display:inline-block;vertical-align:middle;margin-right:${marginRight}px;"><span style="display:inline-block;width:${s1}px;height:${s1}px;background:${color};transform:rotate(45deg);"></span><span style="display:inline-block;width:${s2}px;height:${s2}px;background:${softColor};transform:rotate(45deg);margin-left:-2px;"></span></span>`;
    }

    case 'slash-bar': {
      const h = Math.round(14 * scale);
      return `<span style="display:inline-block;vertical-align:middle;margin-right:${marginRight}px;"><span style="display:inline-block;width:3px;height:${h}px;background:${color};transform:skewX(-18deg);margin-right:3px;"></span><span style="display:inline-block;width:3px;height:${Math.round(h * 0.78)}px;background:${softColor};transform:skewX(-18deg);"></span></span>`;
    }

    case 'dot-matrix': {
      const d1 = Math.max(4, Math.round(6 * scale));
      const d2 = Math.max(3, Math.round(4 * scale));
      return `<span style="display:inline-block;vertical-align:middle;margin-right:${marginRight}px;"><span style="display:inline-block;width:${d1}px;height:${d1}px;border-radius:50%;background:${color};margin-right:3px;"></span><span style="display:inline-block;width:${d2}px;height:${d2}px;border-radius:50%;background:${softColor};"></span></span>`;
    }

    case 'corner-bracket': {
      const sz = Math.round(9 * scale);
      return `<span style="display:inline-block;width:${sz}px;height:${sz}px;border-top:2px solid ${color};border-left:2px solid ${color};vertical-align:middle;margin-right:${marginRight - 1}px;margin-top:-3px;"></span>`;
    }

    case 'square-pip': {
      const sz = Math.max(6, Math.round(8 * scale));
      return `<span style="display:inline-block;width:${sz}px;height:${sz}px;background:${color};border-radius:2px;box-shadow:3px 3px 0 ${softColor};vertical-align:middle;margin-right:${marginRight + 2}px;margin-top:-2px;"></span>`;
    }

    case 'ring-dot': {
      const sz = Math.max(7, Math.round(9 * scale));
      return `<span style="display:inline-block;width:${sz}px;height:${sz}px;border:2px solid ${color};border-radius:50%;box-sizing:border-box;vertical-align:middle;margin-right:${marginRight}px;margin-top:-2px;"></span>`;
    }

    // === 2. 精选开源 Lucide 微矢量图标 ===
    case 'leaf':
      return buildMicroSvg(
        '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.8-5.4 5.1-6C9.5 14.5 12 13 13 12"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'feather':
      return buildMicroSvg(
        '<path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5zM16 8 2 22M17.5 15H9"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'terminal':
      return buildMicroSvg(
        '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'sparkles':
      return buildMicroSvg(
        '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'compass':
      return buildMicroSvg(
        '<circle cx="12" cy="12" r="10"/><polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'book-open':
      return buildMicroSvg(
        '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'bookmark':
      return buildMicroSvg(
        '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'code':
      return buildMicroSvg(
        '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'layers':
      return buildMicroSvg(
        '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'zap':
      return buildMicroSvg(
        '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    default:
      return '';
  }
}
