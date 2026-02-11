import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Failed to parse JSON: ${filePath}\n${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function resolveZipPath() {
  const argZip = process.argv.find((arg) => arg.startsWith("--zip="));
  if (argZip) return argZip.slice("--zip=".length);

  const pkg = readJson(path.join(ROOT, "package.json"));
  return `${pkg.name}.zip`;
}

function listZipEntries(zipPath) {
  const cmd = `unzip -Z1 "${zipPath}"`;
  try {
    return execSync(cmd, { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    fail(`Failed to read zip entries via unzip command: ${zipPath}\n${error.message}`);
  }
}

function hasPrefix(entries, prefix) {
  return entries.some((entry) => entry.startsWith(prefix));
}

function main() {
  const manifest = readJson(path.join(ROOT, "manifest.json"));
  const versions = readJson(path.join(ROOT, "versions.json"));

  assert(typeof manifest.version === "string" && manifest.version.length > 0, "manifest.json: missing version");
  assert(typeof manifest.minAppVersion === "string" && manifest.minAppVersion.length > 0, "manifest.json: missing minAppVersion");
  assert(Object.prototype.hasOwnProperty.call(versions, manifest.version), `versions.json: missing key for version ${manifest.version}`);
  assert(
    versions[manifest.version] === manifest.minAppVersion,
    `versions.json: expected ${manifest.version} -> ${manifest.minAppVersion}, got ${versions[manifest.version]}`
  );
  ok(`versions.json mapping OK: ${manifest.version} -> ${manifest.minAppVersion}`);

  const zipPath = path.join(ROOT, resolveZipPath());
  assert(fs.existsSync(zipPath), `Missing release zip: ${zipPath}. Run npm run release:pack first.`);

  const entries = listZipEntries(zipPath);
  const requiredFiles = ["main.js", "manifest.json", "styles.css", "converter.js", "README.md", "LICENSE"];
  for (const file of requiredFiles) {
    assert(entries.includes(file), `Zip missing required file: ${file}`);
  }

  const requiredPrefixes = ["lib/", "themes/", "images/"];
  for (const prefix of requiredPrefixes) {
    assert(hasPrefix(entries, prefix), `Zip missing required directory contents: ${prefix}`);
  }

  assert(!entries.some((entry) => entry.startsWith("/") || entry.includes("..")), "Zip contains unsafe paths");
  ok(`Zip artifact validated: ${path.basename(zipPath)} (${entries.length} entries)`);

  console.log("Release artifact validation passed.");
}

main();
