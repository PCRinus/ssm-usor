# OpenAPI and the generated API client

The API owns the contract. Hono route definitions and the Zod schemas in
`packages/contracts` generate OpenAPI; Orval turns that document into TypeScript types,
request functions, TanStack Query hooks, query keys, and query-option factories.

```text
packages/contracts + apps/api/src/openapi.ts
  → apps/api/openapi.json
  → apps/app/src/api/generated/api.ts
  → apps/app
```

## Generate and review changes

From the repository root:

```bash
pnpm generate:api
pnpm check:generated
```

Generation builds the contracts package, exports the API document without starting a server,
and runs Orval plus Prettier. It needs no Supabase credentials or network access. Commit both
`apps/api/openapi.json` and the generated client with API changes. CI runs `check:generated`,
which regenerates them and fails if their contents changed, including added or removed files.
It leaves the regenerated files available for review. Normal builds consume the committed client.

The same document is served at `GET /openapi.json`. It declares bearer authentication on `/me`,
public access on `/health`, and the success/error response schemas. It contains no deployment
URL or credentials. Runtime host selection belongs to each client application.

To add an endpoint, define its method, path, stable `operationId`, request schemas, response
schemas, and authentication middleware in an OpenAPI route definition; register its handler
with `app.openapi(...)`. Add behavioral tests and regenerate. Hono checks the handler's response
type against the declared status/schema. Future input schemas will also validate requests at
runtime. Shared schemas remain plain Zod; OpenAPI names are attached through Zod's `.meta()`
in the API workspace, keeping framework dependencies out of the contracts package.

Do not edit generated TypeScript. ESLint skips that directory; TypeScript and Prettier still
check it. The HTTP adapter in `apps/app/src/api/http.ts` is handwritten and tested.

## Using the client

The client lives inside the SPA workspace: import generated operations from
`src/api/generated/api.ts` and HTTP configuration and errors from `src/api/http.ts`.
The SPA supplies request configuration through its typed router context:

```tsx
const { apiRequest } = useRouteContext({ from: '__root__' });
const { session } = useAuth();
const me = useGetMe({
  request: apiRequest,
  query: {
    queryKey: [...getGetMeQueryKey(), session?.user.id],
    enabled: Boolean(session && apiRequest.baseUrl),
  },
});
```

`getGetMeQueryOptions({ request: apiRequest })` is also available for QueryClient calls and
future route loaders. Include the user ID in private-data query keys consistently, as the
dashboard does. Never put access tokens in keys. Account changes clear the QueryClient and
cancel in-flight work; token refresh keeps the current account's cached data.

The request adapter:

- Reads the latest access token from the app's auth store immediately before each request.
- Forwards TanStack Query's abort signal to fetch and checks cancellation after awaiting auth.
- Sends bearer authentication without cookies, and refuses cross-origin endpoint URLs or redirects.
- Throws `ApiHttpError` on non-2xx responses, with `status` and the parsed response `body`.
- Preserves network/cancellation errors. The app does not automatically retry 4xx responses.

A `401` shows a session error with manual retry and the existing sign-out action; the adapter
does not silently refresh or loop on failed requests. The browser Supabase SDK handles normal
token refresh. Successful JSON responses have generated TypeScript types; those types do not
perform runtime response validation.

## App configuration

Set `VITE_API_URL` in `apps/app/.env.local` to the API origin. Development defaults to
`http://localhost:8787`; production requires an explicit URL. A production build with no URL
shows an unavailable account section and makes no API requests. The app deployment workflow
requires an HTTPS `VITE_API_URL` GitHub variable and includes it at build time. The deployed
API still needs to be provisioned before publishing the connected app.

Run both applications locally:

```bash
pnpm --filter @ssm-usor/contracts build
pnpm dev:api
# In another terminal:
pnpm dev:app
```

The dashboard now loads the verified account through the generated `/me` query and displays
loading, success, and recoverable error states. Tests cover the real generated client against
mock HTTP responses, token refresh, cancellation, and query error behavior. The [development admin guide](development-admin.md) records the completed live Supabase
login-to-API and token-refresh checks.
