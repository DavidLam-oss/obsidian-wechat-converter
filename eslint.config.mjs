/*
## 核心功能

定义仓库 ESLint 规则、扫描边界和 Obsidian review 风险约束。

## 输入

接收 ESLint flat config 运行上下文、源码路径和项目 lint 脚本。

## 输出

输出 lint 配置数组，供 npm run lint 与 scan:guard 使用。

## 定位

位于根目录，是质量工具配置，不参与插件运行时。

## 依赖

关键依赖：`@eslint/js`、`globals`、`eslint-plugin-obsidianmd`、`@microsoft/eslint-plugin-sdl`、`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 根目录 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import js from "@eslint/js";
import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";
import sdl from "@microsoft/eslint-plugin-sdl";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} pluginModule
 * @returns {Record<string, unknown>}
 */
function normalizePluginModule(pluginModule) {
  if (isRecord(pluginModule) && isRecord(pluginModule.default)) {
    return pluginModule.default;
  }
  return isRecord(pluginModule) ? pluginModule : {};
}

const typedParserOptions = {
  project: "./tsconfig.json",
  tsconfigRootDir: import.meta.dirname,
};

export default [
  js.configs.recommended,
  {
    plugins: {
      obsidianmd: normalizePluginModule(/** @type {unknown} */ (obsidianmd)),
      "@microsoft/sdl": normalizePluginModule(/** @type {unknown} */ (sdl)),
      "@typescript-eslint": normalizePluginModule(/** @type {unknown} */ (tsPlugin)),
    },
  },
  // Default CommonJS settings for plugin source files
  {
    files: ["**/*.js"],
    languageOptions: {
      parser: tsParser,
      parserOptions: typedParserOptions,
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
        // Obsidian APIs & globals
        obsidian: "readonly",
        moment: "readonly",
        createFragment: "readonly",
        // Third-party globals loaded by the app
        hljs: "readonly",
        markdownit: "readonly",
        // Project specific globals to ignore
        AppleTheme: "readonly",
        AppleStyleConverter: "readonly",
        ActiveTripletRenderer: "readonly",
        ActiveTripletSerializer: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-empty": "warn",
      "no-prototype-builtins": "off",
      "no-useless-escape": "off",
      "no-constant-condition": "off",
      "no-cond-assign": "off",
      "no-redeclare": "off",
      "no-extra-semi": "off",
      "no-inner-declarations": "off",
      "no-control-regex": "off", // Allow regex to check control characters like \x00
      "no-console": ["warn", { allow: ["warn", "error", "debug"] }],
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-unsupported-api": "error",
      "obsidianmd/settings-tab/require-display": "warn",
      "obsidianmd/settings-tab/prefer-setting-definitions": "warn",
      "@microsoft/sdl/no-inner-html": "error",
      "@typescript-eslint/triple-slash-reference": ["warn", { path: "never" }],
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
    },
  },
  // Targeted ESM leaf modules. Keep this list explicit so the plugin entry
  // and dynamic Obsidian integration files can stay CommonJS until migrated.
  {
    files: [
      "eslint.config.mjs",
      "input.js",
      "services/concurrency.js",
      "services/custom-css-compiler.js",
      "services/custom-css-inliner.js",
      "services/custom-css-source.js",
      "services/pseudo-element-renderer.js",
      "services/markdown-utils.js",
      "services/ai-layout-records.js",
      "services/ai-layout-cache.js",
      "services/ai-layout.js",
      "services/ai-layout/block-utils.js",
      "services/ai-layout/catalog.js",
      "services/ai-layout/color.js",
      "services/ai-layout/constants.js",
      "services/ai-layout/generation.js",
      "services/ai-layout/index.js",
      "services/ai-layout/layout-normalization.js",
      "services/ai-layout/prompt-context.js",
      "services/ai-layout/providers.js",
      "services/ai-layout/render.js",
      "services/ai-layout/schema-validation.js",
      "services/ai-layout/selection.js",
      "services/ai-layout/settings.js",
      "services/ai-layout/state-cache.js",
      "services/ai-layout/utils.js",
      "services/ai-layout-runtime/generated-skills.js",
      "services/ai-layout-runtime/registry.js",
      "services/ai-layout-skill-bundle.js",
      "services/article-image-assets.js",
      "services/chinese-punctuation.js",
      "services/dependency-loader.js",
      "services/dom-utils.js",
      "services/image-source-utils.js",
      "services/image-swipe-callout.js",
      "services/obsidian-compat.js",
      "services/plugin-settings.js",
      "services/obsidian-publisher-policy.js",
      "services/readable-error.js",
      "services/record-utils.js",
      "services/request-utils.js",
	      "services/feishu-api.js",
	      "services/feishu-block-sync.js",
	      "services/feishu-markdown-processor.js",
	      "services/feishu-media-sync.js",
	      "services/feishu-mermaid-renderer.js",
	      "services/feishu-mermaid-remote-renderer.js",
	      "services/feishu-multipart.js",
	      "services/feishu-settings.js",
	      "services/feishu-sync.js",
      "services/path-utils.js",
      "services/markdown-source.js",
      "services/render-pipeline.js",
      "services/obsidian-fetch-adapter.js",
      "services/native-renderer.js",
      "services/obsidian-triplet-renderer.js",
      "services/obsidian-triplet-renderer-images.js",
      "services/obsidian-triplet-serializer-images.js",
	      "services/obsidian-triplet-serializer-dom.js",
	      "services/obsidian-triplet-serializer-parity.js",
      "services/obsidian-triplet-serializer-utils.js",
      "services/obsidian-triplet-serializer.js",
      "services/rendered-mermaid.js",
      "services/svg-rasterizer.js",
      "services/sync-context.js",
      "services/wechat-draft-cache.js",
      "services/wechat-api.js",
      "services/wechat-api-utils.js",
      "services/wechat-image-transcoder.js",
      "services/wechat-html-cleaner.js",
      "services/wechat-media.js",
      "services/wechat-sync.js",
      "services/wechatsync-bridge.js",
      "services/wechatsync-bridge-runtime.js",
      "services/wechatsync-constants.js",
      "services/wechatsync-results.js",
      "services/wechatsync-settings.js",
      "views/connection-status-bar.js",
      "views/apple-style-view.js",
      "views/apple-style-view-shared.js",
      "views/shared/view-constants.js",
      "views/shared/view-dom-helpers.js",
      "views/shared/view-state-utils.js",
      "views/converter/ai-layout-debug.js",
      "views/converter/ai-layout-panel.js",
      "views/converter/clipboard.js",
      "views/converter/core.js",
      "views/converter/style-panel.js",
      "views/publish-modal/feishu.js",
      "views/publish-modal/material-picker.js",
      "views/publish-modal/multi-platform.js",
      "views/publish-modal/wechat.js",
      "views/publish-modal/wechat-account-state.js",
      "views/publish-modal/wechat-modal-shell.js",
      "views/publish-modal/wechat-multiplatform-actions.js",
      "views/publish-modal/wechat-preview-export.js",
      "views/publish-modal/wechat-sync-action.js",
      "views/publish-modal/wechat-sync-modal.js",
      "views/settings/apple-style-setting-tab.js",
      "views/settings/ai-section.js",
      "views/settings/confirm-modal.js",
      "views/settings/feishu-tab.js",
      "views/settings/settings-tab-shell.js",
      "views/settings/multi-platform-tab.js",
      "views/settings/wechat-account-modal.js",
      "views/settings/wechat-tab.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-empty": "warn",
      "no-prototype-builtins": "off",
      "no-useless-escape": "off",
      "no-constant-condition": "off",
      "no-cond-assign": "off",
      "no-extra-semi": "off",
      "no-inner-declarations": "off",
      "no-control-regex": "off",
      "obsidianmd/no-static-styles-assignment": "error",
      "@microsoft/sdl/no-inner-html": "error",
    },
  },
  // ES Modules settings for tests, scripts, and .mjs files
  {
    files: ["tests/**/*.js", "**/scripts/**/*.mjs", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        console: "readonly",
        process: "readonly",
        // vitest globals
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-empty": "warn",
      "no-prototype-builtins": "off",
      "no-useless-escape": "off",
      "no-constant-condition": "off",
      "no-cond-assign": "off",
      "no-extra-semi": "off",
      "no-inner-declarations": "off",
      "no-control-regex": "off",
      "no-console": "off",
      "@microsoft/sdl/no-inner-html": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "obsidianmd/no-unsupported-api": "off",
      "obsidianmd/settings-tab/require-display": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    }
  },
  {
    files: ["__mocks__/**/*.js", "eslint.config.mjs"],
    rules: {
      "no-console": "off",
      "@microsoft/sdl/no-inner-html": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "obsidianmd/no-unsupported-api": "off",
      "obsidianmd/settings-tab/require-display": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
  {
    files: ["**/*.d.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: typedParserOptions,
    },
    plugins: {
      "@typescript-eslint": normalizePluginModule(/** @type {unknown} */ (tsPlugin)),
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-duplicate-type-constituents": "warn",
      "@typescript-eslint/triple-slash-reference": ["warn", { path: "never" }],
    },
  },
  // CommonJS override for .cjs files
  {
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-empty": "warn",
      "no-control-regex": "off",
    }
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
  },
  {
    ignores: [
      "main.js",
      "node_modules/",
      "coverage/",
      "lib/",
      "services/generated-embedded-deps.js",
      "dist/",
      "server/",
      // Tool-generated working dirs (OpenPRD / Codex): not project source,
      // skip linting so their generated code does not pollute CI output.
      ".codex/",
      ".openprd/",
    ],
  }
];
