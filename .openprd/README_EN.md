# OpenPrd Workspace

[简体中文](./README.md) | English

`.openprd/` is the project-local source of truth for discovery, PRD synthesis, validation, freeze, and handoff.

## Lifecycle

```text
classify -> interview -> synthesize -> validate -> freeze -> handoff
```

## What Lives Here

- `config.yaml` - runtime defaults and workflow policy
- `schema/` - canonical PRD schema and validation rules
- `schema/diagram-architecture.schema.yaml` - minimal contract schema for architecture diagrams
- `schema/diagram-product-flow.schema.yaml` - minimal contract schema for product flow diagrams
- `templates/` - starter packs and registry
- `templates/diagram/` - contract templates for diagram artifacts
- `standards/` - project standards contract and manual templates
- `engagements/active/` - default active PRD draft, flow, role, and handoff docs
- `engagements/active/decision-log.md` - durable decision history
- `engagements/active/open-questions.md` - unresolved questions and discovery gaps
- `engagements/active/progress.md` - append-only execution progress
- `engagements/active/verification.md` - freeze and validation evidence
- `engagements/active/architecture-diagram.html` - reviewable architecture diagram artifact
- `engagements/active/architecture-diagram.json` - structured diagram contract for iteration
- `engagements/active/product-flow-diagram.html` - reviewable product flow diagram artifact
- `engagements/active/product-flow-diagram.json` - structured product flow contract for iteration
- `artifacts/active/` - HTML + Markdown + patch bundles for human-in-the-loop review and playground workflows
- `artifacts/archive/` - archived artifact bundles after demand review or handoff
- `state/` - runtime status, version index, freeze snapshots, session metadata, and execution graph
- `state/task-graph.json` - workflow/task graph, blockers, and next-ready node
- `state/events.jsonl` - append-only lifecycle event stream
- `state/versions/` - immutable version snapshots
- `sessions/` - per-engagement working state
- `exports/` - downstream outputs such as OpenSpec handoff bundles

## Template Layers

```text
base -> industry -> company -> project -> session
```

Rules:

- Core PRD fields are fixed.
- Template layers may add or reorder sections.
- Template layers may not remove required semantics.
- The active engagement is the working draft that evolves over time.
- `classify` sets the product type; `interview` loads discovery prompts.
- `next` recommends the next action and discovery questions.
- `synthesize` writes a new versioned PRD snapshot.
- HTML review and playground artifacts should be paired with a markdown data source and a machine-readable capture patch.
- `diff` compares version snapshots.
- `history` lists the version index.
- Freeze requires validation to pass.
- `standards` verifies `docs/basic/`, file manual templates, and folder README templates.

## Project Standards

The canonical project baseline docs path is `docs/basic/`.

Required docs:

- `docs/basic/file-structure.md`
- `docs/basic/app-flow.md`
- `docs/basic/prd.md`
- `docs/basic/frontend-guidelines.md`
- `docs/basic/backend-structure.md`
- `docs/basic/tech-stack.md`

Use `openprd standards <path> --verify` before reporting a change as ready.

## Supported Product Types

- `consumer`
- `b2b`
- `agent`

## Handoff Principle

The goal is not only to write a PRD. The goal is to keep a PRD alive as the product evolves, and to export a stable handoff package when execution starts.
