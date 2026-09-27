import { createRoute, z } from '@hono/zod-openapi';

import { requestFetch, supabaseConfig } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { publicErrors } from '../../lib/openapi';
import { createRouter } from '../../router';

export const fileDownloadRoute = createRoute({
  method: 'get',
  path: '/files/download',
  operationId: 'downloadFile',
  summary: 'Save a file from a signed Storage link under its own name',
  description:
    'Opened by the browser, not fetched: the answer is an attachment, which a mobile browser hands to its download manager. The signed link authorizes the read and expires on its own.',
  request: {
    query: z.object({
      source: z.url(),
      name: z.string().trim().min(1).max(200),
    }),
  },
  responses: {
    200: {
      description: 'The file, as an attachment',
      content: { 'application/octet-stream': { schema: z.string().meta({ format: 'binary' }) } },
    },
    ...publicErrors,
  },
});

// Storage names the file itself, but percent-encodes it in the plain `filename`, which is the
// one browsers use there: "Copertă" is saved as "Copert%C4%83". So the bytes come through
// here, under a header that gives an ASCII name and the real one (RFC 6266 / RFC 8187).
export const filesRouter = createRouter().openapi(fileDownloadRoute, async (c) => {
  const { source, name } = c.req.valid('query');
  const link = new URL(source);
  // Only a signed read from our own Storage: anything else would make this an open proxy.
  if (
    link.origin !== new URL(supabaseConfig(c).SUPABASE_URL).origin ||
    !link.pathname.startsWith('/storage/v1/object/sign/')
  ) {
    throw new ApiError('validation_error', 'The link is not a file of this application.');
  }
  const upstream = await requestFetch(c, 20_000)(link).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    // An expired signed link is the usual reason: the page asks for a new one on the next try.
    throw new ApiError('not_found', 'The download link has expired. Try again.');
  }
  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': attachment(name),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

export function attachment(name: string) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
