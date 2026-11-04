import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AdminWorkerEnv {
  ASSETS: Fetcher;
  // The API Worker's `Admin` entrypoint (ADR 038).
  API: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  // The Access application's audience tag, one per environment.
  ACCESS_AUD?: string;
  // "off" skips the Access check. Only apps/admin/.dev.vars may set it, for `wrangler dev`.
  ACCESS_CHECK?: string;
}

// jose keeps the fetched keys and refetches them only for a key id it does not know, so the
// sets live as long as the isolate.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetOf(teamDomain: string) {
  let keySet = keySets.get(teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    keySets.set(teamDomain, keySet);
  }
  return keySet;
}

async function passedAccess(request: Request, env: AdminWorkerEnv) {
  if (env.ACCESS_CHECK === 'off') return true;
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();
  if (!teamDomain || !audience) {
    console.error('ACCESS_TEAM_DOMAIN or ACCESS_AUD is not set; refusing every request.');
    return false;
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  try {
    await jwtVerify(token, keySetOf(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
      algorithms: ['RS256'],
    });
    return true;
  } catch {
    return false;
  }
}

// Cookies and Cloudflare's own headers stay here: the API reads the bearer token and nothing
// else the browser sends.
const forwardedHeaders = ['Authorization', 'Content-Type', 'Accept', 'cf-ray'];

function forwardToApi(request: Request, url: URL, env: AdminWorkerEnv) {
  const target = new URL(url);
  target.pathname = `/admin${url.pathname.slice('/api'.length)}`;
  const headers = new Headers();
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return env.API.fetch(new Request(new Request(target, request), { headers, redirect: 'manual' }));
}

function withSecurityHeaders(response: Response) {
  const secured = new Response(response.body, response);
  secured.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  secured.headers.set('X-Frame-Options', 'DENY');
  secured.headers.set('Referrer-Policy', 'no-referrer');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  return secured;
}

export default {
  async fetch(request, env) {
    if (!(await passedAccess(request, env))) {
      return withSecurityHeaders(new Response('Forbidden', { status: 403 }));
    }
    const url = new URL(request.url);
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    const response = isApi
      ? await forwardToApi(request, url, env)
      : await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  },
} satisfies ExportedHandler<AdminWorkerEnv>;
