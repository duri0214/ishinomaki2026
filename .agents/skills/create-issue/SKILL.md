---
name: create-issue
description: Use when the user asks to record new work as a GitHub issue or confirms that a coding task needs a new issue. Create the issue, report its URL, and stop before creating a branch or implementing it.
---

# Create an issue

Use this skill only when the user explicitly asks for a new issue or confirms that a new issue should be created.

1. Read the request and relevant repository context. Search open issues for a duplicate or an existing issue that already covers the work.
2. If the scope or expected result is unclear, ask only for the missing details needed to create a useful issue.
3. Write a concise title and an issue body with the problem, requested change, and observable completion criteria. Use the repository's language and conventions.
4. Create the issue with `gh issue create` when GitHub access is available. If it is unavailable, provide the prepared title and body for the user to create.
5. Report the issue number and URL.

Stop after reporting the issue. Do not create a branch, modify source files, implement the issue, or create a pull request as part of this skill.
