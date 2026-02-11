# Releasing

This project now uses the standard Obsidian three-file runtime.

## Release Checklist

1. Update version in `manifest.json`.
2. Update version in `package.json` (keep it aligned with `manifest.json`).
3. Append mapping in `versions.json`:
   - `"pluginVersion": "minAppVersion"`
4. Run tests and build:
   - `npm test -- --run`
   - `npm run build`
5. Build and validate release artifact:
   - `npm run release:pack`
   - `npm run release:validate`
6. Create git tag (same as plugin version, supports both `2.5.5` and `v2.5.5`):
   - `git tag v2.5.5`
   - `git push origin v2.5.5`
7. Create GitHub Release for that tag and upload:
   - `obsidian-wechat-converter.zip`
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `versions.json`

## Required Files In Zip

- `main.js`
- `manifest.json`
- `styles.css`
- `README.md`
- `LICENSE`

## BRAT Notes

- BRAT updates should be verified against:
  - Fresh install in a clean vault
  - Upgrade path from previous version
- Tag push triggers automated release workflow at `.github/workflows/release.yml`.
- You can also use **Actions -> Release Package -> Run workflow** on a branch for dry-run validation (test/build/package/validate), without creating a GitHub Release.
- If runtime file set changes, update:
  - `package-release.sh`
  - `scripts/release-validate.mjs`
  - `README.md` installation instructions
