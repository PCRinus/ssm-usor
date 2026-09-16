import { writeFile } from 'node:fs/promises';

import { createApp } from '../src/app';
import { openApiConfig } from '../src/openapi';

// No server, credentials, or network requests are needed to generate the contract.
const document = createApp().getOpenAPIDocument(openApiConfig);
await writeFile(
  new URL('../openapi.json', import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`
);
