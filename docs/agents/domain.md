# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/architecture/`**: ADRs, named `adr-NNN-<slug>.md`. Read the ones that touch the area you're about to work in. New ADRs go here too, numbered after the latest.
- **`docs/data-model.md`** and **`docs/api.md`**: until `CONTEXT.md` exists, these hold the working vocabulary (organization, member, owner, specialist, client, employee).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context: the apps and packages serve one product and share one vocabulary.

```
/
├── CONTEXT.md
├── docs/architecture/
│   ├── adr-001-web-applications-and-cloudflare.md
│   ├── adr-002-transactional-email.md
│   ├── adr-003-organization-invitations.md
│   └── adr-004-registration-and-onboarding.md
└── apps/, packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR 002 (transactional email), but worth reopening because…_
