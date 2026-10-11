---
name: create-pr
description: Use when implementation for an existing GitHub issue is complete and the user asks to create a pull request. Include the issue reference in the PR body, then report the PR URL.
---

# Create a pull request

1. Confirm the issue number from the request, conversation, or current issue branch. If it is missing or ambiguous, ask the user and wait. Do not create an issue or branch here.
2. Verify the issue and inspect the current branch, commits, and working tree. Ensure the proposed PR contains only the intended work and targets the repository's default branch.
3. Summarize the implementation and report the checks that were actually run. Do not claim checks passed if they were not run.
4. Write a clear PR title and body following `.github/pull_request_template.md`. Include `Closes #<number>` if this PR completes the issue. Use `Refs #<number>` if the work is partial or only related, so the issue stays open. Let CI report automated checks; do not add manual checkboxes for checks covered by CI. For screen or UI changes, include the visual review checkbox and leave it unchecked unless the display and main interactions were actually reviewed. Omit that section when there are no screen or UI changes.
5. If the user requested PR creation, commit only the intended changes if needed, push the issue branch, and create the PR with `gh pr create`. Do not merge it.
6. Report the PR URL and the issue reference used.

Stop after creating or preparing the PR. Do not create an issue or a branch as part of this skill.
