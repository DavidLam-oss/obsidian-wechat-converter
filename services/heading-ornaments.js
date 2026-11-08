/*
## 核心功能

提供公众号文章标题（H2 / H3 / H4）的轻量级装饰组件库（Heading Ornaments），
采用「内置精选库 + 自定义 Path 矢量」双轨制架构：
1. 纯内联 CSS 几何微件：双叠菱形、双色斜杠、三点圆点阵、杂志折角框、叠影方块、几何圆环；
2. 精选开源 Lucide 极简线条矢量微件（33 款）：涵盖生活、日常、思考、商业、科技等全场景；
3. 自定义 SVG 路径渲染：支持通过 `customPath` / `h3CustomPath` / `h4CustomPath` 传入标准 24x24 视口的 SVG path d 坐标，
   自动嵌入安全外框与微信豁免属性，赋予 AI 无限自由度。

## 输入

- `ornamentId`: 装饰件枚举名（如 `'leaf'`, `'coffee'`, `'heart'` 等）
- `customPath`: 自定义 SVG 路径 d 属性字符串
- `primaryColor`: 主题主色调（Hex 色值）
- `level`: 标题层级（`'h2' | 'h3' | 'h4'`），自动适配尺寸与对齐偏移

## 输出

- `resolveAndRenderHeadingOrnament(headingConfig, primaryColor, level)`: 统一双轨解析器
- `renderHeadingOrnament(ornamentId, primaryColor, level)`: 内置枚举渲染
- `renderCustomHeadingPath(customPath, primaryColor, level)`: 自定义 Path 渲染
- `VALID_HEADING_ORNAMENTS`: 支持的内置装饰件枚举清单

## 定位

位于 services/，属于文章标题视觉增强子模块；无 DOM 依赖，可在 Node 与浏览器环境独立运行。

## 维护规则

- 严禁使用任何 Emoji 字符。
- 单个装饰件产出的 HTML 字符串长度必须严格控制在 380 字符以内，杜绝微信草稿接口内容超长风险。
- 内联 SVG 必须携带 `data-owc-ornament="1"` 属性，供草稿同步管线识别并保持原生矢量直传。
*/

export const VALID_HEADING_ORNAMENTS = /** @type {const} */ ([
  'none',
  // 1. 纯 CSS 几何微件 (6 款)
  'double-diamond',
  'slash-bar',
  'dot-matrix',
  'corner-bracket',
  'square-pip',
  'ring-dot',
  // 2. 精选开源 Lucide 微矢量图标 (33 款)
  // -- 自然与生活 --
  'leaf',
  'coffee',
  'heart',
  'star',
  'sun',
  'moon',
  'music',
  'camera',
  'smile',
  // -- 文学与思考 --
  'feather',
  'book-open',
  'bookmark',
  'lightbulb',
  'pen',
  'paperclip',
  // -- 商业与效率 --
  'compass',
  'target',
  'trending-up',
  'award',
  'flag',
  'briefcase',
  'shield-check',
  'shield',
  'check',
  'bell',
  // -- 极客与技术 --
  'terminal',
  'code',
  'layers',
  'zap',
  'sparkles',
  'globe',
  'database',
  'key',
  'message-square',
]);

const SVG_PATH_REGEX = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;

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
 * 构造极简内联微矢量 SVG（单图标严格控制在 380 字符以内）
 * @param {string} innerSvgContent
 * @param {string} color
 * @param {number} size
 * @param {number} vAlign
 * @param {number} marginRight
 * @returns {string}
 */
function buildMicroSvg(innerSvgContent, color, size, vAlign, marginRight) {
  return `<svg data-owc-ornament="1" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:${vAlign}px;margin-right:${marginRight}px;">${innerSvgContent}</svg>`;
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
 * 校验并渲染自定义 SVG 路径（支持 24x24 视口的 path d 属性）
 * @param {unknown} customPath
 * @param {string} primaryColor
 * @param {'h2' | 'h3' | 'h4'} [level='h2']
 * @returns {string}
 */
export function renderCustomHeadingPath(customPath, primaryColor, level = 'h2') {
  if (typeof customPath !== 'string') return '';
  const d = customPath.trim();
  // 严格长度限制（400 字符以内）与纯坐标字符校验，杜绝脚本注入
  if (!d || d.length > 400 || !SVG_PATH_REGEX.test(d)) return '';

  const color = primaryColor || '#2563EB';
  const { svgSize, vAlign, marginRight } = getLevelMetrics(level);
  return buildMicroSvg(`<path d="${d}"/>`, color, svgSize, vAlign, marginRight);
}

/**
 * @typedef {{
 *   ornament?: string,
 *   customPath?: string,
 * }} HeadingOrnamentConfig
 */

/**
 * 统一解析并渲染标题装饰（双轨制：优先内置枚举，兜底自定义 customPath）
 * @param {HeadingOrnamentConfig | null | undefined} headingConfig
 * @param {string} primaryColor
 * @param {'h2' | 'h3' | 'h4'} [level='h2']
 * @returns {string}
 */
export function resolveAndRenderHeadingOrnament(headingConfig, primaryColor, level = 'h2') {
  if (!headingConfig || typeof headingConfig !== 'object') return '';
  if (headingConfig.ornament && headingConfig.ornament !== 'none') {
    const rendered = renderHeadingOrnament(headingConfig.ornament, primaryColor, level);
    if (rendered) return rendered;
  }
  if (headingConfig.customPath) {
    return renderCustomHeadingPath(headingConfig.customPath, primaryColor, level);
  }
  return '';
}

/**
 * 渲染内置的标题装饰微件（支持 H2 / H3 / H4）
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

    case 'coffee':
      return buildMicroSvg(
        '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM6 2v2M10 2v2M14 2v2"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'heart':
      return buildMicroSvg(
        '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'star':
      return buildMicroSvg(
        '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'sun':
      return buildMicroSvg(
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M6.3 17.7l-1.4 1.4m14.2-14.2-1.4 1.4"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'moon':
      return buildMicroSvg(
        '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'music':
      return buildMicroSvg(
        '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'camera':
      return buildMicroSvg(
        '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'target':
      return buildMicroSvg(
        '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'lightbulb':
      return buildMicroSvg(
        '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'trending-up':
      return buildMicroSvg(
        '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'shield-check':
      return buildMicroSvg(
        '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'shield':
      return buildMicroSvg(
        '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'award':
      return buildMicroSvg(
        '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 18 22l-6-3-6 3 2.5-8.5"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'flag':
      return buildMicroSvg(
        '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'briefcase':
      return buildMicroSvg(
        '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'message-square':
      return buildMicroSvg(
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'globe':
      return buildMicroSvg(
        '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'paperclip':
      return buildMicroSvg(
        '<path d="m21.4 11-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-2.8-2.8l7.8-7.8"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'pen':
      return buildMicroSvg(
        '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'check':
      return buildMicroSvg(
        '<polyline points="20 6 9 17 4 12"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'bell':
      return buildMicroSvg(
        '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'smile':
      return buildMicroSvg(
        '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'database':
      return buildMicroSvg(
        '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    case 'key':
      return buildMicroSvg(
        '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
        color,
        svgSize,
        vAlign,
        marginRight
      );

    default:
      return '';
  }
}
