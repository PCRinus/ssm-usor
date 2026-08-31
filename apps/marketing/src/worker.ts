interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetsBinding;
  BASIC_AUTH_PASSWORD: string;
  BASIC_AUTH_USERNAME: string;
}

const encoder = new TextEncoder();

const unauthorized = () =>
  new Response('Authentication required.', {
    status: 401,
    headers: {
      'Cache-Control': 'private, no-store',
      'WWW-Authenticate': 'Basic realm="SSM Usor design preview", charset="UTF-8"',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });

const digest = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

const credentialsMatch = async (actual: string, expected: string) => {
  const [actualDigest, expectedDigest] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;

  for (let index = 0; index < actualDigest.length; index += 1) {
    difference |= actualDigest[index] ^ expectedDigest[index];
  }

  return difference === 0;
};

const decodeCredentials = (authorization: string | null) => {
  const match = authorization?.match(/^Basic\s+(.+)$/i);

  if (!match) {
    return null;
  }

  try {
    const bytes = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.BASIC_AUTH_USERNAME || !env.BASIC_AUTH_PASSWORD) {
      return new Response('Preview authentication is not configured.', {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
        },
      });
    }

    const actualCredentials = decodeCredentials(request.headers.get('Authorization'));
    const expectedCredentials = `${env.BASIC_AUTH_USERNAME}:${env.BASIC_AUTH_PASSWORD}`;

    if (!actualCredentials || !(await credentialsMatch(actualCredentials, expectedCredentials))) {
      return unauthorized();
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const protectedResponse = new Response(assetResponse.body, assetResponse);

    protectedResponse.headers.set('Cache-Control', 'private, no-store');
    protectedResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

    return protectedResponse;
  },
};
