/*
## 核心功能

验证 converter.js 与 services/ 模块中路径处理双份实现的严格一致性（Parity Check）：
1. converter.js 与 services/path-utils.js 中的 collapsePathSegments 行为对齐；
2. converter.js 与 services/image-source-utils.js 中的 normalizeAbsoluteLocalPath 行为对齐；
3. converter.js 与 services/image-source-utils.js 中的 getVaultRelativePathFromLocalPath 行为对齐；
4. converter.js 与 services/image-source-utils.js 中的 getFileUrlLocalPath 行为对齐。

## 维护规则

- 保持单文件在 800 行软限制以内。
- 若一方发生改动导致测试报错，必须确认改动意图并同步更新另一方。
*/

import { describe, it, expect } from "vitest";
import { collapsePathSegments as serviceCollapsePathSegments } from "../services/path-utils.js";
import {
  getFileUrlLocalPath as serviceGetFileUrlLocalPath,
  normalizeAbsoluteLocalPath as serviceNormalizeAbsoluteLocalPath,
  getVaultRelativePathFromLocalPath as serviceGetVaultRelativePathFromLocalPath,
} from "../services/image-source-utils.js";

const AppleStyleConverter = require("../converter.js");
const converterHelpers = AppleStyleConverter._internal;

describe("converter 与 services 路径处理一致性对照测试", () => {
  describe("collapsePathSegments 对齐", () => {
    const testCases = [
      "",
      "   ",
      "folder/sub/file.png",
      "folder/./sub/../file.png",
      "../file.png",
      "../../folder/file.png",
      "folder/../../file.png",
      "a/b/c/../../d",
      "a/b/c/../../../..",
      "windows\\path\\to\\file.png",
      "windows\\..\\file.png",
    ];

    testCases.forEach((input) => {
      it(`输入: "${input}"`, () => {
        const converterResult = converterHelpers.collapsePathSegments(input);
        const serviceResult = serviceCollapsePathSegments(input);
        expect(converterResult).toBe(serviceResult);
      });
    });
  });

  describe("normalizeAbsoluteLocalPath 对齐", () => {
    const testCases = [
      "",
      "   ",
      "/Users/alice/vault/note.md",
      "//Users//alice///vault//note.md/",
      "C:\\Users\\alice\\vault\\note.md",
      "C:/Users/alice/vault/note.md/",
      "D:\\\\vault\\\\sub\\\\image.png",
      "/var/log/app/../../etc/passwd",
    ];

    testCases.forEach((input) => {
      it(`输入: "${input}"`, () => {
        const converterResult = converterHelpers.normalizeAbsoluteLocalPath(input);
        const serviceResult = serviceNormalizeAbsoluteLocalPath(input);
        expect(converterResult).toBe(serviceResult);
      });
    });
  });

  describe("getVaultRelativePathFromLocalPath 对齐", () => {
    const mockAppUnix = {
      vault: {
        adapter: {
          basePath: "/Users/test/vault",
        },
      },
    };

    const mockAppWindows = {
      vault: {
        adapter: {
          basePath: "C:\\Users\\test\\vault",
        },
      },
    };

    const testCases = [
      { app: mockAppUnix, local: "/Users/test/vault/attachments/img.png" },
      { app: mockAppUnix, local: "//Users//test//vault///attachments//sub//img.png" },
      { app: mockAppUnix, local: "/Users/test/vault" },
      { app: mockAppUnix, local: "/Users/test/vault/" },
      { app: mockAppUnix, local: "/Users/test/other-vault/img.png" },
      { app: mockAppUnix, local: "" },
      { app: null, local: "/Users/test/vault/img.png" },
      { app: mockAppWindows, local: "C:\\Users\\test\\vault\\attachments\\img.png" },
      { app: mockAppWindows, local: "C:/Users/test/vault/attachments/nested/img.png" },
      { app: mockAppWindows, local: "D:\\Users\\test\\vault\\attachments\\img.png" },
    ];

    testCases.forEach(({ app, local }, idx) => {
      it(`测试用例 #${idx + 1}: ${local}`, () => {
        const converterResult = converterHelpers.getVaultRelativePathFromLocalPath(app, local);
        const serviceResult = serviceGetVaultRelativePathFromLocalPath(app, local);
        expect(converterResult).toBe(serviceResult);
      });
    });
  });

  describe("getFileUrlLocalPath 对齐", () => {
    const testCases = [
      "",
      "https://example.com/img.png",
      "file:///Users/name/vault/img.png",
      "file:///Users/name/vault/my%20spaced%20image.png",
      "file:///C:/Users/name/vault/img.png",
      "file:///d:/vault/img.png",
      "app://obsidian.md/icon.png",
    ];

    testCases.forEach((input) => {
      it(`输入: "${input}"`, () => {
        const converterResult = converterHelpers.getFileUrlLocalPath(input);
        const serviceResult = serviceGetFileUrlLocalPath(input);
        expect(converterResult).toBe(serviceResult);
      });
    });
  });
});
