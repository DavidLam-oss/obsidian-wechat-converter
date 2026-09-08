/*
## 核心功能

A02 单测：验证 services/card-document.js 的内容账本——块识别、源定位、分页指令边界、省略诊断与互斥计数。
断言输入为 tests/fixtures/image-card/expected.json 预期账本与七组样本。

## 维护规则

- 修改 tests/fixtures/image-card/ 样本时必须同步更新 expected.json 与本文件。
*/

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createCardDocument, detectFrontmatterRange, parseFrontmatterFields, OmitReason } from "../services/card-document.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/image-card");
const expected = JSON.parse(readFileSync(join(fixtureDir, "expected.json"), "utf8"));

function loadSample(name) {
  return readFileSync(join(fixtureDir, name), "utf8");
}

function parse(name, options) {
  return createCardDocument(loadSample(name), options);
}

const renderBlocks = (doc) => doc.blocks.filter((b) => b.disposition === "render");
const omitBlocks = (doc) => doc.blocks.filter((b) => b.disposition === "omit");

describe("card-document 基础契约", () => {
  it("不修改源字符串，且块 id 唯一、源范围合法", () => {
    for (const name of Object.keys(expected.samples)) {
      const source = loadSample(name);
      const doc = createCardDocument(source);
      expect(doc.source).toBe(source);
      const ids = new Set(doc.blocks.map((b) => b.id));
      expect(ids.size).toBe(doc.blocks.length);
      for (const b of doc.blocks) {
        expect(b.sourceStart).toBeGreaterThanOrEqual(1);
        expect(b.sourceEnd).toBeGreaterThanOrEqual(b.sourceStart);
        expect(b.sourceEnd).toBeLessThanOrEqual(source.split("\n").length);
      }
    }
  });

  it("空文档：无内容块、hasRenderableContent 为 false", () => {
    const doc = createCardDocument("");
    expect(doc.blocks).toHaveLength(0);
    expect(doc.meta.hasRenderableContent).toBe(false);
    expect(doc.meta.onlyCoverCandidate).toBe(false);
    expect(doc.omissionSummary.total).toBe(0);
  });

  it("仅 frontmatter 的文档：onlyCoverCandidate 为 true", () => {
    const doc = createCardDocument("---\ntitle: 只有封面\n---\n");
    expect(doc.frontmatter).not.toBeNull();
    expect(doc.meta.hasRenderableContent).toBe(false);
    expect(doc.meta.onlyCoverCandidate).toBe(true);
  });

  it("frontmatter 检测：未闭合的 --- 不算 frontmatter", () => {
    expect(detectFrontmatterRange(["---", "title: x"])).toBeNull();
    expect(detectFrontmatterRange(["---", "title: x", "---"])).toEqual({ startLine: 0, endLine: 2 });
    expect(parseFrontmatterFields('title: "带引号"\ndate: 2026-09-08')).toEqual({
      title: "带引号",
      date: "2026-09-08",
    });
  });

  it("不支持的自定义 HTML 块：省略并诊断为 unsupportedEmbed，不静默丢弃", () => {
    const doc = createCardDocument("# 标题\n\n<div onclick=\"x\">html</div>\n\n正文。\n");
    const htmlBlocks = omitBlocks(doc).filter((b) => b.omitReason === OmitReason.UNSUPPORTED_EMBED);
    expect(htmlBlocks).toHaveLength(1);
    expect(renderBlocks(doc).some((b) => b.type === "paragraph")).toBe(true);
  });
});

describe("card-document × 样本账本（expected.json）", () => {
  it("s1-normal：全部保留，块类型与源行匹配账本", () => {
    const doc = parse("s1-normal.md");
    const spec = expected.samples["s1-normal.md"];
    expect(doc.omissionSummary.total).toBe(spec.expectOmissionTotal);
    expect(doc.paginationMarkers).toHaveLength(spec.expectPaginationMarkers);
    const topLevel = doc.blocks.filter((b) => !b.parentId);
    expect(topLevel.map((b) => ({ type: b.type, sourceStart: b.sourceStart }))).toEqual(
      spec.expectBlocks.map((b) => ({ type: b.type, sourceStart: b.sourceLine }))
    );
    // 行内代码不等于代码块
    expect(omitBlocks(doc).filter((b) => b.omitReason === OmitReason.CODE_BLOCK)).toHaveLength(0);
    // 关键内联语义保留
    const linkPara = doc.blocks.find((b) => b.sourceStart === 5);
    expect(linkPara.text).toContain("普通链接");
  });

  it("s2-long-lists：列表结构、有序起始、任务列表与引用", () => {
    const doc = parse("s2-long-lists.md");
    const spec = expected.samples["s2-long-lists.md"];
    expect(doc.omissionSummary.total).toBe(spec.expectOmissionTotal);
    const topLevel = doc.blocks.filter((b) => !b.parentId);
    expect(topLevel.map((b) => ({ type: b.type, sourceStart: b.sourceStart }))).toEqual(
      spec.expectBlocks.map((b) => ({ type: b.type, sourceStart: b.sourceLine }))
    );
    const ordered = doc.blocks.find((b) => b.type === "list" && b.ordered);
    expect(ordered.itemCount).toBe(5);
    expect(ordered.listStart).toBe(1);
    const taskList = doc.blocks.find((b) => b.taskList === true);
    expect(taskList).toBeTruthy();
    // 嵌套三层列表：某一项标记 hasNestedList
    const nested = doc.blocks.find((b) => b.sourceStart === 9);
    expect(nested.items.some((item) => item.hasNestedList)).toBe(true);
  });

  it("s3-callout-table：callout 类型与三张表格", () => {
    const doc = parse("s3-callout-table.md");
    const spec = expected.samples["s3-callout-table.md"];
    expect(doc.omissionSummary.total).toBe(spec.expectOmissionTotal);
    const callouts = doc.blocks.filter((b) => b.type === "callout");
    expect(callouts.map((c) => c.calloutType)).toEqual(["note", "warning"]);
    const tables = doc.blocks.filter((b) => b.type === "table");
    expect(tables.map((t) => t.sourceStart)).toEqual([14, 22, 47]);
  });

  it("s4-images：三种图片来源识别（local/wiki/remote）", () => {
    const doc = parse("s4-images.md");
    const spec = expected.samples["s4-images.md"];
    expect(doc.omissionSummary.total).toBe(spec.expectOmissionTotal);
    const imgByLine = new Map(
      doc.blocks.filter((b) => b.images && b.images.length > 0).map((b) => [b.sourceStart, b.images])
    );
    expect(imgByLine.get(5)).toEqual([{ ref: "./assets/sample.png", kind: "local", gif: false }]);
    expect(imgByLine.get(9)).toEqual([{ ref: "wiki-photo.png", kind: "wiki", gif: false }]);
    expect(imgByLine.get(13)).toEqual([
      { ref: "https://example.com/images/remote-sample.png", kind: "remote", gif: false },
    ]);
    // 图片+说明同段落
    const caption = doc.blocks.find((b) => b.sourceStart === 17);
    expect(caption.images).toHaveLength(1);
    expect(caption.text).toContain("图片说明");
  });

  it("s5-filtered：互斥计数与高风险诊断", () => {
    const doc = parse("s5-filtered.md");
    const counts = expected.samples["s5-filtered.md"].expectOmissionCounts;
    expect(doc.omissionSummary.codeBlock).toBe(counts.codeBlock);
    expect(doc.omissionSummary.mermaid).toBe(counts.mermaid);
    expect(doc.omissionSummary.gif).toBe(counts.gif);
    expect(doc.omissionSummary.blockFormula).toBe(counts.blockFormula);
    expect(doc.omissionSummary.inlineFormula).toBe(counts.inlineFormula);
    expect(doc.omissionSummary.unsupportedEmbed).toBe(counts.unsupportedEmbed);
    // 高风险诊断定位
    const highRisk = doc.diagnostics.filter((d) => d.highRisk);
    expect(highRisk.map((d) => d.sourceStart).sort((a, b) => a - b)).toEqual([31, 34]);
    // 结尾正常段保留
    const trailing = doc.blocks.find((b) => b.sourceStart === 49);
    expect(trailing.disposition).toBe("render");
    // mermaid 不计入 codeBlock（互斥）
    const mermaidBlocks = omitBlocks(doc).filter((b) => b.type === "mermaid");
    expect(mermaidBlocks).toHaveLength(1);
    expect(mermaidBlocks[0].omitReason).toBe(OmitReason.MERMAID);
  });

  it("s6-pagination（默认配置）：独立块级标记生效，围栏/行内伪标记不触发，Setext/hr 语义保持", () => {
    const doc = parse("s6-pagination.md");
    const spec = expected.samples["s6-pagination.md"];
    expect(doc.paginationMarkers.map((m) => m.line)).toEqual(spec.expectMarkerLines);
    expect(doc.paginationMarkers).toHaveLength(spec.expectPaginationMarkers);
    // 连写两个 → 同一块 markerCount=2
    const double = doc.blocks.find((b) => b.type === "paginationMarker" && b.markerCount === 2);
    expect(double.sourceStart).toBe(15);
    // 围栏内的伪标记：整个代码块被省略（codeBlock 诊断），但不产生分页标记
    expect(doc.blocks.some((b) => b.sourceStart === 23 && b.type === "codeBlock")).toBe(true);
    // hr 保留
    expect(doc.blocks.find((b) => b.type === "hr").sourceStart).toBe(35);
    // Setext 标题保留（=== 不是分页符）
    const setext = doc.blocks.find((b) => b.sourceStart === 41);
    expect(setext.type).toBe("heading");
    // 分页标记之间的内容段保留（无内容丢失）
    expect(doc.blocks.find((b) => b.sourceStart === 7).disposition).toBe("render");
    expect(doc.blocks.find((b) => b.sourceStart === 48).disposition).toBe("render");
  });

  it("s6-pagination（开启 === 兼容）：Setext 位置的 === 变为分页符，标记数 +1", () => {
    const doc = parse("s6-pagination.md", { enableLegacyEqualsBreak: true });
    expect(doc.options.enableLegacyEqualsBreak).toBe(true);
    expect(doc.paginationMarkers).toHaveLength(5);
    // L42 的 === 成为分页标记，L41 不再是 heading 而是普通段
    expect(doc.paginationMarkers.some((m) => m.line === 42)).toBe(true);
    const prevBlock = doc.blocks.find((b) => b.sourceStart === 41);
    expect(prevBlock.type).toBe("paragraph");
  });

  it("s7-long-cover：frontmatter 范围与字段、正文不受影响", () => {
    const doc = parse("s7-long-cover.md");
    const spec = expected.samples["s7-long-cover.md"];
    expect(doc.frontmatter.startLine).toBe(spec.expectFrontmatter.startLine);
    expect(doc.frontmatter.endLine).toBe(spec.expectFrontmatter.endLine);
    expect(doc.frontmatter.fields.title).toBeTruthy();
    expect(doc.frontmatter.fields.author).toBeTruthy();
    expect(doc.frontmatter.fields.date).toBe("2026-09-08");
    expect(doc.frontmatter.fields.description).toBeTruthy();
    const topLevel = doc.blocks.filter((b) => !b.parentId);
    expect(topLevel.map((b) => ({ type: b.type, sourceStart: b.sourceStart }))).toEqual(
      spec.expectBlocks.map((b) => ({ type: b.type, sourceStart: b.sourceLine }))
    );
    expect(doc.omissionSummary.total).toBe(0);
  });

  it("防误判：正文文字中出现 card:break 字样的行内代码不计入标记", () => {
    const doc = createCardDocument(
      "# 标题\n\n行内 `<!-- card:break -->` 与独立注释不同。\n"
    );
    expect(doc.paginationMarkers).toHaveLength(0);
    expect(doc.blocks.some((b) => b.type === "paginationMarker")).toBe(false);
  });
});
