# AGENTS.md

Welcome to the **Feature Flag 与灰度规则平台** repository.

This project is a lightweight full-stack Monorepo built for the Feature Flag & Grayscale Rule Management platform.
- **Backend**: Go + Gin + GORM + PostgreSQL
- **Frontend**: Vite + React + TypeScript + Ant Design

---

## Agent skills

### Issue tracker

Local markdown in `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout at repo root (`GLOSSARY.md`, `docs/SPEC.md`, `docs/adr/`). See `docs/agents/domain.md`.

---

## Engineering Guidelines for AI Agents

### 1. Source of Truth
Before designing or implementing any code, always consult and strictly adhere to:
- **`GLOSSARY.md`**: Ubiquitous language and terms. Do not invent unauthorized synonyms.
- **`docs/SPEC.md`**: Problem statement, core requirements, and 24 User Stories.
- **`docs/adr/`**: Architectural Decision Records:
  - `0001-tech-stack-and-monorepo.md`: Monorepo structure, Go + React + Ant Design, PostgreSQL.
  - `0002-atomic-audit-and-priority-integrity.md`: Atomic transaction for audit logs, strict integer priorities.
  - `0003-strict-type-rule-matching-and-evaluation.md`: Deterministic rule matching (`equals`, `in`), strict JSON type isolation without cross-type coercion.
  - `0004-bulk-rule-sync-diff-audit-and-deployment.md`: Diff calculation (create/update/delete) in atomic batch updates.
  - `0005-api-contract-and-error-handling.md`: Unified envelope `{code, message, data}`, RFC-7807 problem details, standardized error codes.
  - `0006-clean-layered-package-layout.md`: Unidirectional package layout `Handler -> Service -> Repository -> Database`, pure-memory `Engine`, centralized `domain` models.

### 2. Task Tracking & Workflow
- Use `.scratch/feature-flag-platform/` for planning and task execution.
- Tickets live in `.scratch/feature-flag-platform/issues/<NN>-<slug>.md`.
- Read ticket before work, mark status (`claimed`), verify against user stories, and mark `resolved`.

### 3. Implementation Guardrails
- **Zero Mock Fallback**: All frontend operations must call real Go APIs; all data must persist in PostgreSQL.
- **Atomic Operations**: Flag modifications and rule batch syncs MUST write audit records in the same DB transaction.
- **Engine Purity**: The evaluation engine must remain pure in-memory with zero DB/external I/O.
- **Error Clarity**: Return domain-specific error codes (`FLAG_KEY_CONFLICT`, `PRIORITY_CONFLICT`, `VALIDATION_ERROR`, etc.) on conflict and invalid input.
