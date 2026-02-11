function normalizeVaultPath(vaultPath) {
  if (typeof vaultPath !== 'string') return '';
  return vaultPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function isAbsolutePathLike(vaultPath) {
  if (typeof vaultPath !== 'string') return false;
  const trimmed = vaultPath.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  return /^[a-zA-Z]:[\\/]/.test(trimmed);
}

module.exports = {
  normalizeVaultPath,
  isAbsolutePathLike,
};
