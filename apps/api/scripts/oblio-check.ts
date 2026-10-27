import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { createOblioClient } from '../src/modules/billing/oblio';
import { proformaSeries, toOblioDocument } from '../src/modules/billing/oblio-documents';

//   OBLIO_CLIENT_ID=... OBLIO_CLIENT_SECRET="$(pbpaste)" pnpm --filter @ssm-usor/api oblio:check
//   --proforma   also issues one test proforma in series TEST, to the fixed test client
// It never issues an invoice: an invoice is a fiscal document the moment Oblio numbers it.

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { proforma: { type: 'boolean', default: false } },
});

try {
  const clientId = process.env.OBLIO_CLIENT_ID;
  const clientSecret = process.env.OBLIO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Set OBLIO_CLIENT_ID and OBLIO_CLIENT_SECRET.');

  const oblio = createOblioClient({ clientId, clientSecret });
  const companies = await oblio.companies();
  console.log(`Logged in as ${clientId}. Companies:`);
  for (const company of companies) console.log(`  ${company.company} (${company.cif})`);

  const series = await oblio.series();
  console.log('Series:');
  for (const entry of series) {
    const marker = entry.default ? ', default' : '';
    console.log(`  ${entry.type} ${entry.name}, next ${entry.next}${marker}`);
  }

  if (values.proforma) {
    if (!series.some((entry) => entry.type === 'Proforma' && entry.name === proformaSeries)) {
      throw new Error(`The account has no proforma series ${proformaSeries}; nothing was issued.`);
    }
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const request = toOblioDocument(
      'proforma',
      {
        name: 'Verificare Oblio',
        cui: '',
        registryNumber: null,
        countyCode: null,
        locality: null,
        addressLine: null,
        vatPayer: false,
        recipientEmail: '',
      },
      {
        id: `oblio-check-${now.getTime()}`,
        lines: [
          {
            description: 'SSM Ușor Start, abonament lunar',
            unitAmount: 3900,
            quantity: 1,
            period: { start: now, end: periodEnd },
          },
        ],
        total: 4719,
        paymentReference: 'oblio-check',
        paidAt: now,
      }
    );
    if (request.kind !== 'proforma') throw new Error('Refusing to issue anything but a proforma.');
    const proforma = await oblio.createProforma(request.payload);
    console.log(`Issued proforma ${proforma.seriesName} ${proforma.number}: ${proforma.link}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
