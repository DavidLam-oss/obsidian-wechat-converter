import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const STYLE_FRAGMENTS = [
  "styles/base.css",
  "styles/toolbar.css",
  "styles/ai-layout.css",
  "styles/style-panel.css",
  "styles/preview.css",
  "styles/settings-base.css",
  "styles/wechat-settings.css",
  "styles/wechat-publish.css",
  "styles/multi-platform.css",
  "styles/settings-tabs.css",
  "styles/feishu.css",
  "styles/material-picker.css",
];

async function buildStyles() {
  const chunks = await Promise.all(STYLE_FRAGMENTS.map((filePath) => readFile(filePath, "utf8")));
  return chunks.join("");
}

const checkOnly = process.argv.includes("--check");
const outputPath = "styles.css";
const nextContent = await buildStyles();

if (checkOnly) {
  const currentContent = await readFile(outputPath, "utf8");
  if (currentContent !== nextContent) {
    console.error("[build-styles] styles.css is out of date. Run npm run generate:styles.");
    process.exit(1);
  }
  console.log("[build-styles] styles.css is up to date.");
} else {
  await writeFile(outputPath, nextContent, "utf8");
  console.log("[build-styles] generated styles.css from CSS fragments.");
}
