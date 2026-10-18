# Obsidian 提交与更新故障手册

用于官方后台、GitHub Release 或目录更新出现异常时。先保存版本、完整 SHA、后台原文与资产摘要，再按症状定位；不要靠删除仓库、移动 Tag、覆盖已扫描资产或重复点击扫描来试错。

## 先建立四份事实

1. **默认分支源码**：根目录必须有可解析的 `manifest.json`；记录默认分支名和 HEAD SHA。
2. **版本关系**：`manifest.json`、`package.json`、`package-lock.json` 根版本、`packages[""].version`、`versions.json` 当前键和 GitHub Tag 必须指向同一版本。Tag 不加 `v`。
3. **发布资产**：Release 必须是公开正式版，并含根级文件名 `main.js`、`manifest.json`，有样式时含 `styles.css`。不要把 `dist/community/main.js` 等另一构建变体误传为根目录正式产物。
4. **代码与二进制关系**：Tag/Release target 指向已预扫描的最终候选 SHA；从 Tag 重新构建的 `main.js`、候选根目录 `main.js` 和下载后的 Release `main.js` 必须逐字节一致。合并产生新 SHA 时，再确认默认分支的发布相关文件与 Tag 树一致。
5. **匿名安装链路**：已登录的 GitHub CLI 能下载 Draft Release，普通 Obsidian 客户端不能。默认分支暴露新版本前，必须用无 token 请求精确 `https://github.com/<owner>/<repo>/releases/download/<version>/<asset>` URL，确认根级资产全部 200 且与候选产物匹配。

先运行项目自己的 CI，再运行：

```bash
python3 /path/to/qiaomu-obsidian-dev/scripts/audit_release.py . --tag 1.2.3
python3 /path/to/qiaomu-obsidian-dev/scripts/audit_release.py . --tag 1.2.3 --compare-dir /tmp/downloaded-release
python3 /path/to/qiaomu-obsidian-dev/scripts/check_public_release.py . --repo owner/repo --version 1.2.3 --attempts 6
```

`--compare-dir` 指向已下载的 Release 资产目录。它验证文件名、字节数和内容一致，不证明 GitHub Tag 指向、官方审核或真实安装。`check_public_release.py` 专门防止“登录态能读草稿、匿名客户端 404”的假通过；它仍不代替官方扫描和真机验收。

## 客户端显示新版本，点安装立即失败

先不要归因于 VPN、DNS 或手机兼容。按以下顺序定位：

1. 记录客户端详情页显示的精确版本 `V`。
2. 匿名请求 `releases/download/V/main.js`、`manifest.json`、`styles.css`（若有），不带 token，不使用可读草稿的 `gh release download`。
3. 若这些 URL 是 404，同时 GitHub API/CLI 显示 `isDraft: true` 或根本无同版本 Release，根因已确认：默认分支 manifest 先于公开 Release 生效。移动与桌面客户端都可能受影响，只是缓存和刷新时间不同。
4. 已完成发布授权与所有门禁时，公开原 Draft，然后等待匿名 URL 全部 200/摘要匹配；之后触发 `Check for new releases` 并等待正式扫描 Completed。未完成门禁时，通过 PR 把默认分支版本指针恢复到上一个可安装版本。
5. 只有匿名 URL 已经 200 但特定设备仍失败，才继续检查 Obsidian 版本、网络权限、GitHub/CDN 连通性、旧插件冲突与安装后加载日志。

## 后台错误与根因

### `No release matches your manifest version`

依次检查：

- 默认分支根 `manifest.json.version` 是否与目标正式 Release Tag 完全相等。
- Tag 是否错误写成 `v1.2.3`，Release 是否仍是 Draft/Prerelease，或者根本没有该 Tag。
- Release 的 `manifest.json` 是否仍是旧版本；不要只看仓库文件名。
- 默认分支是否已提前升版，导致它指向尚未发布的版本。
- 后台是否仍绑定旧仓库或旧插件 ID。仓库迁移与插件身份变更要单独核对，不能靠新建同名 Release 猜测修复。

修复后用 GitHub API/CLI读回 Release 的 `tagName`、`targetCommitish`、`isDraft`、资产名和下载内容，再触发 `Check for new releases`。

### `We couldn't read manifest.json from your repository's default branch`

检查默认分支，而不是当前本地分支：

- `manifest.json` 是否在仓库根目录、文件名大小写正确、JSON 有效。
- 默认分支是否真实包含该文件；PR 分支或 Release 资产里有文件不能替代默认分支。
- 商店条目绑定的 owner/repository 是否正确，仓库是否可访问；私有源码是否完成官方要求的 GitHub App 连接。
- 仓库改名、转移或替换后，后台是否仍保存旧关联。

不要把永久删除仓库或条目作为首选修复。先保留 Issues、PR、Release 和审核证据；只有用户明确决定迁移身份时才执行破坏性操作。

### `Build output does not match the released main.js artifact`

常见根因：

- 上传了另一个输出目录的 `main.js`，而官方从根目录源码执行标准 build 得到不同文件。
- 版本更新后只修改 manifest，根目录 `main.js` 没有重新构建或提交。
- lockfile、Node/包管理器版本、生成顺序、时间戳或环境变量让构建不确定。
- Release Tag 指向错误 SHA，或发布后覆盖了资产。

处理顺序：

1. 在干净 checkout 的目标 Tag 上按官方识别的生产 build 命令构建。
2. 比较新构建、Tag 中根 `main.js` 和下载后的 Release 资产；三者必须 byte-for-byte 相同。
3. 让 CI 在构建后执行 `git diff --exit-code -- main.js` 或等价校验，防止忘记提交生成物。
4. 已完成正式扫描的版本不要覆盖资产并期待重扫。发布新的补丁版本，重新走 Preview Scan、Release 和正式扫描。

通过标准是后台出现 `Build reproduced the release main.js byte-for-byte`，不能用本地 build 成功代替。

### Release 缺文件、文件名错误或样式丢失

- 资产必须使用安装器期待的根级文件名，不要上传压缩包内路径来替代独立资产。
- `styles.css` 只有插件确实有样式时才需要；一旦源码/安装依赖它，就必须与 Tag 内容一致。
- 下载远端资产后再算 SHA256；本地上传前摘要不能证明服务器上的最终文件。
- 单独记录每项资产大小。项目自设的 5,000,000 字节预算是工程预警，不应表述为永久官方上限。

### Preview Scan 或正式扫描长期 `Pending`

- `Pending`、`These results are incomplete`、空白页面、超时都不是通过。
- 等待后刷新同一条记录，确认 Ref、Commit 或 Version 没扫错；不要连续重复提交，避免制造多个难以辨认的记录。
- Preview Scan 必须显示最终候选完整 SHA。误扫 `main` 不可作为候选分支通过证据。
- 只有状态变为 `Completed`，且所有类别读取完毕，才分类处理结果。

### 扫描结果的严重级别

- **Error**：阻断发布，修复并对新候选重扫。
- **Warning**：不能忽略；判断兼容性、性能或产物风险，修复或记录具体理由。
- **Recommendation**：通常不阻断，但要确认是否能合理消除，并如实报告。
- **Pass**：只证明该检查项，不能扩展成完整上架或真机通过。

`Missing GitHub artifact attestations` 属于来源证明建议；它不能替代 byte-for-byte build verification，也不代表代码有漏洞。Vault Enumeration、Clipboard Access 等行为建议需要结合产品必要性评估，不要为了消除提示而破坏核心功能。

## 常见 CSS Lint 提示

- `!important`：先用组件根作用域、选择器层级或 CSS 变量解决；不要全局压制 Obsidian 或其他插件样式。
- `:has(...)`：避免大范围祖先失效计算；能在渲染时添加状态 class 就不要用宽泛 `:has`。
- `multicolumn`、`text-decoration` 等兼容提示：核对插件声明的 `minAppVersion` 和移动端回退。保留单列/基础装饰的可用路径；不要只提高版本号来隐藏真实兼容问题。
- 根 `styles.css` 与 `src/styles.css` 重复提示：明确单一源码和生成目标。修源码后重新生成根产物，不要两边手工改导致漂移。

CSS Warning 清理后重新跑项目 lint/build，并在真实 Obsidian 宿主检查作用域、主题、窄屏和触摸交互。官方扫描通过不证明视觉行为正确。

## 正确的更新闭环

1. feature/release branch 完成代码、版本和根构建产物；CI 验证重新构建无 diff，但默认分支仍保持上一个可安装版本。
2. 对该分支最终完整 SHA 运行官方 Preview Scan；确认后台 Ref/Commit 正确并完成。
3. 从该候选源状态创建 Draft Release，下载 Draft 资产，和 Tag/根产物逐字节比较；完成已授权的安装验证。
4. 先公开同一 Draft；运行无 token 的 `check_public_release.py`，等待三个精确 URL 全部 200 且与本地产物逐字节一致。
5. 匿名资产通过后才合并版本 PR；确认默认分支的发布相关文件与 Release tag 树无 diff，CI 通过。
6. 后台 `Check for new releases`，等待正式扫描 `Completed`；核对 Build Verification、Current release、目录页和客户端安装。
7. 分开报告 Preview、GitHub Release、匿名资产回读、默认分支版本、正式扫描、目录版本、客户端安装与真机测试，缺哪项就明确写缺哪项。

README、商店截图和长短描述也是发布面。功能已发布但截图仍是旧界面，应作为文档更新修复；它通常不需要伪造一个代码版本，但必须核对线上读回和缓存延迟。
