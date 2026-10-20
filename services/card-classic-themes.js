/*
## 核心功能

图片卡片经典六套内置主题（2026-09-13 照搬 xiaoweibox-mono red-note themes.ts）。
提供基础经典六主题定义（Token 与 coverStyle 四式）。

## 输入

无运行时输入（纯数据常量导出）。

## 输出

- `CLASSIC_CARD_THEME_IDS`: 六套经典主题 ID 列表
- `CLASSIC_CARD_THEMES`: 六套主题完整 Token 与封面风格配置对象

## 定位

位于 services/，卡片经典主题数据层；供 card-themes.js 聚合导出。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 六主题（simple-white, gradient-blue, dark-gold, neon-purple, forest-green, rose-gold）保持 token 齐备与显式定义。
*/

export const CLASSIC_CARD_THEME_IDS = /** @type {const} */ ([
  "simple-white",
  "gradient-blue",
  "dark-gold",
  "neon-purple",
  "forest-green",
  "rose-gold",
]);

/** @type {Record<string, import('./card-themes.js').CardTheme>} */
export const CLASSIC_CARD_THEMES = {
  "simple-white": {
    id: "simple-white",
    name: "极简白",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#f3f4f6",
      cardBackground: "#ffffff",
      cardShadow:
        "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      textColor: "#1f2937",
      textColorSecondary: "#6b7280",
      accentColor: "#ef4444",
      borderColor: "#e5e7eb",
      codeBackground: "#f6f8fa",
      quoteBackground: "#ef444414",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "magazine",
  },
  "gradient-blue": {
    id: "gradient-blue",
    name: "渐变蓝",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%)",
      cardBackground: "rgba(255, 255, 255, 0.95)",
      cardShadow:
        "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      textColor: "#0f172a",
      textColorSecondary: "#64748b",
      accentColor: "#2563eb",
      borderColor: "#dbeafe",
      codeBackground: "#eff6ff",
      quoteBackground: "#2563eb14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
  "dark-gold": {
    id: "dark-gold",
    name: "黑金",
    tokens: {
      fontFamily: '"Songti SC", "Noto Serif SC", "SimSun", Georgia, serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#18181b",
      cardBackground: "#27272a",
      cardShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
      textColor: "#e4e4e7",
      textColorSecondary: "#a1a1aa",
      accentColor: "#f59e0b",
      borderColor: "#78350f",
      codeBackground: "#3f3f46",
      quoteBackground: "#f59e0b14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 16,
    },
    coverStyle: "luxury",
  },
  "neon-purple": {
    id: "neon-purple",
    name: "霓虹紫",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#020617",
      cardBackground: "rgba(30, 27, 75, 0.9)",
      cardShadow: "0 0 20px rgba(192, 132, 252, 0.3)",
      textColor: "#f3e8ff",
      textColorSecondary: "#c4b5fd",
      accentColor: "#e879f9",
      borderColor: "#701a75",
      codeBackground: "#1e1b4b",
      quoteBackground: "#e879f914",
      headingWeight: "800",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "neon",
  },
  "forest-green": {
    id: "forest-green",
    name: "森林绿",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "linear-gradient(135deg, #064e3b 0%, #047857 100%)",
      cardBackground: "rgba(16, 185, 129, 0.1)",
      cardShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
      textColor: "#d1fae5",
      textColorSecondary: "#a7f3d0",
      accentColor: "#fcd34d",
      borderColor: "#065f46",
      codeBackground: "rgba(6, 78, 59, 0.6)",
      quoteBackground: "#fcd34d14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
  "rose-gold": {
    id: "rose-gold",
    name: "玫瑰金",
    tokens: {
      fontFamily: '"Songti SC", "Noto Serif SC", "SimSun", Georgia, serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
      cardBackground: "#ffffff",
      cardShadow: "0 10px 25px -5px rgba(244, 114, 182, 0.2)",
      textColor: "#831843",
      textColorSecondary: "#9d6b7d",
      accentColor: "#f472b6",
      borderColor: "#fbcfe8",
      codeBackground: "#fdf2f8",
      quoteBackground: "#f472b614",
      headingWeight: "600",
      pagePadding: 28,
      contentGap: 16,
    },
    coverStyle: "luxury",
  },
};
