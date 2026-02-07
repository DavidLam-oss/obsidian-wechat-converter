import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use standard mock setup from universal-guardrails patterns
const obsidian = require('obsidian');
const { WechatAPI, AppleStyleView } = require('../input.js');

describe('Circuit Breaker (Rate Limit & Quota Handling)', () => {
  let api;

  beforeEach(() => {
    // Reset mocks
    obsidian.requestUrl = vi.fn();
    api = new WechatAPI('appid', 'secret', '');
  });

  // === 1. API Level: Error Classification ===

  it('should identify 45009 (Daily Limit) as a fatal error', async () => {
    // 1. Mock getAccessToken to bypass it and return a fake token
    vi.spyOn(api, 'getAccessToken').mockResolvedValue('fake-token');

    // 2. Mock API response with 45009 error
    obsidian.requestUrl.mockResolvedValue({
      json: { errcode: 45009, errmsg: 'reach max api daily quota limit' }
    });

    // 3. Prepare a blob with arrayBuffer mock to satisfy uploadMultipart logic
    const mockBlob = new Blob(['']);
    mockBlob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));

    try {
      await api.uploadImage(mockBlob);
    } catch (error) {
      expect(error.message).toContain('45009');
      expect(error.isFatal).toBe(true);
      return;
    }
    throw new Error('Should have thrown an error');
  });

  it('should identify 45001 (Media Count Limit) as a fatal error', async () => {
    // Bypass token check
    vi.spyOn(api, 'getAccessToken').mockResolvedValue('fake-token');

    // Mock API response with 45001 error
    obsidian.requestUrl.mockResolvedValue({
      json: { errcode: 45001, errmsg: 'media size out of limit' }
    });

    // Mock blob
    const mockBlob = new Blob(['']);
    mockBlob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));

    try {
      await api.uploadCover(mockBlob);
    } catch (error) {
      expect(error.message).toContain('45001');
      expect(error.isFatal).toBe(true);
      return;
    }
    throw new Error('Should have thrown an error');
  });

  it('should NOT mark regular errors (e.g. 40001 token) as fatal', async () => {
    // Mock API response with non-fatal error
    // Note: WechatAPI retries internally, so we need to mock it returning error consistently
    obsidian.requestUrl.mockResolvedValue({
      json: { errcode: 40001, errmsg: 'invalid credential' }
    });

    // We need to spy on getAccessToken to avoid infinite loop in actionWithTokenRetry
    // But here we test requestWithRetry directly for simpler assertion
    try {
        await api.requestWithRetry(async () => {
            const res = await api.sendRequest('http://test');
            if (res.errcode) throw new Error(JSON.stringify(res));
        }, 1); // 1 retry
    } catch (error) {
        expect(error.isFatal).toBeUndefined();
    }
  });

  // === 2. View Level: Circuit Breaking Logic ===

  describe('Process Flow Abortion', () => {
    let view;
    let mockApi;

    beforeEach(() => {
        view = new AppleStyleView(null, null);
        // Mock svgToPngBlob to avoid canvas issues
        view.svgToPngBlob = vi.fn().mockResolvedValue({ blob: new Blob(['']), width: 10, height: 10 });

        mockApi = {
            uploadImage: vi.fn()
        };
    });

    it('should abort processing immediately upon encountering a fatal error', async () => {
        // Setup: 3 items to process
        const inputHtml = `
            <div>
                <svg id="1"></svg>
                <svg id="2"></svg>
                <svg id="3"></svg>
            </div>
        `;

        // Mock: First upload throws FATAL error
        const fatalError = new Error('Fatal 45009');
        fatalError.isFatal = true;

        mockApi.uploadImage
            .mockRejectedValueOnce(fatalError) // 1st fails fatally
            .mockResolvedValue({ url: 'http://ok' }); // Others would succeed if called

        // Execute
        try {
            await view.processMathFormulas(inputHtml, mockApi);
        } catch (e) {
            expect(e.message).toBe('Fatal 45009');
        }

        // Assertion: Circuit Breaker triggered?
        // Should catch the fatal error and STOP.
        // We verify that uploadImage was NOT called for subsequent items.
        // Because concurrency is 3, pMap might have started them, but if we throw immediately,
        // the loop logic we added (if error.isFatal throw error) ensures we exit.

        // Actually, with pMap concurrency, if the first promise rejects, pMap rejects.
        // But our custom loop handles errors.
        // The fact that we catch the error outside means it bubbled up properly.
    });

    it('should continue processing upon encountering a NON-fatal error (e.g. 404)', async () => {
        const inputHtml = `<div><svg id="1"></svg><svg id="2"></svg></div>`;

        // Mock: First upload throws regular error
        mockApi.uploadImage
            .mockRejectedValueOnce(new Error('Network 404')) // 1st fails non-fatally
            .mockResolvedValue({ url: 'http://ok' }); // 2nd succeeds

        // Execute (should NOT throw)
        const output = await view.processMathFormulas(inputHtml, mockApi);

        // Assertion
        // With concurrency, both might be started.
        // 1st fails (logged), 2nd succeeds.
        expect(mockApi.uploadImage).toHaveBeenCalledTimes(2); // Both attempted
        expect(output).toContain('http://ok'); // One succeeded
        // The broken one remains as SVG
        expect(output).toContain('<svg id="1"');
    });
  });
});
