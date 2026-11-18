import { clientContract, clientContractHeader, type ContractClient } from '@ssm-usor/contracts';

import { createApp } from '../app';
import type { ApiEnv } from '../lib/env';
import { testEnv } from './upstream';

export const testAccessToken = 'test-access-token';

export type ApiRequestInit = Omit<RequestInit, 'body'> & {
  body?: unknown;
  token?: string | null;
  client?: ContractClient | null;
  app?: Pick<ReturnType<typeof createApp>, 'request'>;
};

const isBodyInit = (body: unknown) =>
  typeof body === 'string' ||
  body instanceof Blob ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body) ||
  body instanceof FormData ||
  body instanceof URLSearchParams ||
  body instanceof ReadableStream;

export function apiRequest(
  path: string,
  {
    body,
    token = testAccessToken,
    client = 'app',
    app = createApp(),
    headers,
    ...init
  }: ApiRequestInit = {},
  bindings: Partial<ApiEnv['Bindings']> = testEnv()
) {
  const json = body !== undefined && !isBodyInit(body);
  const merged = new Headers({
    ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    ...(client === null ? {} : { [clientContractHeader]: clientContract(client) }),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });
  new Headers(headers).forEach((value, name) => merged.set(name, value));
  return app.request(
    path,
    { ...init, headers: merged, body: json ? JSON.stringify(body) : (body as BodyInit) },
    bindings
  );
}
