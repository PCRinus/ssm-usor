# Deployment and Wrangler

The marketing preview is deployed as a Cloudflare Worker with Static Assets. Astro generates the
files in `apps/marketing/dist`, while `apps/marketing/src/worker.ts` runs before every asset request
and requires temporary HTTP Basic Auth credentials.

The Basic Auth layer is only for hiding unfinished design work. It is not the authentication model
for the future SaaS application and should be removed before the public landing page launches.

## GitHub environment

Create a GitHub Actions environment named `design-preview` under **Settings → Environments**. Add
these four environment secrets:

| Secret                  | Purpose                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Allows Wrangler to deploy the marketing Worker and its static assets.    |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the Cloudflare account that owns the Worker.                     |
| `BASIC_AUTH_USERNAME`   | Username uploaded to the Worker as an encrypted secret.                  |
| `BASIC_AUTH_PASSWORD`   | Strong temporary password uploaded to the Worker as an encrypted secret. |

Create the Cloudflare token from the **Edit Cloudflare Workers** template and restrict it to the
single account used by this project. The initial deployment uses the generated `workers.dev`
hostname, so a zone ID and DNS permissions are not required. A custom hostname can be added later
once its exact domain is chosen.

The deployment workflow runs after the `CI` workflow succeeds for a push to `main`. It can also be
started manually from the Actions tab. GitHub passes the two Basic Auth values to the official
Wrangler action, which creates or replaces the corresponding Cloudflare Worker secrets.

## Local development and preview

For normal landing-page work, use Astro's development server. This is the fastest feedback loop and
does not include the Basic Auth Worker:

```bash
nvm use
pnpm install
pnpm dev:marketing
```

To reproduce the deployed Cloudflare Worker locally, create a gitignored development secret file
and run the Worker preview:

```bash
cp apps/marketing/.dev.vars.example apps/marketing/.dev.vars
# Replace both placeholder values in apps/marketing/.dev.vars.
pnpm preview:marketing
```

Wrangler builds the Astro site and serves the Worker plus static assets at `http://localhost:8788`.
Unlike `astro preview`, this route exercises Basic Auth and the Worker runtime.

## Local Cloudflare authentication

Wrangler uses an interactive OAuth login on a developer machine:

```bash
pnpm --filter @ssm-usor/marketing exec wrangler login
pnpm --filter @ssm-usor/marketing exec wrangler whoami
```

The login is stored outside the repository. It is separate from the API token used by GitHub
Actions.

## Validate and deploy locally

Validate the Worker bundle and asset configuration without publishing anything:

```bash
pnpm --filter @ssm-usor/marketing build
pnpm --filter @ssm-usor/marketing deploy:dry-run
```

For the first local deployment, code, assets, and the values from the gitignored `.dev.vars` file
can be uploaded together:

```bash
pnpm --filter @ssm-usor/marketing build
pnpm --filter @ssm-usor/marketing exec wrangler deploy --secrets-file .dev.vars
```

After the Worker secrets exist remotely, ordinary deployments preserve them:

```bash
pnpm deploy:marketing
```

Useful operational commands:

```bash
pnpm --filter @ssm-usor/marketing exec wrangler tail
pnpm --filter @ssm-usor/marketing exec wrangler versions list
pnpm --filter @ssm-usor/marketing exec wrangler rollback
```

`wrangler dev` runs the Worker locally, `wrangler deploy` uploads a new Worker version and its static
assets, `wrangler tail` streams runtime logs, and the versions commands support inspection and
rollback.
