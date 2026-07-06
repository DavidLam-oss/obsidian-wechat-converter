import fs from "node:fs";
import { execFileSync } from "node:child_process";

const GENERATED_ARTIFACTS = [
  "main.js",
  "styles.css",
  "services/generated-embedded-deps.js",
  "services/ai-layout-runtime/generated-skills.js",
];

function readArtifact(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

function buffersEqual(left, right) {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

const before = new Map(GENERATED_ARTIFACTS.map((filePath) => [filePath, readArtifact(filePath)]));

execFileSync("npm", ["run", "build"], { stdio: "inherit" });

const changed = GENERATED_ARTIFACTS.filter((filePath) => {
  const previous = before.get(filePath);
  const current = readArtifact(filePath);
  return !buffersEqual(previous, current);
});

if (changed.length > 0) {
  console.error("[check-build-artifacts] Build changed generated artifacts:");
  for (const filePath of changed) {
    console.error(`- ${filePath}`);
  }
  console.error("[check-build-artifacts] Commit the regenerated files, then rerun npm run check:build-artifacts.");
  process.exit(1);
}

console.log("[check-build-artifacts] Generated build artifacts are reproducible.");
