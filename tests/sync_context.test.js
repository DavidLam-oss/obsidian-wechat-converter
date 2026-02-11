import { describe, it, expect } from 'vitest';
const { resolveSyncAccount, toSyncFriendlyMessage } = require('../services/sync-context');

describe('Sync Context Service', () => {
  it('resolveSyncAccount should prefer selected account id', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: 'b',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'b', name: 'B' });
  });

  it('resolveSyncAccount should fallback to default account id', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: '',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'a', name: 'A' });
  });

  it('toSyncFriendlyMessage should map 45002 to user friendly message', () => {
    const msg = toSyncFriendlyMessage('create draft failed (45002)');
    expect(msg).toContain('文章太长，微信接口拒收');
  });

  it('toSyncFriendlyMessage should keep other errors unchanged', () => {
    expect(toSyncFriendlyMessage('network error')).toBe('network error');
  });
});
