/*
## 核心功能

实现飞书云文档同步链路的 feishu api 服务能力。

## 输入

接收飞书设置、Markdown/HTML 内容、本地图片、Mermaid 图和飞书 API 响应。

## 输出

输出 `FeishuApiClient`，用于文档创建/更新、媒体上传、块写入或错误恢复。

## 定位

位于 services/，属于飞书发布服务层；不承载微信专属逻辑。

## 依赖

关键依赖：`./dom-utils.js`、`./feishu-multipart.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic API responses without strict typescript type annotations */
// services/feishu-api.js
//
// Stateless / low-level API client for Feishu OpenAPI using Obsidian's requestUrl.
// Has zero knowledge of the Obsidian vault structure or settings UI.
// Only returns promises with parsed responses.

import { getActiveWindowValue } from './dom-utils.js';
import { buildMultipartBody } from './feishu-multipart.js';

class FeishuApiClient {
  /**
   * @param {string} appId
   * @param {string} appSecret
   * @param {any} [requestUrl] Injected requestUrl implementation
   * @param {{ onApiCall?: (label: string, options: Record<string, unknown>) => void }} [options]
   */
  constructor(appId, appSecret, requestUrl, options = {}) {
    this.appId = String(appId || '').trim();
    this.appSecret = String(appSecret || '').trim();
    this.accessToken = '';
    this.tokenExpiry = 0;
    this.baseUrl = 'https://open.feishu.cn/open-apis';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- reason: dynamic requestUrl extraction
    const obsidianApi = getActiveWindowValue('obsidian');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- reason: dynamic requestUrl extraction
    this.requestUrl = requestUrl || (obsidianApi && typeof obsidianApi.requestUrl === 'function' ? obsidianApi.requestUrl : null);
    this.onApiCall = typeof options.onApiCall === 'function' ? options.onApiCall : null;
  }

  /**
   * @param {string} label
   * @param {Record<string, unknown>} options
   * @returns {void}
   */
  recordApiCall(label, options) {
    if (typeof this.onApiCall !== 'function') return;
    try {
      this.onApiCall(label, options);
    } catch (err) {
      console.warn('[飞书同步] API 调用计数失败:', err);
    }
  }

  /**
   * Obsidian requestUrl throws before exposing Feishu's JSON body on HTTP 400+ by default.
   * Keep requests non-throwing here so user-facing errors include the failing endpoint and Feishu message.
   * @param {string} label
   * @param {Record<string, unknown>} options
   * @returns {Promise<any>}
   */
  async sendRequest(label, options) {
    if (typeof this.requestUrl !== 'function') {
      throw new Error('当前 Obsidian 环境不支持 requestUrl，无法访问飞书 OpenAPI');
    }

    const requestOptions = {
      ...options,
      throw: false,
    };

    let resp;
    try {
      resp = await this.requestUrl(requestOptions);
    } catch (err) {
      this.recordApiCall(label, requestOptions);
      throw this.createTransportError(label, options.url, err);
    }
    this.recordApiCall(label, requestOptions);

    const status = Number(resp?.status || 0);
    if (status >= 400) {
      throw this.createHttpError(label, options.url, resp);
    }
    return resp;
  }

  /**
   * @param {string} label
   * @param {unknown} url
   * @param {unknown} err
   * @returns {Error}
   */
  createTransportError(label, url, err) {
    const message = err && typeof err === 'object' && 'message' in err
      ? err.message
      : String(err || '未知网络错误');
    return new Error(`${label} 请求失败：${message} (${this.formatEndpoint(url)})`);
  }

  /**
   * @param {string} label
   * @param {unknown} url
   * @param {any} resp
   * @returns {Error}
   */
  createHttpError(label, url, resp) {
    const status = Number(resp?.status || 0);
    const details = this.formatResponseDetails(resp);
    return new Error(`${label} 请求失败，HTTP ${status}${details ? `：${details}` : ''} (${this.formatEndpoint(url)})`);
  }

  /**
   * @param {any} resp
   * @returns {string}
   */
  formatResponseDetails(resp) {
    let json = null;
    try {
      json = resp?.json;
    } catch {
      json = null;
    }
    if (json && typeof json === 'object') {
      const code = json.code ?? json.Code ?? '';
      const msg = json.msg || json.message || json.Message || json.error || '';
      const requestId = json.request_id || json.requestId || json.log_id || '';
      return [
        code !== '' ? `code ${code}` : '',
        msg ? String(msg) : '',
        requestId ? `request_id ${requestId}` : '',
      ].filter(Boolean).join(', ');
    }
    const text = String(resp?.text || '').trim();
    return text.length > 300 ? `${text.slice(0, 300)}...` : text;
  }

  /**
   * @param {unknown} url
   * @returns {string}
   */
  formatEndpoint(url) {
    const value = String(url || '');
    return value.replace(this.baseUrl, '');
  }

  /**
   * Gets the tenant_access_token, refreshing it if expired.
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiry > now + 60 * 1000) {
      return this.accessToken;
    }

    if (!this.appId || !this.appSecret) {
      throw new Error('未配置飞书 AppID 或 AppSecret，无法获取 Access Token');
    }

    const url = `${this.baseUrl}/auth/v3/tenant_access_token/internal`;
    const resp = await this.sendRequest('获取飞书 tenant_access_token', {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`获取飞书 tenant_access_token 失败 (code ${data.code}): ${data.msg}`);
    }

    const token = data.tenant_access_token || '';
    if (!token) {
      throw new Error('飞书接口返回数据中缺少 tenant_access_token');
    }

    // Cache the token. Feishu token usually lasts 2 hours (7200 seconds).
    // Subtract 5 minutes buffer.
    const expireIn = Number(data.expire || 7200);
    this.accessToken = token;
    this.tokenExpiry = now + (expireIn - 300) * 1000;

    return token;
  }

  /**
   * List files/folders under a folder.
   * @param {string} folderToken
   * @returns {Promise<Array<{ type: string, name: string, token: string }>>}
   */
  async listFolderItems(folderToken) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/files?folder_token=${encodeURIComponent(folderToken)}&page_size=200`;

    const resp = await this.sendRequest('读取飞书文件夹', {
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`读取飞书文件夹失败 (code ${data.code}): ${data.msg}`);
    }

    const files = data.data?.files || [];
    return files.map((item) => ({
      type: item.type || '',
      name: item.name || '',
      token: item.token || '',
    }));
  }

  /**
   * Creates a folder in the parent folder.
   * @param {string} parentFolderToken
   * @param {string} folderName
   * @returns {Promise<string>} Folder token
   */
  async createFolder(parentFolderToken, folderName) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/files/create_folder`;

    const resp = await this.sendRequest('创建飞书文件夹', {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name: folderName,
        folder_token: parentFolderToken,
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`创建飞书文件夹失败 (code ${data.code}): ${data.msg}`);
    }

    const folderToken = data.data?.token || '';
    if (!folderToken) {
      throw new Error('飞书创建文件夹接口未返回文件夹 Token');
    }

    return folderToken;
  }

  /**
   * Upload a raw file (like markdown) to the drive.
   * @param {string} fileName
   * @param {string} base64Content
   * @param {string} [folderToken]
   * @returns {Promise<string>} File token
   */
  async uploadFile(fileName, base64Content, folderToken = '') {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/files/upload_all`;

    // Convert base64 to binary
    const binaryStr = atob(base64Content);
    const binaryData = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      binaryData[i] = binaryStr.charCodeAt(i);
    }

    const fields = {
      file_name: fileName,
      parent_type: 'explorer',
      size: binaryData.length.toString(),
    };
    if (folderToken) {
      fields.parent_node = folderToken;
    }
    const boundary = 'feishu-file-boundary-' + Math.random().toString(36).substring(2, 15);
    const body = buildMultipartBody({
      boundary,
      fields,
      file: {
        fileName,
        mimeType: 'text/markdown; charset=utf-8',
        bytes: binaryData,
      },
    });

    const resp = await this.sendRequest('上传飞书临时 Markdown 文件', {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`上传飞书临时文件失败 (code ${data.code}): ${data.msg}`);
    }

    const fileToken = data.data?.file_token || '';
    if (!fileToken) {
      throw new Error('飞书上传文件接口未返回 file_token');
    }

    return fileToken;
  }

  /**
   * Delete a file on the drive (useful for cleaning up temporary uploads).
   * @param {string} fileToken
   * @param {string} [type='file'] 'file' | 'folder' | 'docx'
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileToken, type = 'file') {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/files/${fileToken}?type=${encodeURIComponent(type)}`;

    const resp = await this.sendRequest('删除飞书临时文件', {
      url,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = resp.json;
    return data.code === 0;
  }

  /**
   * Create a drive import task to convert a markdown file token into a docx cloud document.
   * @param {string} fileName
   * @param {string} fileToken
   * @param {string} [folderToken]
   * @returns {Promise<string>} Ticket
   */
  async createImportTask(fileName, fileToken, folderToken = '') {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/import_tasks`;

    const lastDotIndex = fileName.lastIndexOf('.');
    const pureFileName = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;

    const requestBody = {
      file_extension: 'md',
      file_name: pureFileName,
      type: 'docx',
      file_token: fileToken,
    };

    if (folderToken) {
      requestBody.point = {
        mount_type: 1, // 1 represents folder
        mount_key: folderToken,
      };
    }

    const resp = await this.sendRequest('创建飞书导入任务', {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(requestBody),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`创建飞书导入任务失败 (code ${data.code}): ${data.msg}`);
    }

    const ticket = data.data?.ticket || '';
    if (!ticket) {
      throw new Error('飞书创建导入任务接口未返回 ticket');
    }

    return ticket;
  }

  /**
   * Query import task status.
   * @param {string} ticket
   * @returns {Promise<{ job_status: number, token?: string, url?: string }>}
   */
  async queryImportTask(ticket) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/import_tasks/${ticket}`;

    const resp = await this.sendRequest('查询飞书导入任务状态', {
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`查询飞书导入任务状态失败 (code ${data.code}): ${data.msg}`);
    }

    const taskResult = data.data?.result || data.data;
    if (!taskResult) {
      throw new Error('飞书查询导入任务状态未返回有效数据');
    }

    return {
      job_status: taskResult.job_status,
      token: taskResult.token,
      url: taskResult.url,
    };
  }

  /**
   * Polls the import task until finished or timed out.
   * @param {string} ticket
   * @param {number} [maxRetries=5]
   * @returns {Promise<{ token: string, url: string }>}
   */
  async waitForImportTask(ticket, maxRetries = 6) {
    let retryCount = 0;
    while (retryCount <= maxRetries) {
      const result = await this.queryImportTask(ticket);
      if (result.job_status === 0) {
        if (!result.token || !result.url) {
          throw new Error('飞书导入完成，但未返回文档 Token 或 URL');
        }
        return {
          token: result.token,
          url: result.url,
        };
      } else if (result.job_status === 1 || result.job_status === 2) {
        retryCount++;
        if (retryCount > maxRetries) {
          throw new Error('飞书文档导入处理超时，请稍后前往云文档查看');
        }
        // Wait 3 seconds initially, increase to 5 seconds later
        const waitTime = retryCount >= 3 ? 5000 : 3000;
        await new Promise((resolve) => window.setTimeout(resolve, waitTime));
      } else {
        throw new Error(`飞书导入任务失败 (job_status ${result.job_status})`);
      }
    }
  }

  /**
   * Fetch all blocks of a docx document.
   * @param {string} documentId
   * @returns {Promise<Array<{ block_id: string, parent_id: string, block_type: number }>>}
   */
  async getDocumentBlocks(documentId) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/docx/v1/documents/${documentId}/blocks?page_size=500`;

    const resp = await this.sendRequest('获取飞书文档结构', {
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`获取飞书文档结构失败 (code ${data.code}): ${data.msg}`);
    }

    return data.data?.items || [];
  }

  /**
   * Batch deletes child blocks from a parent block.
   * @param {string} documentId
   * @param {string} rootBlockId
   * @param {number} startIndex (inclusive)
   * @param {number} endIndex (exclusive)
   * @returns {Promise<boolean>}
   */
  async batchDeleteBlocks(documentId, rootBlockId, startIndex, endIndex) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/docx/v1/documents/${documentId}/blocks/${rootBlockId}/children/batch_delete?document_revision_id=-1`;

    const resp = await this.sendRequest('批量删除飞书文档块', {
      url,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        start_index: startIndex,
        end_index: endIndex,
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`批量删除飞书文档块失败 (code ${data.code}): ${data.msg}`);
    }

    return true;
  }

  /**
   * Deletes one child block either by its parent/index or by block id.
   * @param {string} documentId
   * @param {string} blockId
   * @param {string} [parentId]
   * @param {number} [index]
   * @returns {Promise<boolean>}
   */
  async deleteBlock(documentId, blockId, parentId, index) {
    const token = await this.getAccessToken();
    const targetParentId = parentId || blockId;
    const url = `${this.baseUrl}/docx/v1/documents/${documentId}/blocks/${targetParentId}/children/batch_delete?document_revision_id=-1`;
    const hasIndex = Number.isInteger(index);

    const resp = await this.sendRequest('删除飞书文档块', {
      url,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(hasIndex ? {
        start_index: index,
        end_index: index + 1,
      } : {
        block_ids: [blockId],
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`删除飞书文档块失败 (code ${data.code}): ${data.msg}`);
    }

    return true;
  }

  /**
   * Convert markdown text to docx block structures.
   * @param {string} markdownContent
   * @returns {Promise<Array<Record<string, unknown>>>>}
   */
  async convertMarkdownToBlocks(markdownContent) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/docx/v1/documents/blocks/convert`;

    const resp = await this.sendRequest('转换 Markdown 为飞书文档块', {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        content_type: 'markdown',
        content: markdownContent,
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`转换 Markdown 到文档块失败 (code ${data.code}): ${data.msg}`);
    }

    return data.data?.blocks || [];
  }

  /**
   * Create document blocks under a parent block.
   * @param {string} documentId
   * @param {string} parentId
   * @param {number} index
   * @param {Array<Record<string, unknown>>} children
   * @returns {Promise<unknown>}
   */
  async createDocumentBlocks(documentId, parentId, index, children) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/docx/v1/documents/${documentId}/blocks/${parentId}/children?document_revision_id=-1`;

    const resp = await this.sendRequest('插入飞书文档块', {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        index,
        children,
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`插入文档块失败 (code ${data.code}): ${data.msg}`);
    }

    return data.data;
  }

  /**
   * Upload an image to the document media space.
   * @param {string} fileName
   * @param {string} base64Content
   * @param {string} documentId
   * @param {string} blockId
   * @returns {Promise<string>} Image token
   */
  async uploadImageMaterial(fileName, base64Content, documentId, blockId) {
    const binaryStr = atob(base64Content);
    const binaryData = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      binaryData[i] = binaryStr.charCodeAt(i);
    }
    return this.uploadImageMaterialBytes(fileName, binaryData, documentId, blockId, 'application/octet-stream');
  }

  /**
   * Upload an image to the document media space using binary bytes directly.
   * @param {string} fileName
   * @param {ArrayBuffer | Uint8Array} binaryContent
   * @param {string} documentId
   * @param {string} blockId
   * @param {string} [mimeType='application/octet-stream']
   * @returns {Promise<string>} Image token
   */
  async uploadImageMaterialBytes(fileName, binaryContent, documentId, blockId, mimeType = 'application/octet-stream') {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/medias/upload_all`;
    const binaryData = binaryContent instanceof Uint8Array
      ? binaryContent
      : new Uint8Array(binaryContent || new ArrayBuffer(0));

    const boundary = 'feishu-image-boundary-' + Math.random().toString(36).substring(2, 15);
    const body = buildMultipartBody({
      boundary,
      fields: {
        file_name: fileName,
        parent_type: 'docx_image',
        parent_node: blockId,
        size: binaryData.length.toString(),
        extra: JSON.stringify({ drive_route_token: documentId }),
      },
      file: {
        fileName,
        mimeType: mimeType || 'application/octet-stream',
        bytes: binaryData,
      },
    });

    const resp = await this.sendRequest('上传飞书文档图片素材', {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`上传飞书文档图片素材失败 (code ${data.code}): ${data.msg}`);
    }

    const fileToken = data.data?.file_token || '';
    if (!fileToken) {
      throw new Error('飞书上传图片接口未返回 file_token');
    }

    return fileToken;
  }

  /**
   * Update a specific block.
   * @param {string} documentId
   * @param {string} blockId
   * @param {Record<string, unknown>} blockData
   * @returns {Promise<unknown>}
   */
  async updateBlock(documentId, blockId, blockData) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/docx/v1/documents/${documentId}/blocks/${blockId}?document_revision_id=-1`;

    const resp = await this.sendRequest('更新飞书文档块', {
      url,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(blockData),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`更新飞书文档块失败 (code ${data.code}): ${data.msg}`);
    }

    return data.data;
  }

  /**
   * Rename a drive file/document.
   * @param {string} fileToken
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async renameFile(fileToken, name) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/files/${fileToken}`;

    const resp = await this.sendRequest('重命名飞书文件', {
      url,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name,
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`重命名飞书文件失败 (code ${data.code}): ${data.msg}`);
    }

    return true;
  }

  /**
   * Transfer document ownership from the Robot to the user's userId.
   * @param {string} docToken
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async transferDocumentOwnership(docToken, userId) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/permissions/${docToken}/members/transfer_owner?need_notification=false&old_owner_perm=full_access&remove_old_owner=false&stay_put=true&type=docx`;

    const resp = await this.sendRequest('转移飞书文档所有权', {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        member_id: userId,
        member_type: 'userid', // Feishu User ID value, e.g. abc1234.
      }),
    });

    const data = resp.json;
    if (data.code !== 0) {
      throw new Error(`转移飞书文档所有权失败 (code ${data.code}): ${data.msg}`);
    }

    return true;
  }
}

export {
  FeishuApiClient,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after Feishu API response boundary */
