# Frontend Starter Templates

这层模板不是最终成品，而是空白工作区的第一版骨架。

## 使用顺序

1. 先补 `active/` 下的事实、素材、图片前置和方向合同
2. 再写清本页用途、受众、气质端点、约束和记忆点
3. 再从这里挑最近的一份模板
4. 运行 `openprd design-starter . --starter <starter-id> --out index.html`
5. 再按选中的 `lens + theme + layout + component set + 审美主张` 改写内容和样式

## 模板清单

- `content-home.html`: 内容型首页、导览页、展览页、城市体验页、故事型首页
- `product-launch.html`: 产品发布页、品牌发布页、功能发布页、招商/介绍型首页
- `ops-dashboard.html`: 工具台、后台首页、运营工作台、信息密度型页面

## 推荐起步组合

| 模板 | 默认 lens | 默认 theme | 默认 layout | 默认组件 |
| --- | --- | --- | --- | --- |
| `content-home.html` | `editorial-contrast` | `warm-editorial` | `story-map` | `editorial-hero` `stat-row` `story-section` `feature-grid` `timeline` `cta-banner` |
| `product-launch.html` | `product-launch` | `deep-launch` | `product-spec-runway` | `spec-hero` `stat-row` `feature-grid` `logo-wall` `cta-banner` |
| `ops-dashboard.html` | `operational-density` | `tool-neutral` | `ops-density-grid` | `filter-rail` `summary-panel` `dense-table` `settings-group` |

## 默认规则

- 静态原型优先使用单文件 HTML 模板起步
- 优先用 `openprd design-starter` 创建入口文件，不要手动从空白页重搭第一版骨架
- 如果页面主题和模块范围已经明确，优先用 `openprd design-starter . --starter <starter-id> --out index.html --brief "<页面主题>" --sections "<模块1|模块2|模块3>"`，让 starter 顺手把 active design artifacts 和第一版真实文案一起落出来
- 对不依赖外部产品事实、品牌素材或真实图片的静态首页，active design artifacts 可以直接写“无外部事实依赖”“当前无品牌素材依赖”“真实图片不是页面成立前提”，不要把这些通用页面长时间停在 `pending`
- 跑完 `design-starter` 后先改生成入口文件里的 `[占位]` 文案和标题，再细化样式，不要回头整页重读模板源码
- 跑完 `design-starter` 后，下一步默认就是一次补丁，同时改入口文件和必要的 active design artifacts；直接在生成的入口文件上改。禁止删除 starter 生成的入口文件后另起新稿
- 先改结构和文案，再细化装饰
- 细化样式前先用 `anti-slop.md` 检查：不要默认紫白渐变、通用字体、白底卡片堆叠或同一种安全模板
- 模板字体、色彩和动效只是起步点；如果它们不服务当前审美主张，要在 Patch Mode 中改掉
- 模板只是骨架，不能把示例文案原样交付
- 如果模板默认组合已经够用，不要继续把所有 catalog 文件都重读一遍再决定
