// @vitest-environment node
import { describe, it, expect } from 'vitest';

/* 封面字段模型与会话脏标记（C01③，规划 §3.2/§3.3）：
   frontmatter 解析 → 初值派生（title 回落文件名、日期恒为空不预填）→
   用户编辑冻结（dirty）与「按当前笔记重新填入」→ 封面有效性 → 输出资格 hasCover 语义。 */

import {
  parseCardFrontmatter,
  deriveCoverFields,
  normalizeCoverFields,
  isCoverUsable,
  EMPTY_COVER_FIELDS,
} from '../services/card-cover-model.js';
import { createNoteCardSession } from '../services/card-session.js';
import { checkCardOutputEligibility } from '../services/card-settings-model.js';

describe('parseCardFrontmatter（一期够用口径）', () => {
  it('解析顶层标量键；引号与行内注释剥离', () => {
    const meta = parseCardFrontmatter([
      '---',
      'title: "我的标题" # 备注',
      "author: 'David'",
      'date: 2026-09-13',
      'tags:',
      '  - a',
      '---',
      '# 正文',
    ].join('\n'));
    expect(meta.title).toBe('我的标题');
    expect(meta.author).toBe('David');
    expect(meta.date).toBe('2026-09-13');
    expect(meta.tags).toBeUndefined(); // 列表/嵌套一律忽略
  });

  it('无 frontmatter / 围栏代码块内 --- 不误判', () => {
    expect(parseCardFrontmatter('# 直接正文')).toEqual({});
    expect(parseCardFrontmatter('```\n---\nkey: v\n```\n')).toEqual({});
  });
});

describe('deriveCoverFields：初值派生', () => {
  it('title 取 frontmatter，否则回落文件名（去扩展名）', () => {
    expect(deriveCoverFields({ markdown: '---\ntitle: 早课\n---\n正文', sourcePath: 'Wechat/笔记.md' }).title).toBe('早课');
    expect(deriveCoverFields({ markdown: '正文', sourcePath: 'Wechat/我的笔记.md' }).title).toBe('我的笔记');
  });

  it('excerpt 取 description/excerpt；date 恒为空（不预填、不补今天）', () => {
    const fields = deriveCoverFields({
      markdown: '---\ndescription: 一段摘要\nauthor: David\ndate: 2026-09-13\n---\n',
      sourcePath: 'a/b.md',
    });
    expect(fields.excerpt).toBe('一段摘要');
    expect(fields.author).toBe('David');
    // 回归（2026-10-03 David 定）：即使 frontmatter 有合法日期，也不预填
    expect(fields.date).toBe('');

    expect(deriveCoverFields({ markdown: '---\ndate: 无效日期\n---\n', sourcePath: 'a/b.md' }).date).toBe('');
    expect(deriveCoverFields({ markdown: '正文', sourcePath: 'a/b.md' }).date).toBe('');
  });

  it('正文包含图片时，默认自动提取第一张内容图作为封面配图，并启用自适应版式', () => {
    const md = '# 深度好文\n\n这是一段前言。\n\n![架构全景图](assets/architecture.png)\n\n后续正文内容...';
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'Wechat/深度好文.md' });
    expect(fields.coverImage).toBe('assets/architecture.png');
    expect(fields.coverMode).toBe('adaptive');
    expect(fields.coverImageSource).toBe('note');
  });

  it('支持 Wikilink 图片语法 ![[photo.jpg]] 自动设为封面首图', () => {
    const md = '# 旅游日记\n\n![[travel/lake.jpg|风景照]]\n\n今天天气真好！';
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'Notes/Travel.md' });
    expect(fields.coverImage).toBe('travel/lake.jpg');
    expect(fields.coverMode).toBe('adaptive');
    expect(fields.coverImageSource).toBe('note');
  });

  it('智能跳过开头的徽章与图标，优先选择正文内容图', () => {
    const md = [
      '# 开源项目',
      '![build](https://img.shields.io/badge/build-passing-brightgreen)',
      '![license](https://shields.io/badge/license-MIT-blue)',
      '',
      '![产品效果图](https://images.example.com/product-hero.png)',
      '项目介绍详情...',
    ].join('\n');
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'Repo.md' });
    expect(fields.coverImage).toBe('https://images.example.com/product-hero.png');
    expect(fields.coverMode).toBe('adaptive');
    expect(fields.coverImageSource).toBe('note');
  });

  it('Frontmatter 显式声明 cover 时优先尊重 Frontmatter，不取正文首图', () => {
    const md = [
      '---',
      'cover: https://custom.com/banner.jpg',
      '---',
      '# 标题',
      '![正文插图](note/first.png)',
    ].join('\n');
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'a.md' });
    expect(fields.coverImage).toBe('https://custom.com/banner.jpg');
    expect(fields.coverMode).toBe('adaptive');
  });

  it('Frontmatter 显式声明 coverMode: none 时，即使正文有图也保持纯文字排版', () => {
    const md = [
      '---',
      'coverMode: none',
      '---',
      '# 纯文字随笔',
      '![插图](note/img.png)',
    ].join('\n');
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'a.md' });
    expect(fields.coverMode).toBe('none');
  });

  it('智能剥离代码块与注释中的图片语法，不把代码示例误当首图', () => {
    const md = [
      '# 技术教程',
      '下面是一段 Markdown 示例代码：',
      '```markdown',
      '![[fake_code_image.png]]',
      '```',
      '<!-- 这是 HTML 注释里的图片 <img src="comment.png"> -->',
      '%% 这是 Obsidian 注释 ![[obsidian_comment.png]] %%',
      '',
      '这里才是真正的文章配图：',
      '![[real_hero.jpg]]',
    ].join('\n');
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'Tech.md' });
    expect(fields.coverImage).toBe('real_hero.jpg');
    expect(fields.coverMode).toBe('adaptive');
    expect(fields.coverImageSource).toBe('note');
  });

  it('正文首图自动探查智能跳过赞赏码、徽章与小图标，准确采纳正文真配图', () => {
    const md = [
      '# 深度好文',
      '![赞赏码](img/reward_qr.png)',
      '![Build Status](https://img.shields.io/badge/build-passing-brightgreen)',
      '![头像](https://example.com/avatar.jpg)',
      '![真正的文章配图](img/hero_feature.png)',
      '![文末打赏](img/donate.png)',
    ].join('\n');
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'Article.md' });
    expect(fields.coverImage).toBe('img/hero_feature.png');
    expect(fields.coverMode).toBe('adaptive');
    expect(fields.coverImageSource).toBe('note');
  });

  it('正文无图时，封面配图为空且 coverMode 保持 none', () => {
    const md = '# 纯文字文章\n\n这里没有任何图片，只有文字。';
    const fields = deriveCoverFields({ markdown: md, sourcePath: 'text.md' });
    expect(fields.coverImage).toBe('');
    expect(fields.coverMode).toBe('none');
    expect(fields.coverImageSource).toBe('');
  });
});

describe('normalizeCoverFields / isCoverUsable', () => {
  it('四字段 trim；非字符串回落 base；不按长度截断', () => {
    const long = '长'.repeat(200);
    const fields = normalizeCoverFields({ title: `  ${long}  `, author: 42 });
    expect(fields.title).toBe(long);
    expect(fields.author).toBe(EMPTY_COVER_FIELDS.author);
  });

  it('isCoverUsable：标题非空才有效', () => {
    expect(isCoverUsable({ title: 'T', author: '', date: '', excerpt: '' })).toBe(true);
    expect(isCoverUsable({ title: '', author: 'a', date: '', excerpt: '' })).toBe(false);
    expect(isCoverUsable(null)).toBe(false);
  });
});

describe('会话封面字段脏标记（C01③）', () => {
  it('未编辑时跟随 seed；seed 随内容刷新', () => {
    const session = createNoteCardSession({ sourcePath: 'a.md' });
    session.setCoverSeed({ title: 'v1' });
    expect(session.getCoverFields().title).toBe('v1');
    session.setCoverSeed({ title: 'v2' });
    expect(session.getCoverFields().title).toBe('v2');
    expect(session.isCoverFieldsDirty()).toBe(false);
  });

  it('applyCoverFields 冻结用户值：seed 再刷新不覆盖；实际变化才 bumpConfig', () => {
    const session = createNoteCardSession({ sourcePath: 'a.md' });
    session.setCoverSeed({ title: 'v1' });
    const keyBefore = session.currentLayoutKey();
    const r1 = session.applyCoverFields({ title: '手改标题' });
    expect(r1.changed).toBe(true);
    expect(session.isCoverFieldsDirty()).toBe(true);
    const keyAfter = session.currentLayoutKey();
    expect(keyAfter).not.toBe(keyBefore); // bumpConfig → 选择/省略确认失效
    session.setCoverSeed({ title: 'v2' });
    expect(session.getCoverFields().title).toBe('手改标题');
    const r2 = session.applyCoverFields({ title: '手改标题' });
    expect(r2.changed).toBe(false);
    expect(session.currentLayoutKey()).toBe(keyAfter);
  });

  it('resetCoverFields 回 seed 跟随；无变化不 bump', () => {
    const session = createNoteCardSession({ sourcePath: 'a.md' });
    session.setCoverSeed({ title: 'v1' });
    session.applyCoverFields({ title: '手改' });
    const r = session.resetCoverFields();
    expect(r.changed).toBe(true);
    expect(r.fields.title).toBe('v1');
    expect(session.isCoverFieldsDirty()).toBe(false);
    const key = session.currentLayoutKey();
    const r2 = session.resetCoverFields();
    expect(r2.changed).toBe(false);
    expect(session.currentLayoutKey()).toBe(key);
  });

  // 2026-09-21 回归：变更判定曾只覆盖四个文案字段，AI 封面字段的编辑静默丢失
  // （风格选完当场弹回、生成出来的配图当场丢掉）。判定必须覆盖字段全集。
  it('applyCoverFields 覆盖 AI 封面字段：风格 / 呈现 / 提示词 / 配图都能写入并 bumpConfig', () => {
    for (const [key, value] of [
      ['coverImageStyle', 'minimal-vector'],
      ['coverMode', 'full-bleed'],
      ['coverPrompt', 'custom prompt text'],
      ['coverImage', 'data:image/png;base64,AAAA'],
    ]) {
      const session = createNoteCardSession({ sourcePath: 'a.md' });
      const keyBefore = session.currentLayoutKey();
      const r = session.applyCoverFields({ [key]: value });
      expect(r.changed).toBe(true);
      expect(session.getCoverFields()[key]).toBe(value);
      expect(session.currentLayoutKey()).not.toBe(keyBefore);
    }
  });

  it('AI 封面字段的编辑同样冻结：seed 再刷新不覆盖，同值重复提交不再 bump', () => {
    const session = createNoteCardSession({ sourcePath: 'a.md' });
    session.setCoverSeed({ title: 'v1', coverImageStyle: '3d-clay' });
    session.applyCoverFields({ coverImageStyle: 'cyberpunk-tech' });
    session.setCoverSeed({ title: 'v2', coverImageStyle: '3d-clay' });
    expect(session.getCoverFields().coverImageStyle).toBe('cyberpunk-tech');
    const r = session.applyCoverFields({ coverImageStyle: 'cyberpunk-tech' });
    expect(r.changed).toBe(false);
  });

  it('resetCoverFields 清掉仅剩 AI 字段的覆盖时也要 bump（否则版面键不变、旧快照可复用）', () => {
    const session = createNoteCardSession({ sourcePath: 'a.md' });
    session.setCoverSeed({ title: 'v1' });
    session.applyCoverFields({ coverImage: 'data:image/png;base64,AAAA' });
    const keyBefore = session.currentLayoutKey();
    const r = session.resetCoverFields();
    expect(r.changed).toBe(true);
    expect(session.getCoverFields().coverImage).toBe('');
    expect(session.currentLayoutKey()).not.toBe(keyBefore);
  });
});

describe('checkCardOutputEligibility：hasCover 语义（C01③）', () => {
  const base = {
    hasResult: true, planOk: true, pageCount: 0, diagnosticVersion: 'd1',
    omissionTotal: 0, resourceBlockingFailures: false,
  };
  const session = createNoteCardSession({ sourcePath: 'a.md' });

  it('正文零页且无封面 → empty-content', () => {
    const r = checkCardOutputEligibility(session, { ...base });
    expect(r.blockers.map((b) => b.code)).toEqual(['empty-content']);
  });

  it('正文零页但有有效封面 → 允许仅导出封面', () => {
    const r = checkCardOutputEligibility(session, { ...base, hasCover: true });
    expect(r.eligible).toBe(true);
  });
});
