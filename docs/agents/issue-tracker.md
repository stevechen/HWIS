# Issue Tracker — GitHub Issues

This repo tracks work in **GitHub Issues** on `stevechen/HWIS`.

## Operations

| Operation | How |
|-----------|-----|
| Create issue | `gh issue create --repo stevechen/HWIS --title "..." --body "..."` |
| List issues | `gh issue list --repo stevechen/HWIS --state all` |
| Get issue | `gh issue view --repo stevechen/HWIS <number>` |
| Add comment | `gh issue comment --repo stevechen/HWIS <number> --body "..."` |
| Add labels | `gh issue edit --repo stevechen/HWIS <number> --add-label "..."` |
| Set milestone | `gh issue edit --repo stevechen/HWIS <number> --milestone "..."` |
| Close issue | `gh issue close --repo stevechen/HWIS <number>` |
| Reopen issue | `gh issue reopen --repo stevechen/HWIS <number>` |
| Search issues | `gh issue list --repo stevechen/HWIS --search "..."` |

## Conventions

- **Sub-issues**: Use GitHub's native sub-issue relationship (parent/child) when breaking down a parent issue.
- **Blocking**: Use GitHub's native "Blocks / Blocked by" relationship. If unavailable, add `blocked-by:#123` labels.
- **Triage labels**: Apply one of `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` to every issue.
- **Agent-grabbable**: Issues labelled `ready-for-agent` are fair game for any agent to pick up.
- **Parent references**: When publishing tickets from a spec/parent issue, make each ticket a sub-issue of the parent.

## PRs as a request surface

**Disabled** — only issues are triaged. Flip to `true` in this file if you want external PRs entering the triage queue.