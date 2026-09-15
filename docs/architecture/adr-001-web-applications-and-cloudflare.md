# ADR 001: Web Applications and Cloudflare Deployment

- Status: accepted
- Date: 2026-08-31

## Context

SSM Ușor needs two web surfaces with different jobs:

1. a public acquisition website whose content must be fast, indexable, and inexpensive to serve;
2. an authenticated workflow application whose value comes from client-side interaction with the product API, not from search-engine indexing.

The product will also need a public lead endpoint, an authenticated application API, file storage, background processing, and eventually heavyweight document conversion.

## Decision

### Public marketing site

Build `apps/marketing` with Astro and TypeScript. Pre-render its pages at build time. Use React only for interactive islands that cannot be expressed cleanly with static HTML or small browser scripts.

Deploy its generated assets with Cloudflare Workers Static Assets. Do not add an Astro server adapter until a concrete route requires request-time rendering.

### Authenticated dashboard

Build `apps/app` as a plain React single-page application with Vite and TypeScript.

The dashboard will not use Astro, Next.js, React Server Components, or server-side rendering. Cloudflare serves its production build as static assets with SPA fallback routing. All authoritative validation, authentication, tenant authorization, persistence, and business logic remains in the API.

### API

Build `apps/api` as a Cloudflare Worker using the standard Fetch API. The same API deployment may initially expose both narrowly protected public endpoints and authenticated dashboard endpoints. They remain separate modules and security domains.

Shared runtime schemas and transport types live in `packages/contracts`. Client-side validation exists for usability only; server-side validation is authoritative.

### Infrastructure boundary

Cloudflare is the initial deployment platform for DNS, CDN/static assets, the HTTP API, Turnstile, and later R2 or queues where appropriate.

Cloudflare is a default, not a constraint on every future workload. CPU-intensive or native document conversion may run in a separately deployed EU-hosted Node.js/container worker while remaining behind the same API and job contracts. The core production database will be selected separately from this decision.

### Monorepo

Use pnpm workspaces with Turborepo. Applications are independently deployable and may depend on shared packages through the `workspace:` protocol. No application imports another application's internals.

## Consequences

- The public website and dashboard can both be served cheaply as static assets.
- The dashboard remains portable across static hosting providers.
- SEO concerns cannot force server-rendering complexity into the authenticated product.
- The API contract is the boundary between browser applications and product logic.
- Cloudflare-specific configuration stays inside each deployable application.
- Heavy document-processing requirements can be solved without rewriting the public API or either web application.
