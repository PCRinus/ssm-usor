interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetsBinding;
  SEARCH_INDEXING?: string;
}

function robotsTxt(indexable: boolean, origin: string): string {
  return indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap-index.xml\n`
    : 'User-agent: *\nDisallow: /\n';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice('www.'.length);
      url.protocol = 'https:';
      return Response.redirect(url, 308);
    }

    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url, 308);
    }

    // Only a deployment that opts in is indexed, so non-prod and previews stay out of search.
    const indexable = env.SEARCH_INDEXING === 'allow';

    if (url.pathname === '/robots.txt') {
      return new Response(robotsTxt(indexable, url.origin), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const response = new Response(assetResponse.body, assetResponse);

    // Static assets serve .txt as bare text/plain, and llms.txt is Romanian.
    if (response.headers.get('content-type') === 'text/plain') {
      response.headers.set('content-type', 'text/plain; charset=utf-8');
    }

    if (!indexable) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    return response;
  },
};
