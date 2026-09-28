import { createRoute, z } from '@hono/zod-openapi';

import { contentDisposition } from '../../lib/content-disposition';
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
      // `inline` shows a PDF in the browser's viewer, which can save it: the in-app browser
      // of Gmail on Android (a Firefox custom tab) cannot download an attachment at all.
      disposition: z.enum(['attachment', 'inline']).default('attachment'),
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

// Storage names the file itself, but not in a way browsers read correctly, so the bytes come
// through here under our own header.
export const filesRouter = createRouter().openapi(fileDownloadRoute, async (c) => {
  const { source, name, disposition } = c.req.valid('query');
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
  const type = upstream.headers.get('Content-Type') ?? 'application/octet-stream';
  // Only a PDF is ever shown: any other type rendered from the API's origin could run there.
  const shown = disposition === 'inline' && type.split(';')[0]!.trim() === 'application/pdf';
  return new Response(upstream.body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': contentDisposition(shown ? 'inline' : 'attachment', name),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
