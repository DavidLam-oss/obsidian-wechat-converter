/*
## 核心功能

实现插件设置页中的「卡片」tab（C02）：图片卡片**全局默认**的配置界面——
默认主题、默认排版（字号/行高/页面边距）、默认导出目录，以及恢复内置默认。
默认值只作为**新会话/新导出的初值**；当前笔记会话内调整不写回，也不被批量覆盖。

## 输入

接收 AppleStyleSettingTab 实例（tab.plugin.settings / tab.plugin.saveSettings）、
用户表单输入与 Obsidian API（Setting）。

## 输出

输出 `renderCardSettingsTab`：渲染卡片页签并持久化 `plugin.settings.cardDefaults`
（归一化职责在 services/plugin-settings.js，本文件只收集输入后交给归一化）。

## 定位

位于 views/settings/，设置 UI 层；排版项边界来自 services/card-settings-model.js。
一期比例仅 3:4（VERIFIED_CARD_RATIOS 未扩展），页签中如实说明、不放假控件。

## 依赖

关键依赖：`../../services/card-settings-model.js`、`../../services/card-themes.js`、
`../../services/dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 新增排版项时：先在 card-settings-model.js 扩展模型与限额，再在此加控件；
  封面/页码/水印等待 C01③ 语义落地后接入，不提前放行未生效字段。
- 恢复默认按钮只重置 cardDefaults（全局作用域），绝不触碰笔记会话与其他页签配置。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: AppleStyleSettingTab/plugin 以动态形状传入（同 feishu-tab），运行时契约由 settings 套件约束 */

import { normalizeVaultPath } from '../../services/path-utils.js';
import { DEFAULT_EXPORT_ROOT } from '../../services/card-export-paths.js';
import {
  CARD_LAYOUT_LIMITS,
  VERIFIED_CARD_THEME_IDS,
  normalizeCardLayoutSettings,
} from '../../services/card-settings-model.js';
import { getCardTheme } from '../../services/card-themes.js';
import { createDefaultCardSettings } from '../../services/plugin-settings.js';
import { getActiveWindowValue } from '../../services/dom-utils.js';

/**
 * 渲染「图片卡片」设置页签（C02 全局默认）。
 * @param {any} tab AppleStyleSettingTab 实例
 * @param {any} containerEl 页签内容容器
 * @param {{ obsidianApi?: unknown }} [options]
 * @returns {void}
 */
export function renderCardSettingsTab(tab, containerEl, options = {}) {
  const obsidian = options.obsidianApi || tab.plugin.obsidianApi || getActiveWindowValue('obsidian') || {};
  const Setting = obsidian.Setting;
  const { plugin } = tab;

  // 读写都以归一化结果为基准（与 feishu-tab 同一模式）
  const defaults = normalizeCardLayoutSettings(plugin.settings.cardDefaults || {});
  plugin.settings.cardDefaults = {
    ...defaults,
    exportRoot: normalizeVaultPath(
      typeof plugin.settings.cardDefaults?.exportRoot === 'string'
        ? plugin.settings.cardDefaults.exportRoot
        : '',
    ) || DEFAULT_EXPORT_ROOT,
  };
  const settings = plugin.settings.cardDefaults;

  containerEl.empty();

  if (typeof tab.renderSettingsTabIntro === 'function') {
    tab.renderSettingsTabIntro(
      containerEl,
      '配置图片卡片的默认主题、排版与导出目录。仅作为新笔记会话和新导出的初始值，当前笔记里已调整的排版保持不变。'
    );
  }

  containerEl.createEl('h2', { text: '图片卡片全局默认', cls: 'wechat-feishu-heading' });

  // —— 默认主题 ——（每个主题一个按钮；当前项高亮 CTA）
  const themeSetting = new Setting(containerEl)
    .setName('默认主题')
    .setDesc('新建笔记会话时使用的卡片主题。');
  for (const id of VERIFIED_CARD_THEME_IDS) {
    themeSetting.addButton((button) => {
      if (id === settings.themeId) button.setCta();
      return button
        .setButtonText(getCardTheme(id)?.name || id)
        .onClick(async () => {
          settings.themeId = id;
          await plugin.saveSettings();
          renderCardSettingsTab(tab, containerEl, options);
        });
    });
  }

  // —— 默认比例 ——（一期仅 3:4 已验证；C01 扩展后随 VERIFIED_CARD_RATIOS 放开）
  new Setting(containerEl)
    .setName('默认比例')
    .setDesc(`当前可用：${'3:4'}（一期验证范围；更多比例随后续版本开放）。`);

  // —— 排版滑块 ——
  /** @param {string} name @param {string} desc @param {{ min: number, max: number, step: number, default: number }} limit @param {'fontSize'|'lineHeight'|'pagePadding'} key */
  const addSliderSetting = (name, desc, limit, key) => {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addSlider((slider) => slider
        .setLimits(limit.min, limit.max, limit.step)
        .setValue(settings[key])
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings[key] = value;
          await plugin.saveSettings();
        })
      );
  };
  addSliderSetting('正文字号', `新建会话的默认字号（${CARD_LAYOUT_LIMITS.fontSize.min}–${CARD_LAYOUT_LIMITS.fontSize.max}px）。`, CARD_LAYOUT_LIMITS.fontSize, 'fontSize');
  addSliderSetting('行高', `默认行距（${CARD_LAYOUT_LIMITS.lineHeight.min}–${CARD_LAYOUT_LIMITS.lineHeight.max}）。`, CARD_LAYOUT_LIMITS.lineHeight, 'lineHeight');
  addSliderSetting('页面边距', `默认页面留白（${CARD_LAYOUT_LIMITS.pagePadding.min}–${CARD_LAYOUT_LIMITS.pagePadding.max}px）。`, CARD_LAYOUT_LIMITS.pagePadding, 'pagePadding');

  // —— 默认导出目录 ——
  new Setting(containerEl)
    .setName('默认导出目录')
    .setDesc('导出弹窗的初始输出目录（vault 相对路径；每次导出前仍可在弹窗内修改）。')
    .addText((text) => text
      .setPlaceholder('卡片导出')
      .setValue(settings.exportRoot)
      .onChange(async (value) => {
        settings.exportRoot = normalizeVaultPath(value) || DEFAULT_EXPORT_ROOT;
        await plugin.saveSettings();
      })
    );

  // —— 恢复内置默认（仅全局作用域）——
  new Setting(containerEl)
    .setName('恢复内置默认')
    .setDesc('把上面的全局默认恢复为出厂值。不影响当前笔记会话里已调整的排版，也不动其他页签的配置。')
    .addButton((button) => button
      .setButtonText('恢复内置默认')
      .setClass('mod-warning')
      .onClick(async () => {
        plugin.settings.cardDefaults = createDefaultCardSettings();
        await plugin.saveSettings();
        renderCardSettingsTab(tab, containerEl, options);
      })
    );
}
