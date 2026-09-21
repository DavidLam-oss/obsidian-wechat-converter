/*
## 核心功能

图片卡片排版与封面设置视图（B03 / C02 重构）：卡片模式设置面板（sliders 图标呼出的侧边栏面板）。
采用所见即所得（WYSIWYG）架构（2026-09-13 David 定调）：
- 设置全量收敛至侧边栏面板，全局偏好设置中不设卡片页签（2026-09-19 David 再次确认）；
- 面板头部划分为两种形式的双子 Tab：
  1. 「排版 Token」：主题六选、比例三选、正文页码、水印文案、字号/行高/边距滑块；
  2. 「封面设置」：封面启用开关、标题/作者/日期/摘要编辑、按当前笔记重新填入（C06 配图在此扩展）。
- 预览区「封面」芯片按钮直通本面板并自动切到封面子 Tab，废弃独立的居中 Modal。

设置的作用域（2026-09-19 定稿）：
- 排版/输出元素（主题、比例、字号、行高、边距、封面开关、正文页码、水印）**调完即存为默认**——
  既作用于当前笔记会话，也写回 `plugin.settings.cardDefaults`，新建会话继承；
- 封面字段（标题/作者/日期/摘要/配图）随笔记内容走，属会话级，**不写回全局默认**；
- 导出目录不在此面板配置：内置默认「卡片导出」，用户在导出弹窗内的改动被记住为下次默认
  （见 card-export-modal-view.js 的 rememberCardExportRoot）。

## 输入

this.cardSettingsWrapper（settings-panel.js 创建的面板容器）、
当前笔记卡片会话（getCardSessions + cardPreviewPendingInput.sourcePathKey）。

## 输出

输出 `cardSettingsMethods`，由 AppleStyleView 统一组装：
- `buildCardSettingsPanel()`：一次性构建面板 DOM（含双子 Tab 与两组表单）；
- `renderCardSettingsValues()`：打开面板或会话设置变化后同步当前值；
- `switchCardSettingsSubTab(subTab)`：在「排版 Token」和「封面设置」之间切换；
- `openCardSettingsTab(tabName)`：直通打开面板并聚焦到指定子 Tab；
- `resetCardSettingsPanelViewState()`：面板每次打开时复位**视图状态**（子 Tab / 折叠组；不动任何取值）；
- `applyCardLayoutSettings(partial)`：应用一组排版设置（写会话 + 写回全局默认），触发重排版；
- `applyCardLayoutSetting(key, value)`：单键形式，等价于上一行的单键调用；
- `applyCardTheme(themeId)`：选主题＝连同该主题自带的默认排版一起应用（取代已移除的重置按钮）；
- `persistCardLayoutDefaults(partial)`：把归一化后的排版值写回 `plugin.settings.cardDefaults`（落盘节流）；
- `applyCardCoverField(key, value)`：应用封面字段编辑；
- `resetCardCoverFields()`：按当前笔记重新填入封面字段；
- `getCardSettingsSession()`：获取当前笔记会话。

## 定位

位于 views/converter/，卡片侧边栏设置面板；规则委托 services/card-settings-model.js 与 services/card-cover-model.js。

## 依赖

`services/card-settings-model.js`（限额/默认值）；`services/card-themes.js`（主题元信息）；
样式复用 styles/style-panel.css 与 styles/style-controls.css，卡片特有样式在 styles/card-settings.css。

## 维护规则

- 严格遵守单文件 800 行软线规范。
- 所有卡片设置统一收敛在侧边栏面板，不在全局插件设置重复添加排版表单
  （设置页只保留「微信 / 多平台 / 飞书 / AI 服务 / 关于」，卡片页签已摘除）。
- 新增排版项时：先在 card-settings-model.js 扩展模型与限额，再在 buildCardSettingsPanel 加控件。
  持久化的键集合由 `normalizeCardLayoutSettings` 决定——只有它输出的字段会写回 cardDefaults；
  封面字段（标题/作者/日期/摘要/配图）按设计不进该函数，因而只停留在会话级。
- 不设「恢复默认排版」按钮（2026-09-20，与文章模式对齐）：默认值就是**主题自带的默认排版**
  （`getCardThemeDefaultTypography`）。选主题即取该主题默认——在 A 主题下改乱了，去 B 再回 A，
  得到的就是 A 的默认；侧栏本身已是默认面板，再放一个重置按钮只与换主题重复。
  封面/页码/水印属输出元素（与主题无关），不随主题切换重置。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: AppleStyleView 方法组跨模块动态组合，会话等合同字段以 unknown 持有 */

import {
  CARD_LAYOUT_LIMITS,
  CARD_RATIO_LABELS,
  DEFAULT_CARD_LAYOUT_SETTINGS,
  VERIFIED_CARD_RATIOS,
  VERIFIED_CARD_THEME_IDS,
  getCardThemeDefaultTypography,
  normalizeCardLayoutSettings,
} from '../../services/card-settings-model.js';
import { getCardTheme } from '../../services/card-themes.js';
import {
  buildCardCoverSettingsSubpanel,
  renderCardCoverValues,
  renderCardCoverGroupEcho,
} from './card-cover-settings.js';

/**
 * 卡片设置视图状态（d.ts 合同以 unknown 持有，这里给运行时访问形状）。
 * @typedef {{
 *   cardSettingsWrapper?: ObsidianElementLike | null,
 *   activeCardSubTab?: 'token' | 'cover',
 *   cardSettingsRefs?: {
 *     tokenTabBtn?: ObsidianElementLike | null,
 *     coverTabBtn?: ObsidianElementLike | null,
 *     tokenSection?: ObsidianElementLike | null,
 *     coverSection?: ObsidianElementLike | null,
 *     themeGrid?: ObsidianElementLike | null,
 *     ratioGrid?: ObsidianElementLike | null,
 *     pageToggleInput?: HTMLInputElement | null,
 *     watermarkInput?: HTMLInputElement | null,
 *     tuneGroup?: HTMLDetailsElement | null,
 *     tuneValuesEl?: ObsidianElementLike | null,
 *     sliders?: Record<string, { input: HTMLInputElement, valueEl: ObsidianElementLike }>,
 *     coverToggleInput?: HTMLInputElement | null,
 *     coverFieldsHidden?: ObsidianElementLike[],
 *     coverAiDetails?: HTMLDetailsElement | null,
 *     coverAiUserToggled?: boolean,
 *     coverGroupEcho?: ObsidianElementLike | null,
 *     coverInputs?: Record<string, HTMLInputElement>,
 *     coverModeSelect?: HTMLSelectElement | null,
 *     coverStyleSelect?: HTMLSelectElement | null,
 *     coverPromptInput?: HTMLTextAreaElement | null,
 *     coverKeywordsInput?: HTMLInputElement | null,
 *     coverGenerateBtn?: HTMLButtonElement | null,
 *     coverImagePreviewWrap?: ObsidianElementLike | null,
 *     coverImagePreviewName?: ObsidianElementLike | null,
 *     coverImagePreviewMeta?: ObsidianElementLike | null,
 *     coverImageThumb?: HTMLImageElement | null,
 *     coverImageRemoveBtn?: HTMLButtonElement | null,
 *   } | null,
 *   cardDefaultsSaveTimer?: ReturnType<typeof setTimeout> | null,
 * }} CardSettingsViewStateLike
 */

/**
 * @param {unknown} view
 * @returns {CardSettingsViewStateLike}
 */
function cardSettingsStateOf(view) {
  return /** @type {CardSettingsViewStateLike} */ (view);
}

/** 滑块数值显示格式（与文章模式 `${val}px` 口径一致） */
const SLIDER_FORMAT = {
  fontSize: (v) => `${v}px`,
  lineHeight: (v) => `${v}`,
  pagePadding: (v) => `${v}px`,
};

/** 全局默认落盘节流（ms）：滑块 input 会连续触发，合并成一次 saveSettings */
const CARD_DEFAULTS_SAVE_DELAY = 400;

/** @type {CardSettingsMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardSettingsMethods = {
/** @returns {unknown} 当前笔记的卡片会话；尚未排版过时返回 null */
getCardSettingsSession() {
  const sourcePathKey = String(
    (/** @type {any} */ (this)).cardPreviewPendingInput?.sourcePathKey || '',
  );
  if (!sourcePathKey) return null;
  return /** @type {any} */ (this).getCardSessions()?.getSession(sourcePathKey) || null;
}
,

/** 一次性构建卡片设置面板 DOM（含顶部双子 Tab、排版 Token 节与封面设置节）。 */
buildCardSettingsPanel() {
  const wrapper = cardSettingsStateOf(this).cardSettingsWrapper;
  if (!wrapper) return;
  wrapper.empty();

  // —— 1. 顶部双 Tab 导航（分段胶囊：排版 Token vs 封面设置）——
  // 用「灰轨道 + 白胶囊」的分段控件，而不是 apple-btn-size 的蓝底选中态：后者与下面的
  // 主题/比例/页码是同一个类，选中态长得一模一样，页面里出现三处「蓝色选中」就分不清
  // 哪个是「我在哪个页签」、哪个是「这个值被选中了」。蓝色留给取值，导航只表达位置。
  const navWrap = wrapper.createEl('div', { cls: 'icard-settings-nav' });
  const navRow = navWrap.createEl('div', { cls: 'icard-settings-segmented' });
  const tokenTabBtn = navRow.createEl('button', {
    cls: 'icard-settings-segment is-active',
    text: '排版样式',
    attr: { type: 'button', 'data-tab': 'token', 'aria-pressed': 'true', 'title': '主题、比例、字号、边距、页脚排版参数' },
  });
  const coverTabBtn = navRow.createEl('button', {
    cls: 'icard-settings-segment',
    text: '封面设置',
    attr: { type: 'button', 'data-tab': 'cover', 'aria-pressed': 'false', 'title': '封面开关、主标题、作者、日期与摘要' },
  });

  tokenTabBtn.addEventListener('click', () => { this.switchCardSettingsSubTab('token'); });
  coverTabBtn.addEventListener('click', () => { this.switchCardSettingsSubTab('cover'); });

  // —— 2. 两个子面板容器 ——
  const tokenSection = wrapper.createEl('div', { cls: 'icard-settings-subpanel-token' });
  const coverSection = wrapper.createEl('div', { cls: 'icard-settings-subpanel-cover hidden' });

  const refs = /** @type {NonNullable<CardSettingsViewStateLike['cardSettingsRefs']>} */ ({
    tokenTabBtn,
    coverTabBtn,
    tokenSection,
    coverSection,
    themeGrid: null,
    ratioGrid: null,
    pageToggleInput: null,
    watermarkInput: null,
    tuneGroup: null,
    tuneValuesEl: null,
    sliders: {},
    coverToggleInput: null,
    coverFieldsHidden: [],
    coverAiDetails: null,
    coverAiUserToggled: false,
    coverGroupEcho: null,
    coverInputs: {},
  });
  cardSettingsStateOf(this).cardSettingsRefs = refs;
  cardSettingsStateOf(this).activeCardSubTab = 'token';

  // ========== 子 Tab 1：排版 Token 设置 ==========
  // 主题（2026-09-20 David）：2 行 × 3 列网格，单行挤 6 枚显得小气
  this.createSection(tokenSection, '主题', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-row icard-grid-3' });
    refs.themeGrid = grid;
    for (const themeId of VERIFIED_CARD_THEME_IDS) {
      const theme = getCardTheme(themeId);
      const btn = grid.createEl('button', {
        cls: 'apple-btn-size',
        text: theme.name,
        attr: { 'data-value': themeId, 'title': `${theme.name}（切换主题会一并恢复该主题的字号 / 行高 / 边距默认值）` },
      });
      btn.addEventListener('click', () => { this.applyCardTheme(themeId); });
    }
  });

  // 比例（2026-09-20 David）：参考微信工具的「形状示意 + 数值」卡片——
  // 形状本身就是最直白的说明，按钮上不再写「竖版/长竖版」文字（描述降级为 hover title）
  this.createSection(tokenSection, '比例', (section) => {
    const grid = section.createEl('div', { cls: 'icard-settings-ratios' });
    refs.ratioGrid = grid;
    for (const ratioId of VERIFIED_CARD_RATIOS) {
      const label = CARD_RATIO_LABELS[ratioId] || ratioId;
      const btn = grid.createEl('button', {
        cls: 'icard-ratio-option',
        attr: { 'data-value': ratioId, 'title': label },
      });
      btn.createEl('span', { cls: 'icard-ratio-shape', attr: { 'data-ratio': ratioId } });
      btn.createEl('span', { cls: 'icard-ratio-text', text: ratioId });
      btn.addEventListener('click', () => { this.applyCardLayoutSetting('ratioId', ratioId); });
    }
  });

  // 正文页码：开关自带状态表达，单行呈现
  this.createSection(tokenSection, '正文页码', (section) => {
    const row = section.createEl('div', { cls: 'icard-settings-toggle-row' });
    const copy = row.createEl('div', { cls: 'icard-settings-toggle-copy' });
    copy.createEl('span', { cls: 'icard-settings-toggle-label', text: '显示页脚页码' });

    // 外层用 div 而非 label：label 会把点击再次转派给 input，和下面的整行点击叠加成「点一下翻两次」
    const toggle = row.createEl('div', { cls: 'apple-toggle' });
    const checkbox = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' }))
    );
    toggle.createEl('span', { cls: 'apple-toggle-slider' });
    refs.pageToggleInput = checkbox;

    checkbox.addEventListener('change', () => {
      this.applyCardLayoutSetting('pageNumberEnabled', checkbox.checked);
    });
    // 整行可点（与贴图模式「配图序号」同一口径），不必去戳那枚 40px 的开关
    row.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      e.preventDefault();
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  // 水印
  this.createSection(tokenSection, '水印', (section) => {
    const watermarkInput = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (section.createEl('input', {
        type: 'text',
        cls: 'icard-settings-text',
        attr: { placeholder: '水印文案（留空不显示）' },
      }))
    );
    refs.watermarkInput = watermarkInput;
    watermarkInput.addEventListener('change', () => {
      this.applyCardLayoutSetting('watermarkText', watermarkInput.value);
    });
  });

  // 滑块（折叠，默认收起）：日常调的是主题与比例，字号 / 行高 / 边距属偶尔微调，
  // 常驻三个滑块会把「选主题」这个主操作压下去。与文章模式的「排版间距」同款：
  // 摘要在右侧回显当前值，不展开也知道现状。
  const sliderRows = [
    { key: 'fontSize', label: '正文字号' },
    { key: 'lineHeight', label: '行高' },
    { key: 'pagePadding', label: '页面边距' },
  ];
  const tuneGroup = /** @type {HTMLDetailsElement} */ (
    /** @type {unknown} */ (
      tokenSection.createEl('details', { cls: 'apple-settings-details icard-settings-tune' })
    )
  );
  refs.tuneGroup = tuneGroup;
  const tuneSummary = tuneGroup.createEl('summary', { cls: 'apple-settings-summary' });
  tuneSummary.createEl('span', { text: '字号与间距' });
  refs.tuneValuesEl = tuneSummary.createEl('span', { cls: 'icard-settings-tune-values' });
  const tuneArea = tuneGroup.createDiv({ cls: 'apple-settings-area apple-settings-advanced-area' });

  for (const row of sliderRows) {
    this.createSection(tuneArea, row.label, (section) => {
      const limit = /** @type {Record<string, {min: number, max: number, step: number} | undefined>} */ (CARD_LAYOUT_LIMITS)[row.key];
      if (!limit) return;
      const container = section.createEl('div', { cls: 'apple-slider-container' });
      const slider = /** @type {HTMLInputElement} */ (
        /** @type {unknown} */ (container.createEl('input', {
          type: 'range',
          cls: 'apple-slider',
          attr: { min: String(limit.min), max: String(limit.max), step: String(limit.step) },
        }))
      );
      const valueEl = container.createEl('span', { cls: 'icard-settings-slider-value' });
      slider.addEventListener('input', () => {
        const value = Number(slider.value);
        const formatter = /** @type {Record<string, (v: number) => string>} */ (SLIDER_FORMAT)[row.key];
        valueEl.textContent = formatter ? formatter(value) : String(value);
        this.applyCardLayoutSetting(row.key, value);
      });
      refs.sliders[row.key] = { input: slider, valueEl };
    });
  }

  // ========== 子 Tab 2：封面设置（委托独立模块 card-cover-settings.js） ==========
  buildCardCoverSettingsSubpanel(this, coverSection, refs);

  this.renderCardSettingsValues();
}
,

/**
 * 切换侧边栏卡片设置面板子 Tab（'token' | 'cover'）。
 * @param {'token' | 'cover'} subTab
 */
switchCardSettingsSubTab(subTab) {
  const state = cardSettingsStateOf(this);
  state.activeCardSubTab = subTab;
  const refs = state.cardSettingsRefs;
  if (!refs) return;
  /** @param {ObsidianElementLike | null | undefined} btn @param {boolean} on */
  const syncSegment = (btn, on) => {
    if (!btn) return;
    const el = /** @type {HTMLElement} */ (btn);
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-pressed', String(on));
  };
  syncSegment(refs.tokenTabBtn, subTab === 'token');
  syncSegment(refs.coverTabBtn, subTab === 'cover');
  if (refs.tokenSection) refs.tokenSection.classList.toggle('hidden', subTab !== 'token');
  if (refs.coverSection) refs.coverSection.classList.toggle('hidden', subTab !== 'cover');
  this.renderCardSettingsValues();
}
,

/**
 * 打开设置面板并切换到指定子 Tab（供预览区「封面」芯片按钮等入口直通）。
 * @param {'token' | 'cover'} [tabName='cover']
 */
openCardSettingsTab(tabName = 'cover') {
  const overlay = /** @type {HTMLElement | null} */ (this.settingsOverlay);
  const isVisible = Boolean(overlay && overlay.classList.contains('visible'));
  if (!isVisible) {
    this.toggleSettingsPanel();
  }
  this.switchCardSettingsSubTab(tabName);
}
,

/**
 * 卡片设置面板的**视图状态**复位：子 Tab 与两处折叠组（2026-09-21 David 定）。
 * 与文章模式同口径（panel-shell.js:resetSettingsPanelViewState）——每次打开都回到默认视图，
 * 上次停在哪一页、开合过哪个折叠组都不跨次残留。
 *
 * 与「取值」的边界：主题/比例选中、开关、滑块、封面字段值都是**数据**，
 * 存于会话与全局默认，不在此处复位（复位它们等于偷偷改用户设置）。
 */
resetCardSettingsPanelViewState() {
  const state = cardSettingsStateOf(this);
  const refs = state.cardSettingsRefs;

  // ① 折叠组「字号与间距」：固定收起（对应文章模式的高级选项）。
  if (refs?.tuneGroup) refs.tuneGroup.open = false;

  // ② 折叠组「封面画面」：不强制收起，而是把控制权交还给「跟随数据」的默认态
  //    （无配图展开 / 已有配图收起）——那才是这一组的默认，清掉「用户手动开合过」
  //    标记即可，下一次同步自带正确开合。
  if (refs) refs.coverAiUserToggled = false;

  // ③ 子 Tab 回到首个页签「排版 Token」；
  //    switchCardSettingsSubTab 末尾会做一次同步，顺带把 ①② 落到 DOM。
  this.switchCardSettingsSubTab('token');
}
,

/** @returns {import('../../services/card-settings-model.js').CardLayoutSettings} 当前生效设置（无会话时为默认值） */
getCurrentCardLayoutSettings() {
  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (session && typeof session.getLayoutSettings === 'function') {
    return /** @type {import('../../services/card-settings-model.js').CardLayoutSettings} */ (session.getLayoutSettings());
  }
  return { ...DEFAULT_CARD_LAYOUT_SETTINGS };
}
,

/**
 * 把排版设置写回全局默认（2026-09-19：侧栏是唯一配置入口，「调完即存」）。
 * 值经 `normalizeCardLayoutSettings` 归一化——该函数的输出即持久化白名单；
 * 封面字段不在其中（属笔记级），因此只停留在会话。
 * 展开 current 以保留 exportRoot 等非排版键（导出目录由导出弹窗记忆）。
 * @param {Record<string, unknown>} partial
 */
persistCardLayoutDefaults(partial) {
  const plugin = /** @type {any} */ (this).plugin;
  if (!plugin || !plugin.settings) return;
  const current = plugin.settings.cardDefaults && typeof plugin.settings.cardDefaults === 'object'
    ? plugin.settings.cardDefaults
    : {};
  plugin.settings.cardDefaults = {
    ...current,
    ...normalizeCardLayoutSettings({ ...current, ...partial }),
  };
  this.scheduleCardDefaultsSave();
}
,

/** 合并短时间内的多次默认变更，只落盘一次（滑块拖动不会每次都写盘） */
scheduleCardDefaultsSave() {
  const plugin = /** @type {any} */ (this).plugin;
  // 无持久化能力（测试替身 / 极简宿主）时不排定时器，避免留下悬挂回调
  if (!plugin || typeof plugin.saveSettings !== 'function') return;
  const selfRecord = cardSettingsStateOf(this);
  if (selfRecord.cardDefaultsSaveTimer) clearTimeout(selfRecord.cardDefaultsSaveTimer);
  selfRecord.cardDefaultsSaveTimer = setTimeout(() => {
    selfRecord.cardDefaultsSaveTimer = null;
    const host = /** @type {any} */ (this).plugin;
    if (host && typeof host.saveSettings === 'function') void host.saveSettings();
  }, CARD_DEFAULTS_SAVE_DELAY);
}
,

/**
 * 应用一组设置：归一化 + 变化检测在会话内完成；值实际变化才 bumpConfig 并重排版。
 * 2026-09-19：同时写回全局默认——即使尚无会话（未排版过），这次选择也应当被记住。
 * 多键形式供「选主题」使用（主题连同其默认排版一起应用）。
 * @param {Record<string, unknown>} partial
 */
applyCardLayoutSettings(partial) {
  this.persistCardLayoutDefaults(partial);

  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.applyLayoutSettings !== 'function') {
    // 尚无会话（未排版过）：仅刷新显示，不产生版本变化
    this.renderCardSettingsValues();
    return;
  }
  const result = session.applyLayoutSettings(partial);
  this.renderCardSettingsValues();
  if (result.changed) {
    // bumpConfig 已使页选择与省略确认失效；用新版本重新排版
    void this.renderCardPreview();
  }
}
,

/**
 * 应用单项设置（`applyCardLayoutSettings` 的单键形式）。
 * @param {string} key
 * @param {unknown} value
 */
applyCardLayoutSetting(key, value) {
  this.applyCardLayoutSettings({ [key]: value });
}
,

/**
 * 选主题（2026-09-20）：连同该主题自带的默认排版一起应用。
 * 与文章模式同一心智——没有「恢复默认排版」按钮，换主题即取默认：
 * 在 A 主题下改乱了，去 B 再回 A，得到的就是 A 的默认排版。
 * 封面 / 页码 / 水印属输出元素（与主题无关），不随主题切换重置。
 * @param {string} themeId
 */
applyCardTheme(themeId) {
  this.applyCardLayoutSettings({
    themeId,
    ...getCardThemeDefaultTypography(themeId),
  });
}
,

/**
 * 封面字段（C01③）：应用单项用户编辑（会话 applyCoverFields；实际变化 → bumpConfig → 重排版）。
 * @param {string} key
 * @param {unknown} value
 */
applyCardCoverField(key, value) {
  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.applyCoverFields !== 'function') {
    this.renderCardSettingsValues();
    return;
  }
  const result = session.applyCoverFields({ [key]: value });
  this.renderCardSettingsValues();
  if (result.changed) void this.renderCardPreview();
}
,

/** 封面字段（C01③）：按当前笔记重新填入（丢弃手工修改，回 seed 跟随） */
resetCardCoverFields() {
  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.resetCoverFields !== 'function') {
    this.renderCardSettingsValues();
    return;
  }
  const result = session.resetCoverFields();
  this.renderCardSettingsValues();
  if (result.changed) void this.renderCardPreview();
}
,

/** 打开浮层/设置变化后同步显示值（active 态、滑块位置与数值、封面字段与开关） */
renderCardSettingsValues() {
  const refs = cardSettingsStateOf(this).cardSettingsRefs;
  if (!refs) return;
  const settings = this.getCurrentCardLayoutSettings();

  // —— 1. 排版 Token 同步 ——
  if (refs.themeGrid) {
    refs.themeGrid.querySelectorAll('.apple-btn-size').forEach((el) => {
      (/** @type {HTMLElement} */ (el)).classList.toggle(
        'active',
        (/** @type {HTMLElement} */ (el)).dataset.value === settings.themeId,
      );
    });
  }
  if (refs.ratioGrid) {
    refs.ratioGrid.querySelectorAll('.icard-ratio-option').forEach((el) => {
      (/** @type {HTMLElement} */ (el)).classList.toggle(
        'active',
        (/** @type {HTMLElement} */ (el)).dataset.value === settings.ratioId,
      );
    });
  }
  if (refs.pageToggleInput) {
    // 缺省视为开启（与旧按钮口径一致：pageNumberEnabled !== false）
    refs.pageToggleInput.checked = settings.pageNumberEnabled !== false;
  }
  if (refs.watermarkInput && document.activeElement !== refs.watermarkInput) {
    refs.watermarkInput.value = String(settings.watermarkText || '');
  }
  for (const [key, ui] of Object.entries(refs.sliders || {})) {
    const value = Number(settings[/** @type {'fontSize'|'lineHeight'|'pagePadding'} */ (key)]);
    ui.input.value = String(value);
    const formatter = /** @type {Record<string, (v: number) => string>} */ (SLIDER_FORMAT)[key];
    ui.valueEl.textContent = formatter ? formatter(value) : String(value);
  }
  // 折叠摘要回显当前值：不展开也知道字号/行高/边距现在是多少
  if (refs.tuneValuesEl) {
    const fmt = (key, raw) => {
      const formatter = /** @type {Record<string, (v: number) => string>} */ (SLIDER_FORMAT)[key];
      return formatter ? formatter(Number(raw)) : String(raw);
    };
    /** @type {HTMLElement} */ (refs.tuneValuesEl).textContent =
      `字号 ${fmt('fontSize', settings.fontSize)} · 行高 ${fmt('lineHeight', settings.lineHeight)} · 边距 ${fmt('pagePadding', settings.pagePadding)}`;
  }

  // —— 2. 封面设置同步（委托独立模块 card-cover-settings.js） ——
  renderCardCoverValues(this, refs, settings);
}
,

/**
 * 「封面画面」折叠组的摘要回显与折叠默认态。
 * @param {Record<string, unknown>} fields 会话里的封面字段
 * @param {boolean} hasImage 是否已有配图
 */
renderCardCoverGroupEcho(fields, hasImage) {
  const refs = cardSettingsStateOf(this).cardSettingsRefs;
  if (!refs) return;
  renderCardCoverGroupEcho(refs, fields, hasImage);
}
,

};
