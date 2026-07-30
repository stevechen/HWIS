# Issue tracker: GitHub Issues

Issues and specs for this repo live in **GitHub Issues** (https://github.com/stevechen/HWIS/issues). Uses the `gh` CLI for all operations.

## Conventions

- Specs are created as GitHub Issues with the `spec` label
- Implementation tickets are created as GitHub Issues with the `task` label
- Triage state is recorded using GitHub labels (see `triage-labels.md` for the role strings)
- PRs are linked to issues via "Closes #N" or "Fixes #N" in commit messages or PR descriptions

## When a skill says "publish to the issue tracker"

Create a new GitHub Issue using `gh issue create` with appropriate labels.

## When a skill says "fetch the relevant ticket"

Read the issue using `gh issue view <number>` or the GitHub web UI. The user will normally pass the issue number directly.
