// Makes the app's signing authority (ADR 023): a P-256 CA key, its self-signed certificate
// ("SSM Ușor Signing CA", ten years) and the key that encrypts signers' private keys. Prints the
// three lines for apps/api/.dev.vars; for a deployment, the same values go into the GitHub
// environment's secrets. Nothing is written to disk.
//
//   pnpm --filter @ssm-usor/api signing:ca
//
// Replacing a deployment's values leaves the signatures already made as they are, each carrying
// its certificate; every identity is then reissued at its next signature.
import { generateSigningCa } from '../src/lib/signing-ca';

const secrets = await generateSigningCa();

const oneLine = (value: string) => value.trim().replace(/\r?\n/g, '\\n');

for (const [name, value] of Object.entries(secrets)) {
  console.log(`${name}="${oneLine(value)}"`);
}
