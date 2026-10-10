# Domain Docs — Single-Context Layout

This repo uses a **single-context** layout:

- `GLOSSARY.md` at repo root — the ubiquitous language for the entire codebase
- `docs/adr/` — Architecture Decision Records (numbered `NNNN-title.md`)

## Consumer Rules

- Agents **must** read `GLOSSARY.md` before writing domain code.
- Agents **must** check `docs/adr/` for relevant ADRs before making architectural changes.
- When a term is ambiguous, the glossary wins; when an ADR conflicts with instinct, the ADR wins.
- New terms or ADRs go through the `domain-modeling` skill (writes to `GLOSSARY.md` or `docs/adr/`).

## No `GLOSSARY-MAP.md`

This is not a monorepo — no per-package glossaries or context maps needed.