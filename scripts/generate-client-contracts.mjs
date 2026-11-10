import { writeFileSync } from 'node:fs';

import { clientContractFingerprint } from './client-contract-fingerprint.mjs';

const clients = {
  app: 'apps/app/src/api/generated/api.ts',
  portal: 'apps/portal/src/api/generated/api.ts',
};

const entries = Object.entries(clients)
  .map(([client, path]) => `  ${client}: '${clientContractFingerprint(path)}',`)
  .join('\n');

writeFileSync(
  'packages/contracts/src/client-contracts.gen.ts',
  `// Written by \`pnpm generate:api\` from the generated clients (ADR 040).
export const clientContractFingerprints = {
${entries}
} as const;
`
);
