import { z } from 'zod';

/**
 * A signed link to a stored file, for the page to put on a real anchor that opens it through
 * `GET /files/download`; the link authorizes the read by itself and expires on its own.
 */
export const fileLinkResponseSchema = z.object({
  url: z.url(),
  fileName: z.string(),
  expiresInSeconds: z.int(),
});

export type FileLinkResponse = z.infer<typeof fileLinkResponseSchema>;
