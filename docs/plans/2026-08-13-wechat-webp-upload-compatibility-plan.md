# 微信上传 WebP 兼容方案

> 状态：已实施，自动化验证通过，待 Obsidian 与微信草稿人工验收
> 更新日期：2026-08-13
> 来源：评审社区 PR [#68](https://github.com/DavidLam-oss/obsidian-wechat-converter/pull/68) 后，结合当前 `main`（2.10.5）、既有上传链路和设计审查结论整理
> 实施原则：吸收功能目标和有效测试思路，不直接合并或 cherry-pick PR #68

## 1. 结论

在最新 `main` 上独立实现“微信上传前将 WebP 真正转码为微信接口接受的 PNG 或 JPEG”，完成后通过项目自己的分支和 PR 合入。

吸收社区 PR 中两个有效思路：

- 同时参考 MIME 和 `RIFF/WEBP` 文件头识别 WebP，不能只修改扩展名或 MIME。
- 在微信共用上传边界处理，使正文图片、封面和贴图图片获得一致行为。

不原样采用以下实现：

- 不直接依赖全局 `URL` 和 `Image`；从当前 active document 对应的 window 获取解码能力。
- 不把所有 WebP 固定转成 PNG；根据 WebP 容器特征选择 PNG 或 JPEG，避免照片类 WebP 转 PNG 后体积大幅膨胀。
- 不把 Canvas 返回的非目标格式数据重新包装后冒充目标格式；输出类型不符合预期时明确失败。
- 不只验证代理上传路径；直连 multipart、网络重试和共用业务入口都要有证据。
- 不静默把动画 WebP 截成首帧；第一版检测到动画时明确拒绝并提示用户转换格式。

## 2. 目标与非目标

### 2.1 目标

1. 本地文件、Data URL、远程图片和图床返回的静态 WebP，在上传微信前转成真实 PNG 或 JPEG 字节。
2. 透明或无损型 WebP 优先输出 PNG；普通无透明照片型 WebP 输出 JPEG。
3. 转码只发生在内存中，不修改 Markdown、Vault 文件、图床文件或预览 DOM。
4. 正文图片、文章封面和贴图图片使用相同的格式归一化规则。
5. PNG、JPEG 和 GIF 保持原 Blob、原字节和现有上传行为，不重新编码。
6. 新增转码路径在 Obsidian 桌面端、移动端和多窗口环境中使用当前 active document 所属 window 的浏览器能力。
7. 转码失败时给出可理解、可定位的错误，不伪装格式、不静默上传错误字节。

### 2.2 非目标

- 不增加设置项或自动开关。
- 不修改微信 API 的网络重试次数、超时或额度策略。
- 不改变图片缓存键、正文替换规则或草稿数据结构。
- 不修改预览、复制富文本和飞书同步的图片处理行为。
- 不在本次重构 `services/svg-rasterizer.js`。它包含 SVG 序列化、MathJax 和 Mermaid 样式固化等专属职责，强行共用会扩大回归面。
- 不把动画 WebP 转成 GIF/APNG，也不把首帧降级当成成功。
- 不自动缩放图片、不因文件过大自动降低 JPEG 质量，也不增加自动重试；这些行为会改变画质或增加用户难以预测的处理。
- 不为测试引入 `canvas`、`sharp` 等新的原生或重量级依赖。

## 3. 已确认的当前事实

| 事实 | 代码依据 | 影响 |
| --- | --- | --- |
| 正文图片最终调用 `api.uploadImage(blob)` | `services/wechat-media.js` | 共用上传边界可以覆盖正文 |
| 封面调用 `api.uploadCover(blob)` | `services/wechat-sync.js`、`services/wechat-api.js` | 同一边界可以覆盖封面 |
| 贴图中的非素材库图片调用 `api.uploadCover(blob)` | `services/sticker-media-resolver.js` | 无需为贴图另建转码流程 |
| `uploadImage` 和 `uploadCover` 最终进入 `uploadMultipart` | `services/wechat-api.js` | `uploadMultipart` 是当前最窄且完整的格式归一化接入点 |
| `uploadMultipart` 内部区分代理 JSON 和直连 multipart | `services/wechat-api.js` | 两种传输路径都必须消费转码后的 Blob |
| `requestWithRetry` 包裹单次上传请求 | `services/wechat-api.js` | 转码放在该重试外，可避免网络重试重复转码 |
| `actionWithTokenRetry` 位于 `uploadMultipart` 外层 | `services/wechat-api.js` | Token 过期刷新会重新进入一次 `uploadMultipart`，可能再次转码；不能宣称整个用户操作只转码一次 |
| 本地图片 MIME 能识别 `.webp`，远程响应也可能提供 MIME | `views/converter/clipboard.js`、`services/image-source-utils.js` | MIME 是线索，但错误 MIME 必须由文件头兜底 |
| 项目已有 active document/window 获取能力 | `services/dom-utils.js` | 新增图片解码代码不应假定全局 window 就是当前 Obsidian 窗口 |
| 当前上传链路没有统一的 10 MB 图片限制 | `views/converter/clipboard.js`、`services/wechat-api.js` | 不能把其他资源收集模块的 10 MB 常量当成正文、封面和贴图的共同上传合同 |
| 正文图片和永久素材使用不同微信接口 | `/media/uploadimg` 与 `/material/add_material` | 输出格式和大小约束必须按目标接口分别核实，不能共用未经验证的单一阈值 |

## 4. 设计方案

### 4.1 模块职责

新增 `services/wechat-image-transcoder.js`，只负责微信上传前的图片格式兼容：

- `inspectWebpBlob(blob)`：通过 MIME 和 WebP 容器字节识别格式，并返回是否动画、是否含透明/无损特征以及建议输出类型。
- `normalizeWechatUploadImageBlob(blob, options)`：非 WebP 原样返回；静态 WebP 根据检查结果输出 PNG 或 JPEG；动画 WebP 明确失败。
- 运行时依赖从 active document 的 `defaultView` 获取，同时保留最小测试注入点。

`services/wechat-api.js` 只负责编排：

1. 先校验代理配置，避免无效配置触发图片解码开销。
2. 在进入 `requestWithRetry` 前执行一次格式归一化。
3. 后续 MIME、文件扩展名、Base64 和 multipart 字节全部读取归一化后的 Blob。
4. 根据当前目标接口执行已验证的输出大小检查；如果尚无可信限制数据，不引入猜测阈值，继续使用现有微信错误反馈。

格式检测、Canvas 解码和 Object URL 清理不放进 `wechat-api.js`。

### 4.2 WebP 识别与分类

处理顺序：

1. 读取 Blob 前 12 字节，检查 `RIFF` 与 `WEBP` 标记。
2. 文件头命中时，无论 MIME 声明为何，都按 WebP 处理，覆盖被图床错误标成 JPEG/PNG 的情况。
3. MIME 为 `image/webp` 但文件头不合法时，不把它当普通图片透传；返回“WebP 文件头无效或图片已损坏”。
4. MIME 不是 WebP且文件头不命中时，返回原 Blob。
5. 确认为 WebP 后，校验 RIFF 声明长度不越界，再按各 chunk 声明的长度和偶数字节 padding 逐段解析；不能用全文字符串搜索代替容器解析，避免把 EXIF/XMP 等元数据中的相同文本误判为 chunk：
   - `VP8 `：普通有损静态 WebP，输出 JPEG。
   - `VP8L`：无损静态 WebP，输出 PNG。
   - `VP8X`：读取扩展特征并继续解析实际图像数据；含 Alpha/`ALPH` 或图像数据为 `VP8L` 时输出 PNG，否则仅在图像数据明确为 `VP8 ` 时输出 JPEG。
   - `VP8X` 动画标记或合法 chunk 中出现 `ANIM` / `ANMF`：明确拒绝。
   - 结构无法可靠分类：明确失败，不默认截帧或猜测输出格式。

非 WebP 只读取 12 字节，不创建 Image 或 Canvas；这点开销相对于后续网络上传可以忽略，并换取错误 MIME 场景的正确性。

### 4.3 Active window 兼容

先取得 `activeDocument = getActiveDocument()`，再优先使用 `activeDocument.defaultView` 获取：

- `Image`
- `URL.createObjectURL`
- `URL.revokeObjectURL`

Canvas 始终由同一个 `activeDocument.createElement('canvas')` 创建，确保 Image、URL 和 Canvas 来自同一个 realm。

本次不新增 Blob/FileReader 跨版本兼容层：

- `canvas.toBlob()` 直接返回当前 realm 的 Blob，无需重新构造。
- 当前直连上传已经依赖 `blob.arrayBuffer()`，新服务沿用现有运行时基线。
- 代理上传现有全局 `FileReader` 不属于本次 WebP 修复范围；本方案只保证新增转码路径不扩大该问题。

如果 active document、Image、URL 或 Canvas 能力不可用，返回明确环境错误。

### 4.4 转码行为

1. 先完成 WebP 容器识别与动画检查。
2. 创建源 Blob 的 Object URL。
3. 使用 active window 的 Image 解码。
4. 读取 `naturalWidth` / `naturalHeight`，拒绝无效尺寸。
5. 创建相同像素尺寸的 Canvas 并绘制图片。
6. 根据分类输出：
   - PNG：`canvas.toBlob(callback, 'image/png')`。
   - JPEG：`canvas.toBlob(callback, 'image/jpeg', 0.9)`。
7. 校验输出 Blob 存在、MIME 与目标格式一致，并校验 PNG/JPEG 文件签名字节；任何一项不符合都明确失败。
8. 在所有成功和失败路径中撤销 Object URL。

JPEG 质量固定为 `0.9`，不根据失败结果自动降低；需要调整时应通过真实样本和独立评审修改常量。

Canvas 转码不承诺保留 EXIF、XMP 或 ICC 元数据。本功能保证可上传的像素结果、尺寸与透明语义，不把元数据保真纳入第一版合同。

### 4.5 接口格式与大小约束

不能沿用方案原先的“统一 10 MB”假设。实施前先通过当前微信官方文档或真实接口证据确认：

- 正文图片 `/cgi-bin/media/uploadimg` 接受的格式和最大文件大小。
- 封面与贴图永久素材 `/cgi-bin/material/add_material?type=image` 接受的格式和最大文件大小。

记录规则：

- 把核实日期、接口路径和限制依据写在实现常量附近，并补测试。
- 大小检查针对转码后的 Blob，因为它才是实际上传内容。
- 如果官方资料无法可靠确认，不新增本地数字阈值；保留微信响应中的错误码和实际输出大小，避免把过期限制固化进客户端。
- 输出超过已确认限制时明确提示用户自行转换或压缩，不自动缩放、不自动降低质量、不重试另一格式。

本次不设置未经证实的统一像素上限。无效尺寸、Canvas 分配失败或浏览器拒绝解码时，按转码失败反馈；后续只有取得真实崩溃或内存问题证据后再引入像素保护阈值。

### 4.6 缓存、重试与失败行为

- 图片指纹继续根据源 Blob 计算，现有正文、封面和贴图缓存语义不变。
- 每次 `uploadMultipart` 调用只转码一次；其内部网络重试复用转码结果。
- Token 过期时外层会重新调用 `uploadMultipart`，允许再次转码一次；不为这个低频情况增加转码缓存。
- 转码或动画检测失败不进入网络请求，也不消耗微信接口网络重试。
- 正文图片继续沿用现有“单图失败可跳过并汇总”的行为；封面和贴图是否阻断沿用各自现有调用链，不在转码服务里决定。
- 错误前缀统一为“WebP 转换失败”，后面说明文件损坏、动画、解码、尺寸、Canvas、输出格式或接口大小原因。

## 5. 预计文件改动

| 文件 | 计划改动 |
| --- | --- |
| `services/wechat-image-transcoder.js` | 新增 WebP 容器识别、动画/透明分类、active realm 解码与 PNG/JPEG 输出 |
| `services/wechat-api.js` | 在共用上传边界接入归一化 Blob，代理和直连统一消费结果 |
| `tests/wechat_image_transcoder.test.js` | 新增转码服务的分类、调用合同和失败测试 |
| `tests/wechat_api.test.js` | 覆盖代理、直连 multipart、网络重试和 MIME/文件名/字节行为 |
| `tests/plugin_security.test.js` | 仅在需要固定“代理校验先于转码”时补一条回归断言 |
| `eslint.config.mjs` | 将新 ESM service 纳入对应 lint 配置 |
| `services/obsidian-wechat-converter_services_README.md` | 登记新增微信图片转码服务及职责 |
| `tests/obsidian-wechat-converter_tests_README.md` | 登记新增测试文件及覆盖范围 |
| `docs/basic/backend-structure.md` | 记录微信上传边界的 WebP 内存转码职责 |
| `main.js` | 由构建生成，不手工编辑 |

`services/dom-utils.js` 现有 helper 足以提供 active document/window，默认不修改。若实施中发现真实缺口，再做最小补充并说明原因。

## 6. 测试矩阵

### 6.1 单元测试

| 场景 | 预期 |
| --- | --- |
| MIME 为 `image/webp` 且文件头有效 | 识别并按容器特征转码 |
| MIME 为 JPEG/PNG 但文件头为 `RIFF/WEBP` | 仍识别为 WebP |
| MIME 为 `image/webp` 但文件头无效 | 明确报损坏/无效错误 |
| PNG、JPEG、GIF | 返回同一个 Blob，不创建 Image/Canvas |
| `VP8 ` 静态 WebP | 输出真实 JPEG，质量参数为 0.9 |
| `VP8L` 或带 Alpha 的 `VP8X` | 输出真实 PNG |
| `VP8X` 动画、`ANIM` 或 `ANMF` | 明确拒绝，不创建 Canvas |
| active document 与全局 window 不同 | 使用 `activeDocument.defaultView` 的 Image 和 URL |
| 解码失败 | 明确错误并撤销 Object URL |
| Canvas 2D context 不可用 | 明确失败 |
| `toBlob` 返回 null或错误 MIME | 明确失败，不重新包装冒充目标格式 |
| 输出签名与目标格式不一致 | 明确失败 |

Mock 测试只证明分类、调用参数、清理和输出合同，不声称证明真实浏览器的像素转码质量。

### 6.2 微信 API 集成测试

| 场景 | 验证点 |
| --- | --- |
| 代理上传透明/无损 WebP | JSON 中 MIME、文件名和 Base64 均为真实 PNG |
| 代理上传照片型 WebP | JSON 中 MIME、文件名和 Base64 均为真实 JPEG |
| 直连上传 WebP | multipart header、扩展名和 body 字节一致 |
| 网络首次失败后重试 | 本次 `uploadMultipart` 中转码只调用一次，请求按既有策略重试 |
| PNG/JPEG/GIF 上传 | 现有 MIME、扩展名和字节不变 |
| 非 HTTPS 代理 | 在转码和网络请求前被拒绝 |
| `uploadImage` 与 `uploadCover` | 均进入同一格式归一化边界 |

正文、封面和贴图的调用关系分别由现有 `wechat-media`、`wechat-sync` 和 `sticker-media-resolver` 测试保护；只在当前测试无法证明调用边界时各补一条最小断言，不复制整套 Canvas mock。

### 6.3 自动化验证

开发阶段：

1. `npx vitest run tests/wechat_image_transcoder.test.js tests/wechat_api.test.js tests/plugin_security.test.js`
2. `npm run build`

收口阶段运行一次 `npm run review:guard`。它已经包含 lint/scan、样式检查、构建产物检查、完整测试、打包和发布校验，不重复单独运行同一批门禁。

构建和检查命令不得与 `git status`、`git diff` 或暂存并行执行，以免读取到生成中间态。

### 6.4 人工验收

至少准备 PNG、JPEG、GIF、照片型 WebP、静态透明 WebP、静态无损 WebP 和动画 WebP 样本，验证：

- 正文中的照片型与透明 WebP 能同步到微信草稿并正常显示。
- WebP 封面能作为草稿封面显示。
- 贴图中的 WebP 能进入贴图草稿。
- 动画 WebP 在发起网络上传前给出明确“不支持动画 WebP”的错误，不静默变成静态图。
- PNG/JPEG/GIF 的草稿结果与修复前一致，GIF 动画不被转码。
- 代理上传和可用条件下的直连上传各验证一次。
- 转码后的文件未超过对应接口已确认的大小限制；超过时提示准确且不自动二次转码。
- 源 Markdown、Vault 图片文件和远程图床资源均未改变。

真实样本重点观察尺寸、透明背景、照片画质和微信草稿结果。由于项目没有真实 Canvas 编码测试依赖，这部分不能用 mock 单元测试替代。

若无法访问真实微信公众号草稿箱，必须把人工部分标记为“待用户实测”，不能用构建通过代替。

## 7. 验收标准

### 功能

- WebP 上传时发送的是实际 PNG/JPEG 字节，不只是修改文件名或 MIME。
- 照片型 WebP 输出 JPEG；透明或无损型 WebP 输出 PNG；动画 WebP 明确拒绝。
- 正文、封面、贴图不各自维护独立转码逻辑。
- 非 WebP 返回原 Blob，GIF 动画保持现有上传路径。
- 代理和直连路径使用同一个归一化结果。
- 单次 `uploadMultipart` 的网络重试不会重复转码。
- 所有 Object URL 在成功和失败路径均被撤销。
- 转码不会写回或修改任何源文件。

### 兼容与安全

- 新增转码路径的 Document、Image、URL 和 Canvas 来自同一个 active realm。
- 输出 MIME、扩展名、文件签名和实际字节一致。
- 转码后大小按目标接口的已确认规则检查；无法确认时不固化猜测阈值。
- Canvas 未生成目标格式时明确失败，不伪装 MIME。
- 原有代理 URL 安全校验、熔断、缓存和失败汇总行为不变。

### 交付证据

- 目标测试、`npm run build`、完整 `review:guard` 通过。
- 提交包含源文件、测试、两份文件夹说明书、架构说明和同步生成的 `main.js`。
- PR 描述注明吸收社区 PR #68 的问题定位和贡献，并列出我们补充的格式分类、active realm 与测试项。
- 真实微信草稿验收有结果记录；无法执行时明确列为 merge 前人工门禁或由维护者完成的待验项。

## 8. 实施顺序

1. 从最新 `main` 创建独立功能分支，不基于 PR #68 的旧提交继续开发。
2. 核实并记录两个微信上传接口当前接受的格式和大小限制；无法可靠核实时决定不加本地数字阈值，而不是猜测。
3. 先写 WebP 容器分类测试，固定错误 MIME、动画、Alpha/无损和损坏文件合同。
4. 实现 `wechat-image-transcoder.js`，完成 PNG/JPEG 输出调用、active realm 和资源清理测试。
5. 接入 `wechat-api.js` 共用上传边界，补齐代理、直连和网络重试测试。
6. 仅在已有测试没有覆盖调用关系时，补正文、封面和贴图的最小边界断言。
7. 更新两份文件夹说明书与后端架构说明，生成 `main.js`。
8. 跑目标测试、build 和完整 `review:guard`，检查 diff 只包含本功能相关文件。
9. 完成真实 WebP 样本和微信草稿人工验收。
10. 提交、推送并创建项目自己的 PR；获得合并授权后再 merge。
11. 自有 PR 合并后，在社区 PR #68 中致谢并说明已吸收的实现与差异，再关闭原 PR。

第 10、11 步涉及远端写操作，必须由用户明确授权后执行。

## 9. 回滚方案

如果发布后出现兼容问题：

1. 优先回滚 `services/wechat-api.js` 的转码接入，使上传恢复原路径。
2. 保留独立转码服务和测试，便于修复后重新接入；若确认设计本身有问题，再一并移除。
3. 重新构建 `main.js` 并运行 `review:guard`。
4. 不需要迁移设置、缓存或用户数据，因为本方案不新增持久化状态。

## 10. 实施前门禁

进入功能实现前确认：

- 用户认可本方案的范围和非目标。
- 实施基于最新 `main`，工作区中的其他未提交改动不被暂存或覆盖。
- 照片型 WebP 输出 JPEG，透明/无损型 WebP 输出 PNG，动画 WebP 第一版明确拒绝。
- 微信正文图片与永久素材的当前接口限制已经核实，或明确决定不增加未经证实的本地数字阈值。
- 真实微信草稿验收由谁执行已明确；如果由用户执行，交付时提供最短测试步骤。

## 11. 实施记录

2026-08-13 已在 `codex/fix-wechat-webp-upload` 分支完成实现：

- 新增 `services/wechat-image-transcoder.js`，按 RIFF chunk 边界识别 `VP8 `、`VP8L`、`VP8X`、`ALPH`、`ANIM` 和 `ANMF`。
- 照片型静态 WebP 输出 JPEG（质量 0.9）；无损或透明静态 WebP 输出 PNG；动画 WebP 在网络请求前明确拒绝。
- `services/wechat-api.js` 在共用 `uploadMultipart` 边界接入，代理和直连使用同一转码结果，网络重试不重复转码。
- 当前微信官方资料对两个接口的大小限制存在版本差异，未在客户端固化未经证实的数字阈值；继续沿用微信响应和现有 45001 反馈。
- `scan:guard` 通过，完整 `review:guard` 通过：106 个测试文件、1161 个测试全部通过，构建产物可复现，发布包校验通过。
- 使用 `cwebp` / `ffmpeg` 生成真实 lossy、lossless 和 animated WebP 做容器冒烟检查，分类结果分别为 JPEG、PNG 和动画拒绝。

尚未完成的人工证据：

- Obsidian 运行时使用真实 WebP 完成 Canvas 编码。
- 正文、封面和贴图各同步一次真实微信草稿并检查显示结果。
- 代理上传已经由自动化覆盖；直连上传已覆盖 multipart 字节合同，但真实环境是否可用取决于用户当前网络与微信接口条件。
