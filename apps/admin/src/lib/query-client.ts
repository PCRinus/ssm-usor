import { createQueryClientDefaults } from '@ssm-usor/spa-runtime/query-client';
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({ defaultOptions: createQueryClientDefaults() });
}
