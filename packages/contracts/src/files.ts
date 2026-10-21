import { z } from 'zod';

// Opened by the browser from a real anchor through `GET /files/download`: the signed link
// authorizes the read on its own, so the anchor needs no bearer token.
export const fileLinkResponseSchema = z.object({
  url: z.url(),
  fileName: z.string(),
  expiresInSeconds: z.int(),
});

export type FileLinkResponse = z.infer<typeof fileLinkResponseSchema>;
