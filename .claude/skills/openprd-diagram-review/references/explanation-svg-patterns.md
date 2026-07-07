<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-diagram-review:reference:explanation-svg-patterns.md
version=0.1.19
checksum=a90777a46011e96a
-->

# Explanation SVG Patterns

## Purpose

Use explanation SVGs when the user needs to understand a relationship before they need a formal artifact. These diagrams are optimized for comprehension in the conversation, not for approval gates.

An explanation SVG should reduce text. The preferred shape is:

1. One sentence conclusion
2. One compact SVG
3. Up to three short notes or open questions

## When To Use

Use an explanation SVG for:

- state transitions
- before / after comparisons
- current state to target state paths
- cause and effect chains
- responsibility or boundary splits
- risk propagation
- decision trees
- trade-off comparisons
- requirement scenarios with multiple actors or steps

Do not use an explanation SVG for:

- a single factual answer
- exact command output or error text
- legal, security, or compliance wording that must be precise
- proof of implementation
- visual acceptance evidence
- formal PRD review sign-off

## Visual Grammar

- Keep the canvas compact, usually 900 to 1200 px wide.
- Use 2 to 5 main nodes.
- Put short labels inside nodes; keep supporting text outside the SVG.
- Use arrows to show direction, not paragraphs.
- Use dashed outlines for scope or uncertainty.
- Use muted gray for background or irrelevant history.
- Use green/teal for target, current, or healthy path.
- Use amber/red only for risk, blockage, or failure.
- Keep labels in the user's language. For zh-CN, use Simplified Chinese.

## Pattern Library

### Two-Side Comparison

Use when explaining why two approaches feel different.

```svg
<svg viewBox="0 0 980 360" role="img" aria-label="两种方案对比">
  <rect x="24" y="28" width="440" height="290" rx="18" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="8 6"/>
  <rect x="516" y="28" width="440" height="290" rx="18" fill="#ecfdf5" stroke="#14b8a6" stroke-dasharray="8 6"/>
  <text x="52" y="76" font-size="24" font-weight="700" fill="#1f2937">文字优先</text>
  <text x="544" y="76" font-size="24" font-weight="700" fill="#065f46">图解优先</text>
  <rect x="76" y="132" width="280" height="76" rx="12" fill="#fff7ed" stroke="#fdba74"/>
  <text x="216" y="164" text-anchor="middle" font-size="20" font-weight="700" fill="#7c2d12">先解释很多概念</text>
  <text x="216" y="192" text-anchor="middle" font-size="16" fill="#9a3412">用户自己拼结构</text>
  <rect x="568" y="132" width="280" height="76" rx="12" fill="#d1fae5" stroke="#10b981"/>
  <text x="708" y="164" text-anchor="middle" font-size="20" font-weight="700" fill="#065f46">先看到关系</text>
  <text x="708" y="192" text-anchor="middle" font-size="16" fill="#047857">文字只补结论</text>
  <path d="M356 170 H568" stroke="#64748b" stroke-width="3" marker-end="url(#arrow)"/>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#64748b"/>
    </marker>
  </defs>
</svg>
```

### State Transition

Use when explaining how the current state moves to a future state, and whether history matters.

```svg
<svg viewBox="0 0 1080 360" role="img" aria-label="状态转移说明">
  <rect x="34" y="40" width="1012" height="250" rx="22" fill="#ffffff" stroke="#cbd5e1" stroke-dasharray="8 6"/>
  <rect x="90" y="130" width="230" height="88" rx="14" fill="#f1f5f9" stroke="#cbd5e1"/>
  <text x="205" y="164" text-anchor="middle" font-size="21" font-weight="700" fill="#64748b">过去状态</text>
  <text x="205" y="194" text-anchor="middle" font-size="16" fill="#94a3b8">不一定重要</text>
  <rect x="424" y="130" width="230" height="88" rx="14" fill="#ccfbf1" stroke="#14b8a6"/>
  <text x="539" y="164" text-anchor="middle" font-size="21" font-weight="700" fill="#0f766e">当前状态</text>
  <text x="539" y="194" text-anchor="middle" font-size="16" fill="#0f766e">决策起点</text>
  <rect x="758" y="130" width="230" height="88" rx="14" fill="#dcfce7" stroke="#22c55e"/>
  <text x="873" y="164" text-anchor="middle" font-size="21" font-weight="700" fill="#166534">未来状态</text>
  <text x="873" y="194" text-anchor="middle" font-size="16" fill="#15803d">下一步结果</text>
  <path d="M320 174 H424" stroke="#cbd5e1" stroke-width="3" marker-end="url(#mutedArrow)"/>
  <path d="M654 174 H758" stroke="#0f766e" stroke-width="5" marker-end="url(#greenArrow)"/>
  <text x="706" y="214" text-anchor="middle" font-size="17" fill="#0f766e">关键转移</text>
  <defs>
    <marker id="mutedArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#cbd5e1"/>
    </marker>
    <marker id="greenArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#0f766e"/>
    </marker>
  </defs>
</svg>
```

### Boundary Map

Use when explaining what belongs in scope, what is adjacent, and what remains outside.

```svg
<svg viewBox="0 0 980 420" role="img" aria-label="范围边界说明">
  <rect x="46" y="44" width="888" height="310" rx="24" fill="#f8fafc" stroke="#94a3b8" stroke-dasharray="9 7"/>
  <text x="76" y="90" font-size="24" font-weight="700" fill="#334155">本次范围</text>
  <rect x="120" y="142" width="220" height="92" rx="14" fill="#dbeafe" stroke="#3b82f6"/>
  <text x="230" y="178" text-anchor="middle" font-size="20" font-weight="700" fill="#1d4ed8">核心问题</text>
  <text x="230" y="207" text-anchor="middle" font-size="16" fill="#2563eb">必须解决</text>
  <rect x="380" y="142" width="220" height="92" rx="14" fill="#dcfce7" stroke="#22c55e"/>
  <text x="490" y="178" text-anchor="middle" font-size="20" font-weight="700" fill="#166534">可执行动作</text>
  <text x="490" y="207" text-anchor="middle" font-size="16" fill="#15803d">这轮落地</text>
  <rect x="640" y="142" width="220" height="92" rx="14" fill="#fff7ed" stroke="#f59e0b"/>
  <text x="750" y="178" text-anchor="middle" font-size="20" font-weight="700" fill="#92400e">开放问题</text>
  <text x="750" y="207" text-anchor="middle" font-size="16" fill="#b45309">需要确认</text>
  <text x="490" y="300" text-anchor="middle" font-size="18" fill="#64748b">边界外内容只记录，不混成本次失败</text>
</svg>
```

## Copy Rules

- The sentence before the diagram should state the takeaway, not repeat every label.
- The notes after the diagram should explain only what the user must decide or notice.
- Avoid file names, function names, raw route codes, schema names, and internal gate names unless the user asked for implementation detail.
- Do not hide uncertainty inside the diagram. Use "待确认" or a dashed node when a claim is inferred.
