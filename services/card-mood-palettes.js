/*
## 核心功能

小红书 11 套爆款情绪调色盘（Note to RED 来源，MIT 开源协议适配）。
仅提供高质感底色与纯粹排版 Token，严禁任何头像/UID 噪音挂件。

Note to RED palette tokens adapted under MIT License: Copyright (c) 2026 x-supermeng / noterelay

## 输入

无运行时输入（纯数据常量导出）。

## 输出

- `MOOD_PALETTE_THEME_IDS`: 11 套情绪调色盘 ID 列表
- `MOOD_PALETTE_THEMES`: 11 套调色盘完整 Token 与封面风格配置对象

## 定位

位于 services/，卡片排版主题的色盘扩展层；供 card-themes.js 聚合导出。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 遵循单一职责，新增卡片调色盘在此扩展，避免造成 card-themes.js 体量超标。
*/

export const MOOD_PALETTE_THEME_IDS = /** @type {const} */ ([
  "warm",
  "cyber",
  "ocean",
  "forest",
  "elegant",
  "sakura",
  "metal",
  "starry",
  "minimal-white",
  "yueling",
  "dark-night",
]);

/** @type {Record<string, import('./card-themes.js').CardTheme>} */
export const MOOD_PALETTE_THEMES = {
  "warm": {
    id: "warm",
    name: "暖阳文艺",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#FFFAF5",
      cardBackground: "#FFF6E9",
      cardShadow:
        "0 4px 6px -1px rgba(90, 74, 66, 0.08), 0 2px 4px -1px rgba(90, 74, 66, 0.04)",
      textColor: "#5A4A42",
      textColorSecondary: "#8C7A70",
      accentColor: "#D2691E",
      borderColor: "#EADCCF",
      codeBackground: "#F5ECE1",
      quoteBackground: "#D2691E14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "magazine",
  },
  "cyber": {
    id: "cyber",
    name: "赛博朋克",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#FFFFFF",
      cardBackground: "#F8F8F8",
      cardShadow: "0 0 15px rgba(255, 0, 255, 0.15)",
      textColor: "#333333",
      textColorSecondary: "#666666",
      accentColor: "#FF00FF",
      borderColor: "#E5E5E5",
      codeBackground: "#EEEEEE",
      quoteBackground: "#FF00FF14",
      headingWeight: "800",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "neon",
  },
  "ocean": {
    id: "ocean",
    name: "深海之境",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#0A192F",
      cardBackground: "#112A45",
      cardShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.5)",
      textColor: "#E6F7FF",
      textColorSecondary: "#8BB4D9",
      accentColor: "#40A9FF",
      borderColor: "#1E3D5F",
      codeBackground: "#0F243E",
      quoteBackground: "#40A9FF14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
  "forest": {
    id: "forest",
    name: "森林清晨",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#17231E",
      cardBackground: "#243830",
      cardShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.4)",
      textColor: "#F1FFF6",
      textColorSecondary: "#A2C4B3",
      accentColor: "#68E6A0",
      borderColor: "#2E473D",
      codeBackground: "#1D2C26",
      quoteBackground: "#68E6A014",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
  "elegant": {
    id: "elegant",
    name: "优雅暗色",
    tokens: {
      fontFamily: '"Songti SC", "Noto Serif SC", "SimSun", Georgia, serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#1A1721",
      cardBackground: "#2A2433",
      cardShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
      textColor: "#C4B8DD",
      textColorSecondary: "#9A8DB0",
      accentColor: "#B490FF",
      borderColor: "#3D344B",
      codeBackground: "#241E2D",
      quoteBackground: "#B490FF14",
      headingWeight: "600",
      pagePadding: 28,
      contentGap: 16,
    },
    coverStyle: "luxury",
  },
  "sakura": {
    id: "sakura",
    name: "樱花飞舞",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#1F1A1D",
      cardBackground: "#2D2428",
      cardShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.4)",
      textColor: "#FFF5F7",
      textColorSecondary: "#C99BAA",
      accentColor: "#FF69B4",
      borderColor: "#44343B",
      codeBackground: "#292125",
      quoteBackground: "#FF69B414",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
  "metal": {
    id: "metal",
    name: "金属科技",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#1E2228",
      cardBackground: "#282C34",
      cardShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.4)",
      textColor: "#E0E0E0",
      textColorSecondary: "#9DA5B4",
      accentColor: "#4D8EE7",
      borderColor: "#3E4451",
      codeBackground: "#21252B",
      quoteBackground: "#4D8EE714",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "magazine",
  },
  "starry": {
    id: "starry",
    name: "星空梦境",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#0D0F1A",
      cardBackground: "#252640",
      cardShadow: "0 0 20px rgba(155, 89, 182, 0.25)",
      textColor: "#F0E6FF",
      textColorSecondary: "#A89AC5",
      accentColor: "#9B59B6",
      borderColor: "#3A3B59",
      codeBackground: "#1B1D30",
      quoteBackground: "#9B59B614",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "neon",
  },
  "minimal-white": {
    id: "minimal-white",
    name: "极简纯白",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#FFFFFF",
      cardBackground: "#F5F5F5",
      cardShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
      textColor: "#444444",
      textColorSecondary: "#777777",
      accentColor: "#6C9EB8",
      borderColor: "#E5E5E5",
      codeBackground: "#EEEEEE",
      quoteBackground: "#6C9EB814",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "magazine",
  },
  "yueling": {
    id: "yueling",
    name: "悦灵雅棕",
    tokens: {
      fontFamily: '"Songti SC", "Noto Serif SC", "SimSun", Georgia, serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#1C1C1E",
      cardBackground: "#2C2C2E",
      cardShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.5)",
      textColor: "#FFFFFF",
      textColorSecondary: "#B0B0B5",
      accentColor: "#C57512",
      borderColor: "#48484A",
      codeBackground: "#252528",
      quoteBackground: "#C5751214",
      headingWeight: "600",
      pagePadding: 28,
      contentGap: 16,
    },
    coverStyle: "luxury",
  },
  "dark-night": {
    id: "dark-night",
    name: "暗夜深空",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#1C1C1E",
      cardBackground: "#2C2C2E",
      cardShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.5)",
      textColor: "#F2F2F7",
      textColorSecondary: "#98989D",
      accentColor: "#0A84FF",
      borderColor: "#38383A",
      codeBackground: "#252528",
      quoteBackground: "#0A84FF14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
};

/**
 * @typedef {{
 *   fontFamily: string,
 *   fontFamilyMono: string,
 *   headingFontFamily?: string,
 *   background: string,
 *   cardBackground: string,
 *   cardShadow: string,
 *   textColor: string,
 *   textColorSecondary: string,
 *   accentColor: string,
 *   borderColor: string,
 *   codeBackground: string,
 *   quoteBackground: string,
 *   headingWeight: string,
 *   pagePadding: number,
 *   contentGap: number,
 * }} CardThemeTokens
 */

/**
 * 为 11 款情绪调色盘生成专属个性化自适应封面构图 CSS
 * @param {string} themeId
 * @param {CardThemeTokens} t
 * @returns {string}
 */
export function getMoodPaletteCoverCss(themeId, t) {
  switch (themeId) {
    case 'warm':
      return `
.icard-cover--warm.icard-cover--adaptive { padding: 20px 20px 24px; }
.icard-cover--warm.icard-cover--adaptive .icard-cover-hero {
  width: calc(100% + 40px); height: 260px; min-height: 180px;
  margin: -20px -20px 14px; border-radius: 0 0 16px 16px; overflow: hidden;
  box-shadow: 0 8px 20px rgba(90, 74, 66, 0.12);
}
.icard-cover--warm.icard-cover--adaptive .icard-cover-hero-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.icard-cover--warm.icard-cover--adaptive .icard-cover-title {
  font-size: 25px; line-height: 1.35; margin-top: 4px;
}
.icard-cover--warm.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 40px; height: 3px; border-radius: 999px;
  background: ${t.accentColor}; margin: 10px 0 0;
}
`;
    case 'cyber':
      return `
.icard-cover--cyber.icard-cover--adaptive .icard-cover-frame {
  order: -1; width: calc(100% + 40px); height: 240px; min-height: 170px;
  margin: -18px -20px 14px; border-radius: 0; overflow: hidden;
  border-bottom: 2px solid ${t.accentColor};
  box-shadow: 0 0 20px rgba(255, 0, 255, 0.25);
}
.icard-cover--cyber.icard-cover--adaptive .icard-cover-frame-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  filter: contrast(1.1) saturate(1.2);
}
.icard-cover--cyber.icard-cover--adaptive .icard-cover-title {
  font-weight: 800; letter-spacing: -0.5px;
}
.icard-cover--cyber.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 48px; height: 3px;
  background: ${t.accentColor}; margin: 8px 0 0;
  box-shadow: 0 0 10px ${t.accentColor};
}
`;
    case 'ocean':
      return `
.icard-cover--ocean.icard-cover--adaptive .icard-cover-body {
  display: flex; flex-direction: column;
}
.icard-cover--ocean.icard-cover--adaptive .icard-cover-kicker { order: 1; margin-bottom: 6px; }
.icard-cover--ocean.icard-cover--adaptive .icard-cover-title {
  order: 2; font-size: 24px; line-height: 1.3; margin: 0 0 4px;
}
.icard-cover--ocean.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 36px; height: 3px; border-radius: 999px;
  background: ${t.accentColor}; margin: 8px 0 0;
}
.icard-cover--ocean.icard-cover--adaptive .icard-cover-frame {
  order: 3; width: calc(100% + 40px); height: 210px; min-height: 150px;
  margin: 12px -20px 10px; border-radius: 0; overflow: hidden;
}
.icard-cover--ocean.icard-cover--adaptive .icard-cover-frame-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
}
.icard-cover--ocean.icard-cover--adaptive .icard-cover-excerpt { order: 4; }
.icard-cover--ocean.icard-cover--adaptive .icard-cover-meta { order: 8; margin-top: auto; }
`;
    case 'forest':
      return `
.icard-cover--forest.icard-cover--adaptive .icard-cover-frame {
  order: -1; width: calc(100% + 40px); height: 275px; min-height: 190px;
  margin: -18px -20px 12px; border-radius: 0; overflow: hidden;
}
.icard-cover--forest.icard-cover--adaptive .icard-cover-frame-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 65%, rgba(0,0,0,0.4) 85%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 65%, rgba(0,0,0,0.4) 85%, rgba(0,0,0,0) 100%);
}
.icard-cover--forest.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 32px; height: 2.5px; border-radius: 999px;
  background: ${t.accentColor}; margin: 12px auto 0;
}
`;
    case 'elegant':
      return `
.icard-cover--elegant.icard-cover--adaptive { padding: 22px; }
.icard-cover--elegant.icard-cover--adaptive .icard-cover-arch {
  width: calc(100% + 8px); height: 236px; min-height: 170px;
  margin: 6px -4px 14px; border: 1px solid ${t.borderColor}; border-radius: 4px;
  overflow: hidden; box-shadow: inset 0 0 16px rgba(0,0,0,0.4);
}
.icard-cover--elegant.icard-cover--adaptive .icard-cover-arch-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.icard-cover--elegant.icard-cover--adaptive .icard-cover-title {
  font-family: ${t.fontFamily}; font-size: 24px; letter-spacing: 0.5px;
}
.icard-cover--elegant.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 28px; height: 2px;
  background: ${t.accentColor}; margin: 12px auto 0;
}
`;
    case 'sakura':
      return `
.icard-cover--sakura.icard-cover--adaptive .icard-cover-frame {
  order: -1; width: calc(100% - 12px); height: 240px; min-height: 170px;
  margin: 0 auto 16px; border-radius: 14px; overflow: hidden;
  box-shadow: 0 8px 24px rgba(255, 105, 180, 0.18), 0 0 0 1px rgba(255, 105, 180, 0.25);
}
.icard-cover--sakura.icard-cover--adaptive .icard-cover-frame-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.icard-cover--sakura.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 36px; height: 2.5px; border-radius: 999px;
  background: ${t.accentColor}; margin: 10px auto 0;
}
`;
    case 'metal':
      return `
.icard-cover--metal.icard-cover--adaptive .icard-cover-hero {
  width: calc(100% + 40px); height: 250px; min-height: 180px;
  margin: -18px -20px 14px; border-radius: 0; overflow: hidden;
  border-bottom: 2px solid ${t.borderColor};
}
.icard-cover--metal.icard-cover--adaptive .icard-cover-hero-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.icard-cover--metal.icard-cover--adaptive .icard-cover-title {
  font-family: ${t.fontFamilyMono}; font-weight: 800; letter-spacing: -0.5px;
}
.icard-cover--metal.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 44px; height: 3px;
  background: ${t.accentColor}; margin: 8px 0 0;
}
`;
    case 'starry':
      return `
.icard-cover--starry.icard-cover--has-image .icard-cover-bg {
  filter: saturate(1.2) brightness(0.85);
}
.icard-cover--starry .icard-cover-cyber-overlay {
  background: radial-gradient(circle at 50% 30%, rgba(155, 89, 182, 0.25) 0%, rgba(13, 15, 26, 0.75) 70%, rgba(13, 15, 26, 0.95) 100%);
}
.icard-cover--starry.icard-cover--adaptive .icard-cover-title {
  text-shadow: 0 0 16px rgba(155, 89, 182, 0.6);
}
`;
    case 'minimal-white':
      return `
.icard-cover--minimal-white.icard-cover--adaptive { padding: 26px 24px; }
.icard-cover--minimal-white.icard-cover--adaptive .icard-cover-hero {
  width: 100%; height: 230px; min-height: 160px;
  margin: 0 0 18px; border-radius: 6px; overflow: hidden;
  border: 1px solid ${t.borderColor}; box-shadow: 0 4px 12px rgba(0,0,0,0.04);
}
.icard-cover--minimal-white.icard-cover--adaptive .icard-cover-hero-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.icard-cover--minimal-white.icard-cover--adaptive .icard-cover-title {
  font-weight: 600; letter-spacing: -0.2px;
}
.icard-cover--minimal-white.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 24px; height: 2px;
  background: ${t.accentColor}; margin: 10px 0 0;
}
`;
    case 'yueling':
      return `
.icard-cover--yueling.icard-cover--adaptive { padding: 22px; }
.icard-cover--yueling.icard-cover--adaptive .icard-cover-arch {
  width: calc(100% - 16px); height: 250px; min-height: 180px;
  margin: 0 auto 16px; border-radius: 120px 120px 8px 8px; overflow: hidden;
  border: 1.5px solid ${t.accentColor}; box-shadow: 0 10px 25px rgba(0,0,0,0.45);
}
.icard-cover--yueling.icard-cover--adaptive .icard-cover-arch-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.icard-cover--yueling.icard-cover--adaptive .icard-cover-title {
  font-family: ${t.fontFamily}; font-size: 24px;
}
.icard-cover--yueling.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 32px; height: 2px;
  background: ${t.accentColor}; margin: 12px auto 0;
}
`;
    case 'dark-night':
      return `
.icard-cover--dark-night.icard-cover--adaptive .icard-cover-frame {
  order: -1; width: calc(100% + 40px); height: 220px; min-height: 160px;
  margin: -18px -20px 14px; border-radius: 0; overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
}
.icard-cover--dark-night.icard-cover--adaptive .icard-cover-frame-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  filter: contrast(1.05) brightness(0.9);
}
.icard-cover--dark-night.icard-cover--adaptive .icard-cover-title {
  letter-spacing: 1px;
}
.icard-cover--dark-night.icard-cover--adaptive .icard-cover-title::after {
  content: ""; display: block; width: 30px; height: 2px;
  background: ${t.accentColor}; margin: 12px auto 0;
}
`;
    default:
      return '';
  }
}
