import { apiErrorResponseSchema } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { apiRequest } from '../../test/request';
import { fetchMock, mockUpstream, stubFetch } from '../../test/upstream';

stubFetch();

const documentId = '7a3b0c0e-6d1f-4d55-9a8e-3f0f2b9c1d11';
const clientId = '2c9d8e1f-4b3a-4f6e-8d7c-1a2b3c4d5e6f';
const limit = 15 * 1024 * 1024;

const routes = [
  ['PUT', `/documents/${documentId}/draft/file`],
  ['POST', `/documents/${documentId}/print`],
  ['PUT', `/documents/${documentId}/signed-copy`],
  ['POST', `/clients/${clientId}/documents/decision_first_aid/upload`],
];

const streamOf = (size: number) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const chunk = new Uint8Array(1024 * 1024);
      for (let sent = 0; sent < size; sent += chunk.length) {
        controller.enqueue(chunk.subarray(0, Math.min(chunk.length, size - sent)));
      }
      controller.close();
    },
  });

const signInOnly = ['/auth/v1/user', '/rest/v1/rpc/current_membership'];

const refusedAsTooLarge = async (response: Response) => {
  expect(response.status).toBe(400);
  expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
    error: 'validation_error',
    message: 'The file is larger than 15 MB.',
  });
  const reached = fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);
  expect(reached.filter((path) => !signInOnly.includes(path))).toEqual([]);
};

describe('a document file past 15 MB', () => {
  it.each(routes)('is refused by its declared length at %s %s', async (method, path) => {
    mockUpstream();
    await refusedAsTooLarge(
      await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': `${limit + 1}` },
        body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      })
    );
  });

  it.each(routes)(
    'is refused while it streams in without a length at %s %s',
    async (method, path) => {
      mockUpstream();
      await refusedAsTooLarge(
        await apiRequest(path, {
          method,
          headers: { 'Content-Type': 'application/octet-stream' },
          body: streamOf(limit + 1),
          duplex: 'half',
        } as RequestInit)
      );
    }
  );
});
