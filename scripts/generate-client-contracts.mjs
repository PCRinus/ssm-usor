import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const clients = {
  app: 'apps/app/src/api/generated/api.ts',
  portal: 'apps/portal/src/api/generated/api.ts',
};

const fingerprint = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);

const entries = Object.entries(clients)
  .map(([client, path]) => `  ${client}: '${fingerprint(path)}',`)
  .join('\n');

writeFileSync(
  'packages/contracts/src/client-contracts.gen.ts',
  `// Written by \`pnpm generate:api\` from the generated clients (ADR 040).
export const clientContractFingerprints = {
${entries}
} as const;
`
);
