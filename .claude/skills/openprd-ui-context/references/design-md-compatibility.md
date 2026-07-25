<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-ui-context:reference:design-md-compatibility.md
version=0.1.19
checksum=ecb1e35ffc265020
-->

# Google design.md Compatibility

固定目标：

- repository: `google-labs-code/design.md`
- schema version: `alpha`
- commit: `bde692f2bc92ef7fdd0cf277b2704ab074b70efd`
- spec: `docs/spec.md`

## Frontmatter

- `version` 必须是 `alpha`
- `name` 必填
- `colors.primary` 必填
- typography token 至少包含 `fontFamily`、`fontSize`、`fontWeight`、`lineHeight`
- Dimension 使用 `px`、`em` 或 `rem`
- token reference 使用 `{path.to.token}`

## 章节顺序

1. Overview
2. Colors
3. Typography
4. Layout
5. Elevation & Depth
6. Shapes
7. Components
8. Do's and Don'ts

可省略不相关章节，但 OpenPrd 冻结合同至少保留 Overview、Colors、Typography、Layout、Components、Do's and Don'ts。不得重复章节。

## 本地 lint

运行 `openprd ui-context . --check`。本地 lint 同时校验唯一 marker、冻结状态、确认方向、schema commit、必需章节内容和 dimension 单位；任何失败都会把旧 Impeccable handoff 更新为 blocked。如果项目另行安装 Google design.md CLI，可再运行其官方 lint，二者结果都要保留；OpenPrd 不自动安装或调用未批准的外部依赖。
