// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 卡片导出路径安全测试（B04，规划 §6.1）：
   文件名净化（非法字符/保留名/尾随点空格/长度/空回落）、导出根目录校验
   （绝对路径/.. /空字节/保留目录大小写等价/`.` 开头段/非法字符拒绝而非静默修改）、
   笔记目录名与批次目录命名、图片文件名编号、错误信息脱敏。 */

import {
  DEFAULT_EXPORT_ROOT,
  EXPORT_MANIFEST_NAME,
  NOTE_SEGMENT_MAX_LENGTH,
  sanitizeFileSegment,
  shortSourceKey,
  isReservedOutputPath,
  validateExportRoot,
  buildNoteDirName,
  buildBatchDirName,
  imageFileName,
  sanitizeExportMessage,
} from "../services/card-export-paths.js";

describe("sanitizeFileSegment", () => {
  it("保留正常中英文名", () => {
    expect(sanitizeFileSegment("我的笔记 2026")).toBe("我的笔记 2026");
    expect(sanitizeFileSegment("reading-list")).toBe("reading-list");
  });

  it("替换非法字符与控制字符", () => {
    expect(sanitizeFileSegment('a<b>c:d"e/f\\g|h?i*j')).toBe("a-b-c-d-e-f-g-h-i-j");
    expect(sanitizeFileSegment("bad\u0007name")).toContain("bad");
    expect(sanitizeFileSegment("bad\u0007name")).not.toContain("\u0007");
  });

  it("去掉尾随点与空格（Windows 语义）", () => {
    expect(sanitizeFileSegment("note... ")).toBe("note");
    expect(sanitizeFileSegment("  ")).toBe("note");
  });

  it("拒绝 Windows 保留名 → 中性占位", () => {
    for (const name of ["CON", "prn", "Aux", "NUL", "COM1", "lpt9"]) {
      expect(sanitizeFileSegment(name)).toBe("note");
    }
  });

  it("钳制长度并再次清理尾随点", () => {
    const long = "长".repeat(NOTE_SEGMENT_MAX_LENGTH + 10) + "..";
    const out = sanitizeFileSegment(long);
    expect([...out].length).toBeLessThanOrEqual(NOTE_SEGMENT_MAX_LENGTH);
    expect(out.endsWith(".")).toBe(false);
  });
});

describe("shortSourceKey / buildNoteDirName", () => {
  it("短标识稳定且区分不同来源", () => {
    const a = shortSourceKey("notes/日记.md");
    const b = shortSourceKey("notes/日记.md");
    const c = shortSourceKey("other/日记.md");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-z]{6}$/);
  });

  it("笔记目录名 = 净化后的笔记名，人可读且不带哈希/随机后缀", () => {
    const one = buildNoteDirName("notes/我的笔记.md");
    expect(one.dirName).toBe("我的笔记");
    expect(one.noteKey).toMatch(/^[0-9a-z]{6}$/);
    expect(one.dirName).not.toContain(one.noteKey);
  });

  it("同名不同路径共享同一分组目录；短标识仍可区分来源（供诊断）", () => {
    const one = buildNoteDirName("notes/我的笔记.md");
    const two = buildNoteDirName("archive/我的笔记.md");
    expect(one.dirName).toBe(two.dirName);
    expect(one.noteKey).not.toBe(two.noteKey);
  });

  it("净化后为空的笔记名回落中性占位", () => {
    expect(buildNoteDirName("notes/CON.md").dirName).toBe("note");
  });
});

describe("isReservedOutputPath", () => {
  it("拒绝保留目录与 . 开头段（大小写等价）", () => {
    for (const p of [".obsidian", ".obsidian/plugins/x", ".TRASH/y", ".Git/objects", "notes/.hidden/a"]) {
      expect(isReservedOutputPath(p, ".obsidian")).toBe(true);
    }
  });

  it("拒绝默认配置目录本体与子目录（含用户自定义位置）", () => {
    expect(isReservedOutputPath("config", "config")).toBe(true);
    expect(isReservedOutputPath("CONFIG/sub", "config")).toBe(true);
    expect(isReservedOutputPath("my-settings/notes", "my-settings")).toBe(true);
  });

  it("普通目录放行；configDir 非前缀不误伤", () => {
    expect(isReservedOutputPath("卡片导出/我的笔记-x/2026-batch", ".obsidian")).toBe(false);
    expect(isReservedOutputPath("obsidian-backup/a", ".obsidian")).toBe(false);
    expect(isReservedOutputPath("notes/my.obsidian", ".obsidian")).toBe(false);
  });

  it("空路径视为保留", () => {
    expect(isReservedOutputPath("", ".obsidian")).toBe(true);
  });
});

describe("validateExportRoot", () => {
  it("空配置回落默认目录", () => {
    expect(validateExportRoot("")).toEqual({ ok: true, root: DEFAULT_EXPORT_ROOT });
    expect(validateExportRoot("   ")).toEqual({ ok: true, root: DEFAULT_EXPORT_ROOT });
  });

  it("合法 vault 相对目录通过并规范化分隔符", () => {
    expect(validateExportRoot("导出/卡片")).toEqual({ ok: true, root: "导出/卡片" });
    expect(validateExportRoot("导出//卡片/")).toEqual({ ok: true, root: "导出/卡片" });
  });

  it("拒绝绝对路径、盘符与网络共享", () => {
    for (const p of ["/etc", "C:\\Users", "C:/x", "\\\\srv\\share", "//srv/share"]) {
      expect(validateExportRoot(p).ok).toBe(false);
    }
  });

  it("拒绝 .. 与 . 路径段及空字节", () => {
    expect(validateExportRoot("a/../b").reason).toBe("path-parent-escape");
    expect(validateExportRoot("a/./b").reason).toBe("path-parent-escape");
    expect(validateExportRoot("a\u0000b").reason).toBe("path-null-byte");
  });

  it("拒绝保留目录与 . 开头段", () => {
    expect(validateExportRoot(".obsidian").reason).toBe("path-reserved");
    expect(validateExportRoot(".trash/x").reason).toBe("path-reserved");
    expect(validateExportRoot("notes/.hidden").reason).toBe("path-reserved");
    expect(validateExportRoot("config", { configDir: "config" }).reason).toBe("path-reserved");
  });

  it("拒绝含非法字符的配置（不静默修改成另一条路径）", () => {
    expect(validateExportRoot('a<b').reason).toBe("path-illegal-chars");
    expect(validateExportRoot("a|b").reason).toBe("path-illegal-chars");
  });
});

describe("buildBatchDirName / imageFileName", () => {
  it("批次名 = 本地时间戳，人可读且冒号已替换为连字符", () => {
    const name = buildBatchDirName({ now: () => new Date(2026, 8, 10, 22, 30, 5) });
    expect(name).toBe("2026-09-10 22-30-05");
    expect(name.includes(":")).toBe(false);
  });

  it("同秒冲突按 attempt 追加序号，保持唯一且绝不覆盖", () => {
    const at = () => new Date(2026, 8, 10, 22, 30, 5);
    expect(buildBatchDirName({ now: at, attempt: 0 })).toBe("2026-09-10 22-30-05");
    expect(buildBatchDirName({ now: at, attempt: 1 })).toBe("2026-09-10 22-30-05-2");
    expect(buildBatchDirName({ now: at, attempt: 3 })).toBe("2026-09-10 22-30-05-4");
    // 非法/负值 attempt 回落基础名
    expect(buildBatchDirName({ now: at, attempt: -1 })).toBe("2026-09-10 22-30-05");
    expect(buildBatchDirName({ now: at })).toBe("2026-09-10 22-30-05");
  });

  it("正文图片名按 1-based 页号补零，编号可不连续", () => {
    expect(imageFileName(1)).toBe("card-001.png");
    expect(imageFileName(7)).toBe("card-007.png");
    expect(imageFileName(42)).toBe("card-042.png");
  });

  it("清单文件名固定", () => {
    expect(EXPORT_MANIFEST_NAME).toBe("export-manifest.json");
  });
});

describe("sanitizeExportMessage", () => {
  it("剥离 POSIX 绝对路径", () => {
    const out = sanitizeExportMessage("EACCES: permission denied, open /Users/david/secret/x.png");
    expect(out).not.toContain("/Users/david");
    expect(out).toContain("[路径]");
  });

  it("剥离 Windows 盘符路径与 UNC", () => {
    expect(sanitizeExportMessage("open C:\\Users\\d\\x.png failed")).not.toContain("C:\\Users");
    expect(sanitizeExportMessage("\\\\srv\\share\\f.png denied")).not.toContain("srv");
  });

  it("保留普通错误词与相对路径信息", () => {
    const out = sanitizeExportMessage("capture timeout: modern-screenshot (15000ms)");
    expect(out).toBe("capture timeout: modern-screenshot (15000ms)");
  });
});
