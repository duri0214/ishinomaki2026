<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## GitHub issue workflow

Issue creation, branch creation, and pull request creation are separate stages. Use the matching skill for each stage; do not let one stage silently perform the next. If the user explicitly asks for multiple stages, carry them out sequentially.

- For a coding request without an issue number, search for a likely open issue and ask the user to confirm it before changing source files or creating a branch. If no issue fits, ask whether they want a new issue.
- Use `create-issue` only when the user asks for or confirms issue creation. It creates the issue, reports its URL, and stops.
- Use `create-branch` after the issue is identified and the user is ready to start work. It creates or switches to the issue branch and stops before editing source files.
- Use `create-pr` after implementation is complete. The PR body must include `Closes #<number>` when it completes the issue, or `Refs #<number>` for partial or related work. It must not create an issue or branch.
- Codex skills live in `.agents/skills/`; Claude Code skills live in `.claude/skills/`. Each platform entry points to the canonical workflow under `.agents/skills/`.
- Invoke a skill by its name: `$create-issue`, `$create-branch`, or `$create-pr` in Codex; `/create-issue`, `/create-branch`, or `/create-pr` in Claude Code.
