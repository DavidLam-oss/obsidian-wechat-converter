/*
## 核心功能

提供服务层通用能力：readable error。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `toReadableError`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

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
