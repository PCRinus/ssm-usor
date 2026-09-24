import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderDocument } from '../src/render';

// The PDFs land in `originals/preview/`, which git ignores. Two sample clients: one person in
// every role and short names, then three people and names long enough to test the layout.

const root = fileURLToPath(new URL('..', import.meta.url));
// preview [templates-dir] [output-dir], both relative to the package.
const [templatesArgument = 'templates', outputArgument = 'originals/preview'] =
  process.argv.slice(2);
const templates = `${root}${templatesArgument}/`;
const output = `${root}${outputArgument}/`;

const person = (name: string, jobTitle: string) => ({ name, jobTitle });
const described = (people: { name: string; jobTitle: string }[]) =>
  people.map(({ name, jobTitle }) => `${name} având funcția de ${jobTitle}`).join(', ');

function sample(
  label: string,
  legalName: string,
  representativeName: string,
  people: ReturnType<typeof person>[]
) {
  return {
    label,
    data: {
      branding: [{}],
      decisionNumber: 1,
      issueDate: '19.01.2026',
      issueYear: '2026',
      unitRisks: [
        {
          risk: 'Cădere de la același nivel pe pardoseală alunecoasă.',
          measure:
            'Întreținerea curățeniei în spațiile de lucru și purtarea de încălțăminte adecvată.',
        },
        {
          risk: 'Electrocutare prin atingere directă sau indirectă.',
          measure: 'Verificări PRAM anuale și verificarea vizuală a integrității cablurilor.',
        },
      ],
      followingYear: '2027',
      positions: [
        {
          name: 'Manager magazin',
          activities: 'Conduce magazinul și ține legătura cu furnizorii.',
          staffCategory: 'Tehnic-administrativ',
          workZone: 'Birou',
          workZoneLine: [{}],
          equipment: [],
        },
        {
          name: 'Sudor',
          activities: 'Sudură electrică și autogenă în atelier și pe șantier.',
          staffCategory: 'Execuție',
          workZone: 'Atelier',
          workZoneLine: [{}],
          equipment: Array.from({ length: 30 }, (_, index) => ({
            risk: `Risc ${index + 1}: înțepături, tăieturi, zgârieturi (mâini, brațe)`,
            item: `Articol ${index + 1}`,
            quantityLabel: '1 buc. / 12 luni',
            allocationLabel: 'Inventar personal',
          })),
        },
        ...people.map(({ jobTitle }, index) => ({
          name: jobTitle,
          activities:
            index === 0 ? '—' : 'Montaj și întreținere de instalații criogenice pe șantier.',
          staffCategory: index === 0 ? 'Tehnic-administrativ' : 'Execuție',
          workZone: index === 0 ? '' : 'Atelier, șantier temporar',
          workZoneLine: index === 0 ? [] : [{}],
          equipment: [
            {
              risk: 'Lovituri, impact, cădere de obiecte de la înălțime (craniu)',
              item: 'Cască de protecție',
              quantityLabel: '1 buc. / 24 luni',
              allocationLabel: 'Inventar personal',
            },
            {
              risk: 'Înțepături, tăieturi, zgârieturi (mâini, brațe)',
              item: 'Mănuși împotriva agresiunilor mecanice',
              quantityLabel: '2 buc. / 6 luni',
              allocationLabel: 'Inventar personal',
            },
            {
              risk: 'Radiații, împroșcare (față, ochi)',
              item: 'Mască de sudură',
              quantityLabel: '1 buc. / 24 luni',
              allocationLabel: 'Inventar de secție',
            },
            {
              risk: 'Pulberi, fibre',
              item: 'Mască de unică folosință FFP2',
              quantityLabel: '20 buc.',
              allocationLabel: 'Consum',
            },
          ],
        })),
      ],
      get equippedPositions() {
        return this.positions.filter((position) => position.equipment.length > 0);
      },
      client: { legalName, representativeName, representativeRole: 'Administrator' },
      provider: {
        legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
        representativeName: 'Ana IONESCU',
        representativeRole: 'Administrator',
      },
      specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
      workplaceManagers: people,
      workplaceManager: people[0],
      firstAiders: people,
      firstAiderNames: people.map(({ name }) => name).join(', '),
      evaluationTeam: people,
      imminentDanger: people,
      imminentDangerText: described(people),
      workersRepresentativeDecision: [{}],
      workersRepresentatives: people,
      workersRepresentativesLead: people.length === 1 ? 'următorul angajat' : 'următorii angajați',
      training: {
        periodicDuration: '2 ore',
        intervalPhrase: 'următoarele intervale de timp',
        administrative: [{}],
        worker: [{}],
        administrativeFrequency: 'SEMESTRIAL',
        administrativeMonths: 'februarie, august',
        workerFrequency: 'TRIMESTRIAL',
        workerMonths: 'februarie, mai, august, noiembrie',
        dayFrom: 2,
        dayTo: 7,
      },
    },
  };
}

const samples = [
  sample('short', 'S.C. PIPETECH S.R.L.', 'Florin Cristian TALOȘ', [
    person('Florin Cristian TALOȘ', 'Administrator'),
  ]),
  sample(
    'long',
    'S.C. INSTALAȚII TERMICE ȘI SANITARE BANAT CONSTRUCT S.R.L.',
    'Alexandra-Ioana CONSTANTINESCU-MUNTEANU',
    [
      person('Alexandra-Ioana CONSTANTINESCU-MUNTEANU', 'Administrator'),
      person('Mihai POPESCU', 'Operator montaj linii automate'),
      person('Elena DUMITRU', 'Conducător antrepriză construcții-montaj'),
    ]
  ),
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const name of readdirSync(templates).filter((file) => file.endsWith('.docx'))) {
  const template = new Uint8Array(readFileSync(`${templates}${name}`));
  for (const { label, data } of samples) {
    writeFileSync(
      `${output}${name.replace(/\.docx$/, '')}.${label}.docx`,
      renderDocument(template, data)
    );
  }
}

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    '-v',
    `${output}:/work`,
    'gotenberg/gotenberg:8',
    '-c',
    'cd /work && soffice --headless --convert-to pdf --outdir /work *.docx >/dev/null 2>&1',
  ],
  { stdio: 'inherit' }
);
for (const file of readdirSync(output)
  .filter((name) => name.endsWith('.pdf'))
  .sort()) {
  const pages = readFileSync(`${output}${file}`)
    .toString('latin1')
    .match(/\/Type\s*\/Page[^s]/g)?.length;
  console.log(`${file}: ${pages} pages`);
}
