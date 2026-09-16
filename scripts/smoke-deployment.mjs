import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

const [target, origin, appOrigin] = process.argv.slice(2);
assert(
  ['api', 'app'].includes(target),
  'Usage: smoke-deployment.mjs api|app <origin> [app-origin]'
);
assert(origin, 'A deployment origin is required');
if (target === 'api') assert(appOrigin, 'The API check requires the allowed app origin');

async function request(path, status, options = {}) {
  const response = await fetch(new URL(path, origin), {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, status, `${path}: expected ${status}, received ${response.status}`);
  return response;
}

async function checkApi() {
  const health = await request('/health', 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'ssm-usor-api' });

  const schema = await request('/openapi.json', 200);
  assert((await schema.json()).paths['/me']?.get, 'OpenAPI must describe GET /me');

  const preflight = await request('/me', 204, {
    method: 'OPTIONS',
    headers: {
      Origin: appOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), appOrigin);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /authorization/i);
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /\bGET\b/);

  await request('/me', 401);
  // Supplying a token exercises Supabase configuration as well as the auth middleware.
  // This is deliberately invalid and does not create a user or session.
  const rejected = await request('/me', 401, {
    headers: { Origin: appOrigin, Authorization: 'Bearer deployment-smoke-test' },
  });
  assert.equal(rejected.headers.get('access-control-allow-origin'), appOrigin);
  assert.equal((await rejected.json()).error, 'unauthorized');
}

async function checkApp() {
  const login = await request('/login', 200);
  assert.match(login.headers.get('content-type') ?? '', /text\/html/);
  const html = await login.text();
  assert.match(html, /id="root"/, 'The response must contain the React root');
  const dashboard = await request('/dashboard', 200);
  assert.equal(await dashboard.text(), html, 'Direct dashboard navigation must serve the SPA');

  const asset = html.match(/<script\b[^>]*\bsrc="([^"]+\.js)"/)?.[1];
  assert(asset, 'The SPA must reference a built JavaScript bundle');
  assert.equal(new URL(asset, origin).origin, new URL(origin).origin);
  const javascript = await request(asset, 200);
  assert.match(javascript.headers.get('content-type') ?? '', /javascript/);
}

// New custom domains may need time for DNS and TLS to become available.
for (let attempt = 1; attempt <= 6; attempt += 1) {
  try {
    await (target === 'api' ? checkApi() : checkApp());
    console.log(`${target} deployment checks passed: ${origin}`);
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    console.warn(`Attempt ${attempt}/6 failed: ${error.message}. Retrying in 10 seconds.`);
    await setTimeout(10_000);
  }
}
