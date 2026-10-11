---
name: create-branch
description: Use when the user is ready to start work on a confirmed GitHub issue and asks for an issue-specific branch. Create or switch to that branch, report it, and stop before modifying source files.
---

# Create an issue branch

1. Confirm the issue number from the user's request or conversation. If it is missing or ambiguous, ask which issue to use and wait.
2. Verify the issue exists with `gh issue view <number>` when GitHub access is available.
3. Inspect the current branch and working tree. If unrelated uncommitted changes could be affected, stop and ask how to proceed.
4. Use an existing branch for the issue if one is already present locally or on `origin`. Otherwise, create a branch named `<type>/<issue-number>-<short-slug>`, such as `fix/42-login-redirect` or `docs/13-agent-workflow`.
5. Report the issue number and branch name.

Stop after creating or switching to the branch. Do not edit source files, commit, push, create an issue, or open a pull request as part of this skill.
