<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-diagram-review:reference:diagram-contracts.md
version=0.1.19
checksum=7681623c10fd103b
-->

# Diagram Contracts

## Language Requirement

For `locale: zh-CN`, all visible user-facing text in the contract must be Simplified Chinese. This includes `title`, `subtitle`, component names/subtitles/details, flow labels, summary cards, side panels, and review instructions.

Preserve necessary proper nouns and technical tokens inside Chinese sentences, such as MotiClaw, Electron, TypeScript, CLI, API, JSON, NDJSON, dry-run, Host API, schema, and `waiting_approval`. Do not write full English sentences just because the diagram contains technical terms.

## Architecture Diagram Contract

### Minimum required fields

- `type` = `architecture`
- `title`
- `components[]`
- `flows[]`
- `summaryCards[]`
- `reviewInstructions[]`
- `metadata.versionId`
- `metadata.reviewStatus`

### Fields the agent MUST fill

- `title`
- each component: `id`, `name`, `type`
- each flow: `source`, `target`, `label`
- at least one summary card
- at least one review instruction
- `metadata.versionId`
- `metadata.reviewStatus`

### Fields that may fallback

- `locale`
- `subtitle`
- component `subtitle`
- component `details`
- `sidePanels`
- `metadata.owner`
- `metadata.targetSystem`

Use fields such as:

- `locale`
- `title`
- `subtitle`
- `scope.inScope`
- `scope.outOfScope`
- `components[]`
  - `id`
  - `name`
  - `type`
  - `subtitle`
  - `details[]`
- `boundaries[]`
- `flows[]`
- `summaryCards[]`
- `assumptions[]`
- `reviewInstructions[]`
- `metadata`
  - `reviewStatus` (`pending-confirmation` | `confirmed` | `needs-revision`)

## Product-Flow Diagram Contract

### Minimum required fields

- `type` = `product-flow`
- `title`
- `actors[]`
- `steps[]`
- `transitions[]`
- `summaryCards[]`
- `reviewInstructions[]`

### Fields the agent MUST fill

- `title`
- at least one actor
- each step: `id`, `name`, `type`
- each transition: `from_step_id` or `from`, `to_step_id` or `to`, `label`
- at least one summary card
- at least one review instruction

### Fields that may fallback

- `locale`
- `subtitle`
- step `lane`
- step `description` / `subtitle`
- step `details`
- `openQuestions`
- `metadata.*`

Use fields such as:

- `locale`
- `flowName`
- `description`
- `actors[]`
- `steps[]`
  - `id`
  - `name`
  - `type`
  - `description`
  - `lane`
- `decisions[]`
- `transitions[]`
- `happyPath[]`
- `errorPaths[]`
- `assumptions[]`
- `openQuestions[]`
- `reviewInstructions[]`

## Current Runtime Reality

Current OpenPrd CLI has a built-in renderer for:

- `openprd diagram`

This is currently architecture-oriented.

If the user needs a product-flow view:

- still create the product-flow contract
- do not claim there is a dedicated flow renderer if there is not
- use the contract as the review artifact or as the next implementation target
