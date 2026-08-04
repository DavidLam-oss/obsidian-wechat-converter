/*
## 核心功能

集中维护微信贴图标题、图片和文案的数量限制。

## 输入

无运行时输入。

## 输出

输出 `STICKER_MAX_IMAGES`、`STICKER_MAX_TITLE_LENGTH` 与 `STICKER_MAX_CONTENT_LENGTH`。

## 定位

位于 services/，是贴图流程的轻量边界常量模块；不负责内容提取、界面状态或网络请求。

## 依赖

无。

## 维护规则

- 微信平台限制变化时只在此处修改，并同步更新对应测试与用户提示。
- 保持模块无运行时依赖，避免共享限制值引入不必要的打包耦合。
*/

/**
 * 微信贴图公共 draft/add 接口的图片上限。
 * 官方文档的 newspic.image_info 约束为最多 20 张。
 */
const STICKER_MAX_IMAGES = 20;

/** 微信贴图标题字数上限 */
const STICKER_MAX_TITLE_LENGTH = 20;

/** 微信贴图文案字数上限 */
const STICKER_MAX_CONTENT_LENGTH = 1000;

export {
  STICKER_MAX_IMAGES,
  STICKER_MAX_TITLE_LENGTH,
  STICKER_MAX_CONTENT_LENGTH,
};
