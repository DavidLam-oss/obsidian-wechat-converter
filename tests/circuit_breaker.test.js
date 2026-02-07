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
    obsidian.requestUrl.mockResolvedValue({
      json: { errcode: 40001, errmsg: 'invalid credential' }
    });

    try {
        await api.requestWithRetry(async () => {
            const res = await api.sendRequest('http://test');
            if (res.errcode) throw new Error(JSON.stringify(res));
        }, 1); // 1 retry
    } catch (error) {
        expect(error.isFatal).toBeUndefined();
        return; // Success if error caught but not fatal
    }
    // Fail if no error thrown
    throw new Error('Should have thrown a non-fatal error');
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
        // Setup: 5 items with concurrency 3 (default)
        // If fail-fast works, it should stop after the first batch (or slightly more due to race),
        // but definitely NOT process all 5.
        const inputHtml = `
            <div>
                <svg id="1"></svg>
                <svg id="2"></svg>
                <svg id="3"></svg>
                <svg id="4"></svg>
                <svg id="5"></svg>
            </div>
        `;

        // Mock: First upload throws FATAL error
        const fatalError = new Error('Fatal 45009');
        fatalError.isFatal = true;

        mockApi.uploadImage
            .mockRejectedValueOnce(fatalError) // 1st fails fatally
            .mockResolvedValue({ url: 'http://ok' }); // Others would succeed

        // Execute
        try {
            await view.processMathFormulas(inputHtml, mockApi);
        } catch (e) {
            expect(e.message).toBe('Fatal 45009');

            // Verification:
            // Concurrency is 3 (default).
            // Items 1, 2, 3 start immediately (synchronously pushed to executing queue).
            // Item 1 fails -> sets isFailed = true.
            // Loop checks isFailed -> breaks.
            // Items 4, 5 never start.
            // So we expect exactly 3 calls.
            expect(mockApi.uploadImage).toHaveBeenCalledTimes(3);
            return;
        }
        // Fail if no error thrown
        throw new Error('Should have thrown fatal error');
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

  describe('Image Processing Abortion (processAllImages)', () => {
    let view;
    let mockApi;

    beforeEach(() => {
        view = new AppleStyleView(null, null);
        // Mock srcToBlob to bypass network/file reads
        view.srcToBlob = vi.fn().mockResolvedValue(new Blob(['']));

        mockApi = {
            uploadImage: vi.fn()
        };
    });

    it('should abort image processing immediately upon encountering a fatal error', async () => {
        // Setup: 5 images
        const inputHtml = `
            <div>
                <img src="1.jpg" />
                <img src="2.jpg" />
                <img src="3.jpg" />
                <img src="4.jpg" />
                <img src="5.jpg" />
            </div>
        `;

        // Mock: First upload throws FATAL error (e.g. 45001 Quota Full)
        const fatalError = new Error('Fatal 45001');
        fatalError.isFatal = true;

        mockApi.uploadImage
            .mockRejectedValueOnce(fatalError) // 1st fails fatally
            .mockResolvedValue({ url: 'http://ok' }); // Others would succeed

        // Execute
        try {
            await view.processAllImages(inputHtml, mockApi);
        } catch (e) {
            expect(e.message).toBe('Fatal 45001');

            // Verification:
            // Concurrency is 3.
            // 1, 2, 3 start. 1 fails. Loop breaks. 4, 5 never start.
            expect(mockApi.uploadImage).toHaveBeenCalledTimes(3);
            return;
        }
        // Fail if no error thrown
        throw new Error('Should have thrown fatal error');
    });
  });
});
