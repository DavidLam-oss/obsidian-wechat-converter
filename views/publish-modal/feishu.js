/*
## 核心功能

实现发布弹窗中的 feishu 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `renderFeishuPublishTab`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`../../services/dom-utils.js`、`../../services/feishu-sync.js`、`../../services/feishu-mermaid-renderer.js`、`../../services/feishu-settings.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic API responses without strict typescript type annotations */
// views/publish-modal/feishu.js
//
// Renders the Feishu tab content inside the publish modal.
// Modularized to avoid bloat in input.js.
// Uses Obsidian APIs (Setting, Notice, etc.).

import { getActiveWindowValue } from '../../services/dom-utils.js';
import { syncNoteToFeishu } from '../../services/feishu-sync.js';
import { collectMermaidFences } from '../../services/feishu-mermaid-renderer.js';
import {
  findFeishuHistoryByPath,
  getFeishuMermaidPreferenceByPath,
  parseFeishuDocUrlOrToken,
  rebindFeishuHistoryByPath,
  removeFeishuMermaidPreferenceByPath,
  setFeishuMermaidPreferenceByPath,
} from '../../services/feishu-settings.js';

/**
 * @param {unknown} Notice
 * @param {string} message
 * @param {number} [duration]
 * @returns {any}
 */
function showFeishuNotice(Notice, message, duration) {
  if (typeof Notice !== 'function') return null;
  return new Notice(message, duration);
}

/**
 * @param {any} notice
 * @param {string} message
 */
function updateFeishuNotice(notice, message) {
  if (notice && typeof notice.setMessage === 'function') {
    notice.setMessage(message);
  }
}

/** @param {any} notice */
function hideFeishuNotice(notice) {
  if (notice && typeof notice.hide === 'function') {
    notice.hide();
  }
}

/**
 * @param {any} imageSummary
 * @returns {string}
 */
function formatFeishuImageWarning(imageSummary) {
  const count = Number(imageSummary?.skipped || 0) + Number(imageSummary?.failed || 0);
  if (!count) return '';
  return `有 ${count} 张图片未完成同步处理，通常是异常文件或后处理失败；远程图片仍会交由飞书导入。`;
}

/**
 * @param {any} result
 * @returns {string[]}
 */
function getFeishuResultWarnings(result) {
  const warnings = [];
  if (result?.titleUpdateWarning) {
    warnings.push('正文已更新，标题未能修改。');
  }
  if (result?.transferOwnerWarning) {
    warnings.push('文档已同步，但所有权转移未完成。你仍可以照常使用该文档；如需自动转移，请检查飞书 User ID 和应用权限。');
  }
  const imageWarning = formatFeishuImageWarning(result?.imageSummary);
  if (imageWarning) warnings.push(imageWarning);
  return warnings;
}

/**
 * @param {unknown} markdown
 * @returns {number}
 */
function countMermaidFences(markdown) {
  return collectMermaidFences(markdown).filter((fence) => String(fence.source || '').trim()).length;
}

/**
 * @param {HTMLElement} container
 * @param {string} name
 * @param {string} value
 * @param {boolean} checked
 * @returns {HTMLInputElement}
 */
function createFeishuRadio(container, name, value, checked) {
  const input = /** @type {HTMLInputElement} */ (container.createEl('input', {
    attr: {
      type: 'radio',
      name,
      value,
    },
  }));
  input.checked = checked;
  return input;
}

/**
 * @param {HTMLElement} scrollEl
 */
function bindTransientScrollbar(scrollEl) {
  let hideTimer = 0;
  const showScrollbar = () => {
    scrollEl.addClass('is-scrolling');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      scrollEl.removeClass('is-scrolling');
    }, 850);
  };

  scrollEl.addEventListener('scroll', showScrollbar, { passive: true });
}

/**
 * @param {HTMLElement} scrollEl
 * @param {(callback: FrameRequestCallback) => number | void} [requestFrame]
 */
function scrollFeishuResultIntoView(scrollEl, requestFrame) {
  const scrollToResult = () => {
    scrollEl.scrollTop = scrollEl.scrollHeight;
  };
  if (typeof requestFrame === 'function') {
    requestFrame(scrollToResult);
  } else {
    scrollToResult();
  }
}

/**
 * Renders the Feishu publish tab content.
 * @param {any} view AppleStyleView instance
 * @param {any} modal Obsidian Modal instance
 * @param {HTMLDivElement} containerEl The container to render the tab content inside
 * @param {object} [options={}] Injected options
 */
function renderFeishuPublishTab(view, modal, containerEl, options = {}) {
  const obsidian = options.obsidianApi || view.plugin.obsidianApi || getActiveWindowValue('obsidian') || {};
  const Setting = obsidian.Setting;
  const Notice = obsidian.Notice;
  const setIcon = obsidian.setIcon;
  const requestFrame = options.requestAnimationFrame || (
    typeof window.requestAnimationFrame === 'function'
      ? (callback) => window.requestAnimationFrame(callback)
      : undefined
  );

  const { plugin } = view;
  const settings = plugin.settings.feishuSync;

  // Clear previous content
  containerEl.empty();
  containerEl.addClass('wechat-feishu-modal-content');

  // 1. Re-render the tab headers inside containerEl (so they stay when switching tabs)
  const tabsWrapper = containerEl.createDiv({ cls: 'wechat-publish-mode-tabs' });
  
  const wechatTabBtn = tabsWrapper.createEl('button', {
    text: '微信草稿箱',
    cls: 'wechat-publish-mode-tab',
  });
  wechatTabBtn.onclick = () => {
    view.showSyncModal({ modal });
  };

  const multiTabBtn = tabsWrapper.createEl('button', {
    cls: 'wechat-publish-mode-tab',
  });
  multiTabBtn.createEl('span', { text: '多平台发布（小红书/知乎/头条/B 站等）' });
  multiTabBtn.onclick = () => {
    view.showMultiPlatformSyncModal({ modal });
  };

  tabsWrapper.createEl('button', {
    text: '飞书云文档',
    cls: 'wechat-publish-mode-tab is-active',
  });

  const shell = containerEl.createDiv({ cls: 'wechat-feishu-publish-shell' });

  // 2. Tab Content wrapper
  const contentWrapper = shell.createDiv({ cls: 'wechat-feishu-publish-content' });
  bindTransientScrollbar(contentWrapper);

  // 3. Check if Feishu sync is enabled and configured
  if (!settings || !settings.enabled || !settings.appId || !settings.appSecret || !settings.folderToken) {
    const emptyState = contentWrapper.createDiv({ cls: 'wechat-sync-empty-state' });
    emptyState.createEl('h3', { text: '尚未完成飞书同步配置' });
    emptyState.createEl('p', { text: '一键同步至飞书前，需要先在插件设置中开启并填写 App ID、App Secret 和目标文件夹 Token。' });
    
    const goSettingsBtn = emptyState.createEl('button', { text: '去设置', cls: 'mod-cta' });
    goSettingsBtn.onclick = () => {
      modal.close();
      view.openPluginSettings();
    };
    return;
  }

  // 4. Resolve the file to publish
  const activeFile = view.getPublishContextFile();
  if (!activeFile) {
    contentWrapper.createEl('p', { text: '❌ 未找到当前活动的 Markdown 笔记，请先打开一篇文档。', cls: 'text-error' });
    return;
  }

  // Resolve defaults
  const historyItem = findFeishuHistoryByPath(settings, activeFile.path);
  const isUpdate = !!(historyItem && historyItem.docToken);
  const savedMermaidPreference = getFeishuMermaidPreferenceByPath(settings, activeFile.path);
  let mermaidCount = 0;
  let mermaidRenderMode = savedMermaidPreference?.mode || 'source';
  let rememberMermaidPreference = !!savedMermaidPreference;
  const syncedAt = isUpdate && historyItem.uploadTime
    ? historyItem.uploadTime.substring(0, 16).replace('T', ' ')
    : '';

  const introCard = contentWrapper.createDiv({ cls: 'wechat-feishu-intro-card' });
  const introCopy = introCard.createDiv({ cls: 'wechat-feishu-intro-copy' });
  introCopy.createEl('div', { text: isUpdate ? '覆盖更新模式' : '首次同步模式', cls: 'wechat-feishu-intro-kicker' });
  introCopy.createEl('p', {
    text: isUpdate
      ? '本次会尽量保持原文档链接不变，先清空旧正文，再写入最新内容。'
      : '本次会优先在目标文件夹里查找同名文档，命中则自动恢复绑定，未命中则新建。',
  });
  introCard.createEl('div', {
    text: isUpdate ? '保持链接' : '自动绑定',
    cls: `wechat-feishu-mode-pill${isUpdate ? ' is-update' : ''}`,
  });

  const settingsSection = contentWrapper.createDiv({ cls: 'wechat-modal-section wechat-feishu-section wechat-feishu-card-section' });

  // 5. Title setting
  let docTitle = activeFile.basename;
  let docTitleEdited = false;
  const titleSetting = new Setting(settingsSection)
    .setName('文档标题')
    .setDesc('发布至飞书时的文档标题。默认使用笔记文件名，支持自定义。')
    .addText((text) => text
      .setPlaceholder('请输入文档标题')
      .setValue(docTitle)
      .onChange((val) => {
        docTitleEdited = true;
        docTitle = val;
      })
    );
  titleSetting.settingEl.addClass('wechat-feishu-title-setting');

  const mermaidSection = contentWrapper.createDiv({ cls: 'wechat-modal-section wechat-feishu-section wechat-feishu-mermaid-section is-hidden' });

  const renderMermaidSection = (count) => {
    mermaidCount = count;
    mermaidSection.empty();
    if (!count) {
      mermaidSection.addClass('is-hidden');
      return;
    }

    mermaidSection.removeClass('is-hidden');
    mermaidSection.createEl('h3', { text: 'Mermaid 图表', cls: 'wechat-feishu-section-title' });
    mermaidSection.createEl('p', {
      text: `检测到 ${count} 个 Mermaid 图表。飞书 OpenAPI 暂不直接渲染 Mermaid，可为这篇笔记单独选择处理方式。`,
      cls: 'wechat-feishu-mermaid-desc',
    });

    const optionList = mermaidSection.createDiv({ cls: 'wechat-feishu-mermaid-options' });
    const sourceLabel = optionList.createEl('label', { cls: 'wechat-feishu-mermaid-option' });
    const sourceRadio = createFeishuRadio(sourceLabel, 'feishu-mermaid-mode', 'source', mermaidRenderMode !== 'remote-image');
    sourceLabel.createEl('span', { text: '保留源码（推荐，最安全）' });

    const remoteLabel = optionList.createEl('label', { cls: 'wechat-feishu-mermaid-option' });
    const remoteRadio = createFeishuRadio(remoteLabel, 'feishu-mermaid-mode', 'remote-image', mermaidRenderMode === 'remote-image');
    remoteLabel.createEl('span', { text: '使用 Kroki 远端渲染成图片' });

    const privacyHint = mermaidSection.createEl('p', {
      text: '远端渲染会把 Mermaid 源码发送到 Kroki 渲染服务。请确认这篇笔记中的图表源码不包含敏感信息。',
      cls: 'wechat-feishu-mermaid-privacy',
    });
    privacyHint.toggleClass('is-hidden', mermaidRenderMode !== 'remote-image');

    const rememberLabel = mermaidSection.createEl('label', { cls: 'wechat-feishu-mermaid-remember' });
    const rememberInput = /** @type {HTMLInputElement} */ (rememberLabel.createEl('input', { attr: { type: 'checkbox' } }));
    rememberInput.checked = rememberMermaidPreference;
    rememberLabel.createEl('span', { text: '记住这篇笔记的选择' });

    const syncMode = () => {
      mermaidRenderMode = remoteRadio.checked ? 'remote-image' : 'source';
      rememberMermaidPreference = rememberInput.checked;
      privacyHint.toggleClass('is-hidden', mermaidRenderMode !== 'remote-image');
    };
    sourceRadio.onchange = syncMode;
    remoteRadio.onchange = syncMode;
    rememberInput.onchange = syncMode;
  };

  const cachedMarkdown = view.lastResolvedSourcePath === activeFile.path ? view.lastResolvedMarkdown : '';
  if (cachedMarkdown) {
    renderMermaidSection(countMermaidFences(cachedMarkdown));
  }
  view.app.vault.read(activeFile).then((markdown) => {
    renderMermaidSection(countMermaidFences(markdown));
  }).catch((err) => {
    console.warn('[飞书同步] 读取当前笔记以检测 Mermaid 失败:', err);
  });

  const statusSection = contentWrapper.createDiv({ cls: 'wechat-modal-section wechat-feishu-section wechat-feishu-status-section' });
  statusSection.createEl('h3', { text: '同步状态', cls: 'wechat-feishu-section-title' });
  const statusGrid = statusSection.createDiv({ cls: 'wechat-feishu-status-grid' });
  const statusCard = statusGrid.createDiv({ cls: 'wechat-feishu-status-card' });
  statusCard.createEl('div', { text: isUpdate ? '已绑定文档' : '首次同步', cls: 'wechat-feishu-status-label' });

  if (isUpdate) {
    statusCard.createEl('p', {
      text: `该笔记已于 ${syncedAt} 同步过。再次同步会直接更新飞书文档正文，链接保持不变。`,
      cls: 'text-success',
    });
  } else {
    statusCard.createEl('p', {
      text: '第一次同步该笔记。开始后会先检索目标文件夹中的同名文档，命中则自动绑定更新，未命中则新建文档。',
      cls: 'text-muted',
    });
  }

  const rebindCard = statusGrid.createDiv({ cls: 'wechat-feishu-rebind-card' });
  rebindCard.createEl('div', { text: '文档绑定', cls: 'wechat-feishu-rebind-title' });
  rebindCard.createEl('p', {
    text: '飞书端文档被移动、重建，或本地缓存指向旧 token 时，可粘贴新的 docx 链接重新绑定。',
    cls: 'wechat-feishu-rebind-desc',
  });
  const rebindControls = rebindCard.createDiv({ cls: 'wechat-feishu-rebind-controls' });
  const rebindInput = rebindControls.createEl('input', {
    type: 'text',
    placeholder: '粘贴飞书文档 URL 或 docx token',
    cls: 'wechat-feishu-rebind-input',
  });
  if (historyItem?.url) {
    rebindInput.value = historyItem.url;
  }
  const rebindBtn = rebindControls.createEl('button', { text: isUpdate ? '更新绑定' : '绑定已有文档' });
  const rebindHint = rebindCard.createEl('p', { text: '', cls: 'wechat-feishu-rebind-hint' });
  rebindBtn.onclick = async () => {
    const parsed = parseFeishuDocUrlOrToken(rebindInput.value);
    if (!parsed) {
      rebindHint.setText('请输入有效的飞书 docx 链接或 token。');
      rebindHint.addClass('is-error');
      showFeishuNotice(Notice, '❌ 飞书文档链接无效');
      return;
    }

    const rebound = rebindFeishuHistoryByPath(settings, activeFile.path, {
      title: docTitle.trim() || activeFile.basename,
      url: parsed.url,
      docToken: parsed.docToken,
      uploadTime: new Date().toISOString(),
    });
    if (!rebound) {
      rebindHint.setText('绑定失败，请确认当前笔记路径和飞书链接。');
      rebindHint.addClass('is-error');
      showFeishuNotice(Notice, '❌ 绑定失败');
      return;
    }

    await plugin.saveSettings();
    showFeishuNotice(Notice, '✅ 已重新绑定当前笔记的飞书文档');
    renderFeishuPublishTab(view, modal, containerEl, options);
  };

  // 7. Result Card (summary + actions)
  const resultCard = contentWrapper.createDiv({ cls: 'wechat-feishu-result-card' });
  resultCard.addClass('is-hidden');

  // 8. Sync Buttons row
  const buttonRow = shell.createDiv({ cls: 'wechat-modal-buttons' });
  const cancelBtn = buttonRow.createEl('button', { text: '取消' });
  cancelBtn.onclick = () => modal.close();

  const syncBtn = buttonRow.createEl('button', { text: isUpdate ? '更新至飞书' : '同步至飞书', cls: 'mod-cta' });
  
  syncBtn.onclick = async () => {
    // Disable inputs and buttons
    titleSetting.settingEl.addClass('is-disabled');
    syncBtn.disabled = true;
    cancelBtn.disabled = true;
    
    resultCard.addClass('is-hidden');
    const progressNotice = showFeishuNotice(
      Notice,
      isUpdate ? '🚀 正在更新飞书文档...' : '🚀 正在同步到飞书文档...',
      0
    );

    try {
      const markdown = await view.app.vault.read(activeFile);
      const currentMermaidCount = countMermaidFences(markdown);
      if (currentMermaidCount !== mermaidCount) {
        renderMermaidSection(currentMermaidCount);
      }
      if (currentMermaidCount > 0 && rememberMermaidPreference) {
        setFeishuMermaidPreferenceByPath(settings, activeFile.path, {
          mode: mermaidRenderMode,
          provider: 'kroki',
        });
      } else if (savedMermaidPreference) {
        removeFeishuMermaidPreferenceByPath(settings, activeFile.path);
      }
      
      const result = await syncNoteToFeishu({
        app: view.app,
        settings,
        activeFile,
        markdown,
        ...(docTitleEdited ? { titleOverride: docTitle } : {}),
        onProgress: (stage, message) => {
          updateFeishuNotice(progressNotice, message);
        },
        requestUrl: obsidian.requestUrl,
        mermaidRenderMode: currentMermaidCount > 0 ? mermaidRenderMode : 'source',
        mermaidRenderProvider: 'kroki',
      });

      // Save settings
      await plugin.saveSettings();

      hideFeishuNotice(progressNotice);
      resultCard.empty();
      const warnings = getFeishuResultWarnings(result);
      resultCard.addClass(warnings.length ? 'has-warning' : 'is-success');
      resultCard.removeClass(warnings.length ? 'is-success' : 'has-warning');

      const resultHeading = resultCard.createDiv({ cls: 'wechat-feishu-result-heading' });
      const resultIcon = resultHeading.createSpan({
        cls: 'wechat-feishu-result-icon',
        attr: { 'aria-hidden': 'true' },
      });
      if (typeof setIcon === 'function') {
        setIcon(resultIcon, 'circle-check');
      }
      resultHeading.createEl('h4', {
        text: warnings.length ? '同步完成' : '同步成功',
        cls: 'wechat-feishu-result-title',
      });
      resultCard.createEl('p', {
        text: warnings.length
          ? '飞书文档已导入并更新，下面有少量事项需要确认。'
          : '飞书文档已导入并更新，可以直接打开查看。',
        cls: 'wechat-feishu-result-desc',
      });

      if (warnings.length) {
        const warningList = resultCard.createDiv({ cls: 'wechat-feishu-result-warnings' });
        for (const warningText of warnings) {
          warningList.createEl('p', { text: warningText, cls: 'wechat-feishu-result-warning' });
        }
      }

      const resultActions = resultCard.createDiv({ cls: 'wechat-feishu-result-actions' });
      
      const openBtn = resultActions.createEl('button', { text: '在浏览器中打开', cls: 'mod-cta' });
      openBtn.onclick = () => {
        if (view.plugin && typeof view.plugin.openExternalUrl === 'function') {
          view.plugin.openExternalUrl(result.url);
        } else {
          window.open(result.url, '_blank', 'noopener');
        }
      };

      const copyBtn = resultActions.createEl('button', { text: '复制链接' });
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(result.url);
          showFeishuNotice(Notice, '✅ 链接已复制到剪贴板');
        } catch (copyError) {
          console.warn('[飞书同步] 复制链接失败:', copyError);
          showFeishuNotice(Notice, '❌ 复制链接失败，请手动打开后复制');
        }
      };

      resultCard.removeClass('is-hidden');
      scrollFeishuResultIntoView(contentWrapper, requestFrame);
      
      // Re-enable cancel button to let them close
      cancelBtn.disabled = false;
      cancelBtn.setText('关闭');
      syncBtn.setCssStyles({ display: 'none' });
      
      showFeishuNotice(
        Notice,
        warnings.length ? '✅ 飞书文档已同步，部分事项需要确认' : '✅ 飞书文档同步成功！',
        warnings.length ? 7000 : undefined
      );
    } catch (err) {
      console.error('[飞书同步失败]:', err);
      hideFeishuNotice(progressNotice);
      
      // Re-enable
      titleSetting.settingEl.removeClass('is-disabled');
      syncBtn.disabled = false;
      cancelBtn.disabled = false;
      
      showFeishuNotice(Notice, `❌ 同步失败: ${err.message || String(err)}`, 8000);
    }
  };
}

export {
  renderFeishuPublishTab,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after Feishu publish modal Obsidian UI boundary */
