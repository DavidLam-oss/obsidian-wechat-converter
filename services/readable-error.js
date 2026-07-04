/**
 * @param {unknown} error
 * @returns {{ message: string, isFatal?: boolean, isProxyAuth?: boolean }}
 */
function toReadableError(error) {
  if (error instanceof Error) return /** @type {{ message: string, isFatal?: boolean, isProxyAuth?: boolean }} */ (error);
  if (error && typeof error === 'object') {
    const record = /** @type {{ message?: unknown, isFatal?: unknown, isProxyAuth?: unknown }} */ (error);
    return {
      message: typeof record.message === 'string' ? record.message : String(error),
      isFatal: record.isFatal === true,
      isProxyAuth: record.isProxyAuth === true,
    };
  }
  return { message: String(error || '') };
}

export { toReadableError };
