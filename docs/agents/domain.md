# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root
- **`docs/adr/`**: read ADRs that touch the area you're about to work in (ADR 0001 through 0006)
- **`docs/SPEC.md`**: the comprehensive specification covering problem statement, requirements, and user stories

## File structure

Single-context repo:

```
/
├── GLOSSARY.md
├── docs/
│   ├── SPEC.md
│   ├── adr/
│   │   ├── 0001-tech-stack-and-monorepo.md
│   │   ├── 0002-atomic-audit-and-priority-integrity.md
│   │   ├── 0003-strict-type-rule-matching-and-evaluation.md
│   │   ├── 0004-bulk-rule-sync-diff-audit-and-deployment.md
│   │   ├── 0005-api-contract-and-error-handling.md
│   │   └── 0006-clean-layered-package-layout.md
│   └── agents/
├── backend/
└── frontend/
```

## Use the glossary's vocabulary

When naming domain concepts (in an issue title, code symbols, refactor proposal, test name, or API contract), strictly use the terms defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

## Flag ADR conflicts

If any proposed change or implementation contradicts an existing ADR, surface it explicitly rather than silently overriding.
