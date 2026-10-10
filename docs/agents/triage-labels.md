# Triage Labels — Default Vocabulary

This repo uses the default five-role vocabulary. Each label string equals its name.

| Role | Label | Purpose |
|------|-------|---------|
| `needs-triage` | `needs-triage` | New issue, not yet categorised |
| `needs-info` | `needs-info` | Blocked on clarification from user/stakeholder |
| `ready-for-agent` | `ready-for-agent` | Clear, scoped, agent can start immediately |
| `ready-for-human` | `ready-for-human` | Requires human decision/action (design, deploy, access) |
| `wontfix` | `wontfix` | Closed without action; reason recorded |

## Usage

- Every issue gets exactly one triage label at all times.
- `to-tickets` publishes new tickets with `ready-for-agent`.
- `triage` skill moves issues through this state machine.
- Labels are created automatically if missing (`gh label create`).