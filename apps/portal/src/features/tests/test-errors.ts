import type { ApiErrorResponse } from '@ssm-usor/contracts';

import { ApiHttpError } from '@/api/http';

export const reasonOf = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? ((cause.body as Partial<ApiErrorResponse> | null)?.reason ?? null)
    : null;
