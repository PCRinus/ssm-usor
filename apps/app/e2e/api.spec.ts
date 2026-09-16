import { expect, test } from '@playwright/test';

const appOrigin = process.env.E2E_APP_URL ?? 'http://localhost:4174';

test('API health and OpenAPI contract are available', async ({ request }) => {
  // Poll while a newly deployed custom domain becomes available.
  await expect(async () => {
    const health = await request.get('/health', { maxRedirects: 0, timeout: 10_000 });
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', service: 'ssm-usor-api' });
  }).toPass({ timeout: 45_000, intervals: [5_000, 10_000] });

  const schema = await request.get('/openapi.json', { maxRedirects: 0 });
  expect(schema.status()).toBe(200);
  expect((await schema.json()).paths['/me'].get).toBeDefined();
});

test('browser preflight allows the application origin and bearer header', async ({ request }) => {
  const response = await request.fetch('/me', {
    method: 'OPTIONS',
    maxRedirects: 0,
    headers: {
      Origin: appOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  expect(response.status()).toBe(204);
  expect(response.headers()['access-control-allow-origin']).toBe(appOrigin);
  expect(response.headers()['access-control-allow-headers']).toMatch(/authorization/i);
  expect(response.headers()['access-control-allow-methods']).toMatch(/\bGET\b/);
});

test('protected routes reject missing and invalid bearer tokens', async ({ request }) => {
  const missing = await request.get('/me', { maxRedirects: 0 });
  expect(missing.status()).toBe(401);

  // A supplied token also exercises the API's Supabase configuration.
  const invalid = await request.get('/me', {
    maxRedirects: 0,
    headers: { Origin: appOrigin, Authorization: 'Bearer deployment-smoke-test' },
  });
  expect(invalid.status()).toBe(401);
  expect(invalid.headers()['access-control-allow-origin']).toBe(appOrigin);
  expect(await invalid.json()).toMatchObject({ error: 'unauthorized' });
});
