# Task Scope

- task: 微信贴图标题与正文字数状态修正
- source: user-confirmed
- confirmed-at: 2026-08-14
- mode: local-fix
- scope:
  - 标题与正文计数在限制内保持普通颜色
  - 只有标题超过 20 字或正文超过 1000 字时，当前数字进入红色错误态
  - 发布弹窗、发送动作与底层草稿服务都拒绝真正超限的数据
- reuse:
  - 延续现有 `operational-density + tool-neutral` 方向
  - 复用现有计数器、错误色和发布按钮，不新增组件或素材
- non-goals:
  - 不改变图片数量和素材账号规则
  - 不修改文章模式、飞书或多平台发布
  - 不改变微信平台限制值
- aesthetic-intent: 红色只表达已经发生、且会阻止发布的错误，避免把接近上限误读成失败
- memory-point: 计数颜色与发布结果一致
