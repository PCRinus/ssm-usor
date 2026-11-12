import { apiErrorResponseSchema } from '@ssm-usor/contracts';

export const errorContent = {
  'application/json': { schema: apiErrorResponseSchema.meta({ id: 'ApiErrorResponse' }) },
};

export const publicErrors = {
  500: { description: 'Unexpected API error', content: errorContent },
} as const;

export const authErrors = {
  401: { description: 'A valid user access token is required', content: errorContent },
  503: { description: 'A dependency is temporarily unavailable', content: errorContent },
  500: { description: 'Unexpected API error', content: errorContent },
} as const;

export const membershipErrors = {
  ...authErrors,
  403: { description: 'The account is not a member of an organization', content: errorContent },
} as const;

export const ownerErrors = {
  ...authErrors,
  403: { description: 'The account is not an owner of an organization', content: errorContent },
} as const;

const impersonationRefused =
  'or is a platform admin impersonating a member, who neither signs nor sends an email or SMS in their name (reason `impersonation_refused`)';

export const inPersonMembershipErrors = {
  ...authErrors,
  403: {
    description: `The account is not a member of an organization, ${impersonationRefused}`,
    content: errorContent,
  },
} as const;

export const inPersonOwnerErrors = {
  ...authErrors,
  403: {
    description: `The account is not an owner of an organization, ${impersonationRefused}`,
    content: errorContent,
  },
} as const;

export const bearerSecurity = [{ bearerAuth: [] }];

const identityChanged =
  'the `X-Acting-As` header names someone other than whom the request acts as now (reason `identity_changed`)';

interface Operation {
  security?: Record<string, unknown>[];
  responses?: Record<string, { description: string; content?: unknown }>;
}

function withIdentityConflict(operation: Operation): Operation {
  if (!operation.responses || !operation.security?.some((scheme) => 'bearerAuth' in scheme)) {
    return operation;
  }
  const own = operation.responses['409'];
  return {
    ...operation,
    responses: {
      ...operation.responses,
      409: own
        ? { ...own, description: `${own.description}; or ${identityChanged}` }
        : {
            description: identityChanged.charAt(0).toUpperCase() + identityChanged.slice(1),
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } },
            },
          },
    },
  };
}

// Every route behind requireAuth answers it, beside whatever its own 409 says, so it is added
// to the document rather than to each route's responses, where a route's own 409 replaces it.
export function documentIdentityConflict<Document extends { paths?: object }>(
  document: Document
): Document {
  const paths = Object.entries(document.paths ?? {}).map(([path, item]) => [
    path,
    Object.fromEntries(
      Object.entries(item as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === 'object' && value !== null && 'responses' in value
          ? withIdentityConflict(value as Operation)
          : value,
      ])
    ),
  ]);
  return { ...document, paths: Object.fromEntries(paths) };
}

export const openApiConfig = {
  openapi: '3.0.3',
  info: { title: 'SSM Ușor API', version: '0.3.0' },
};
