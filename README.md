# SSM Ușor

A product concept for a multi-client SaaS operating system for Romanian external SSM services.

Start with the [working product scope](docs/product-scope.md).

The [pre-launch go-to-market validation plan](docs/go-to-market-validation.md) defines the landing page, provider acquisition channels, and paid-validation gates.

The [technical architecture](docs/technical-architecture.md) records the proposed Astro/React/TypeScript monorepo, application boundaries, rendering strategy, and staged implementation path.

[ADR 001](docs/architecture/adr-001-web-applications-and-cloudflare.md) records the accepted decision to use a static Astro marketing site, a client-only React/Vite dashboard, a shared Worker API, and Cloudflare-first deployment.

The [deployment guide](docs/deployment.md) covers the public Cloudflare marketing site,
required GitHub secrets, and local Wrangler commands.

The [application deployment guide](docs/app-deployment.md) covers selective, automatic API and SPA
releases to `api.ssmusor.ro` and `app.ssmusor.ro`.

The [CI/CD guide](docs/ci-cd.md) explains change selection, build artifacts, Turbo caching,
and recovery from failed deployments.

See the [API client guide](docs/api-client.md) for OpenAPI generation, Orval, and `VITE_API_URL`.

See the [development admin guide](docs/development-admin.md) for local login credentials and `pnpm seed:admin`.

See [local Supabase development](docs/local-development.md) to run Auth and Postgres with
Docker, seed a local user, and connect the SPA/API without using the hosted project.

## Workspace

The pnpm/Turborepo workspace contains:

- `apps/marketing` — the static Astro acquisition site and landing-page concepts;
- `apps/app` — the client-only React/Vite application shell;
- `apps/api` — the Cloudflare Worker API;
- `packages/contracts` — runtime schemas and shared transport types.
- `packages/design-tokens` — shared brand colors, typography, radii, and Tailwind theme;
- `packages/ui` — shared shadcn React primitives and the Tailwind CSS entry point.

See [shared UI and styling](docs/shared-ui.md) for component imports, Astro usage, and adding
components with `pnpm ui:add <component>`.

See [dashboard setup and authentication](docs/app.md) for Supabase browser configuration,
routes, session handling, and tests.

See [API setup and authentication](docs/api.md) for the Hono Worker, local Supabase bindings,
bearer-token verification, and the `/health` and `/me` routes.

Use Node.js 24 or newer. The `.nvmrc` tracks the Node 24 major line, so with nvm run `nvm use`, then:

```bash
pnpm install
pnpm dev:marketing
pnpm preview:marketing
```

The current landing page is served at `http://localhost:4321/`. Landing-page design concepts live
under `http://localhost:4321/concepte/`: a gallery index plus one page per direction
(`/concepte/fluxul/`, `/concepte/portofoliul/`, `/concepte/un-singur-flux/`). Concept pages
are `noindex`, excluded from the sitemap, and share their Romanian copy through
`apps/marketing/src/components/concepts/content.ts`. Common commands:

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm lint
pnpm deploy:dry-run
```

The three `deploy:*` scripts publish the corresponding application with Wrangler after Cloudflare authentication and domain configuration are in place.
