# Code comments

The code says how. A comment is only for context the code cannot carry. The default is no comment.

## The test

Before writing a comment, ask: would a competent reader who knows the stack, reading this code and its names, be surprised or misled without it? If not, leave it out. If a comment only feels needed because a name is vague, fix the name.

## Write a comment for

- **A constraint from outside the code**: a quirk of a library, platform or service, a legal or product rule.
  `// No parentheses: Storage percent-encodes them and browsers save the name as it comes.`
- **A trap**: code that looks wrong, redundant or simplifiable but must stay as it is.
  `// Keep this callback synchronous. Calling Supabase auth methods inside it can deadlock.`
- **A decision with a rejected alternative**: why this and not the obvious thing. One line, or a pointer to the ADR.
- **A security or privacy reason.**
  `// Never send a bearer token to an origin chosen by an endpoint path or redirect.`
- **A meaning the types cannot express**: units, what null stands for, an invariant across fields.
  `// Null for an account that belongs to no organization.`

## Do not write

- What the next lines do, in words. `// Fetch the clients`, `// Loop over the rows`, `// Returns the total`.
- What a component, function, type or file is, when its name and signature already say it.
  `// A password field with a show/hide toggle.` above `PasswordInput`.
- Section labels and dividers: `// Types`, `// Helpers`, `// ---- handlers ----`.
- Step narration in tests: `// Arrange`, `// Click the button`, `// Check the result`. The test name carries the intent.
- What changed or when: `// Now uses getSession()`, `// Added for the PDF work`. That belongs in the commit message.
- References to the conversation, the task, the issue or the PR that produced the code.
- JSDoc that repeats the TypeScript types.
- Commented-out code.

## Form

- One or two lines. A comment that needs a paragraph is usually an ADR or a commit message.
- State the reason, not the mechanism: "because X", not "this does Y".
- When editing code, remove comments the edit made false or redundant. Do not strip why-comments that are still true.

## Leave alone

- Directives that tools read: `eslint-disable`, `@ts-expect-error`, `/// <reference>`, `biome-ignore`, shebangs, `# syntax=`. An `eslint-disable` or `@ts-expect-error` should keep its reason.
- Generated files (`routeTree.gen.ts`, `src/api/generated/`).
- Applied migrations in `supabase/migrations/`: history is not edited. New migrations follow this document.
