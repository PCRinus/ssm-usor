import type { UpdateFeature } from '@ssm-usor/contracts';

import type { Database } from '../../src/database.types';
import type { SeedClient } from './seed-organization';

type ReleaseInsert = Database['public']['Tables']['releases']['Insert'];

interface InventedUpdate {
  headline: string;
  lead: string;
  features: UpdateFeature[];
  improvements: string[];
  fixes: string[];
}

const day = 24 * 60 * 60 * 1000;

const testsUpdate: InventedUpdate = {
  headline: 'Teste de verificare, direct din portal',
  lead: 'Dai un test angajaților unui client, ei răspund de pe telefon, iar rezultatul intră singur în fișa individuală de instruire. Pe lângă asta, lista de angajați arată cine e la zi și câteva lucruri care te încurcau au fost reparate.',
  features: [
    {
      title: 'Teste compuse din banca de întrebări',
      text: 'Pornești un test din pagina clientului: alegi tematica, câte întrebări intră și de la ce punctaj se consideră promovat. Întrebările se amestecă pentru fiecare angajat, ca să nu poată copia unul de la altul.',
      where: 'Client, fila Instruiri, butonul Test nou',
      icon: 'clipboard-check',
    },
    {
      title: 'Angajații răspund de pe telefon',
      text: 'Fiecare angajat primește un cod pe e-mail sau SMS și intră în portal fără cont. Vezi în timp real cine a terminat și cine încă nu a deschis testul.',
      where: 'Client, fila Instruiri, testul trimis',
      icon: 'smartphone',
    },
    {
      title: 'Rezultatul ajunge în fișa individuală',
      text: 'Când emiți fișa individuală de instruire după un test, rubrica de verificare se completează cu punctajul și data. Dacă angajatul nu a promovat, fișa nu se poate emite până nu reia testul.',
      where: 'Angajat, fila Documente',
      icon: 'file-check',
    },
  ],
  improvements: [
    'Lista de angajați arată cine e la zi cu instruirea și are un filtru „La zi”.',
    'Numărul de telefon se introduce cu prefixul țării, iar formatul se verifică pe loc.',
    'Arhiva cu documentele unui client se descarcă acum și din Chrome pe Android.',
    'Banca de întrebări se poate filtra după tematică și după cine a scris întrebarea.',
  ],
  fixes: [
    'Data de pe PDF nu mai iese cu o zi în urmă când emiți un document după miezul nopții.',
    'În editorul de documente, butonul Salvează nu mai rămâne inactiv după o eroare de conexiune.',
    'Lista de clienți sortează corect numele care încep cu diacritice, cum ar fi Ștefan sau Țară.',
  ],
};

const remindersUpdate: InventedUpdate = {
  headline: 'Reamintiri pentru semnăturile restante',
  lead: 'Participanții care n-au semnat după trei zile primesc o reamintire pe e-mail sau SMS. Tu alegi, pe fiecare client, dacă pleacă singure.',
  features: [
    {
      title: 'Reamintiri automate pentru semnături',
      text: 'După trei zile fără semnătură, participantul primește o reamintire pe canalul pe care a fost invitat. Se pornesc și se opresc pe fiecare client.',
      where: 'Client, fila Portal',
      icon: 'bell-ring',
    },
  ],
  improvements: [
    'Pagina Semnături arată de când așteaptă fiecare cerere.',
    'Codul de conectare în portal se poate retrimite din aceeași pagină.',
  ],
  fixes: [
    'Cererea de semnătură nu se mai trimite de două ori când apeși butonul rapid de două ori.',
    'Numele cu cratimă apar întregi pe fișa semnată.',
  ],
};

const archiveUpdate: InventedUpdate = {
  headline: 'Arhiva documentelor include din nou anexele IPSSM',
  lead: 'Arhiva cu tot setul de documente al unui client omitea anexele la instrucțiunile proprii. Acum le conține, la versiunea citată.',
  features: [],
  improvements: [],
  fixes: [
    'Arhiva setului de documente conține anexele instrucțiunilor proprii, la versiunea citată.',
    'Descărcarea arhivei nu se mai oprește la clienții cu peste 50 de documente.',
    'Data emiterii de pe coperta setului e cea a ultimei emiteri, nu a generării.',
  ],
};

const firstUpdate: InventedUpdate = {
  headline: 'Prima versiune publică',
  lead: 'SSM Ușor se deschide pentru primii clienți: documentația SSM și PSI, semnătura electronică avansată și portalul participanților.',
  features: [
    {
      title: 'Documentația SSM și PSI, generată din datele clientului',
      text: 'Cele 23 de documente ale celor două seturi se generează din posturi, angajați și instruiri, și se emit ca PDF.',
      where: 'Client, fila Documente',
      icon: 'files',
    },
    {
      title: 'Semnătură electronică avansată',
      text: 'Fișele individuale se semnează din portal, cu certificat per participant, fără hârtie.',
      where: 'Semnături',
      icon: 'pen-line',
    },
  ],
  improvements: [],
  fixes: [],
};

const inventedUpdates = [testsUpdate, remindersUpdate, archiveUpdate, firstUpdate];

/** The update in the dialect of ADR 026, up to where the horizontal rule would be. */
export function updateBody(update: InventedUpdate): string {
  const blocks = [`# ${update.headline}\n${update.lead}`];
  if (update.features.length > 0) {
    const features = update.features.map((feature) =>
      [
        `### ${feature.title}`,
        feature.text,
        ...(feature.where ? [`Unde o găsești: ${feature.where}`] : []),
        ...(feature.icon ? [`Pictogramă: ${feature.icon}`] : []),
      ].join('\n')
    );
    blocks.push(['## Ce e nou', ...features].join('\n'));
  }
  if (update.improvements.length > 0) {
    blocks.push(['## Îmbunătățiri', ...update.improvements.map((line) => `- ${line}`)].join('\n'));
  }
  if (update.fixes.length > 0) {
    blocks.push(['## Remedieri', ...update.fixes.map((line) => `- ${line}`)].join('\n'));
  }
  return `${blocks.join('\n\n')}\n`;
}

export function bucharestTag(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}.${part('month')}.${part('day')}`;
}

export function inventedReleases(now: Date): ReleaseInsert[] {
  const today = bucharestTag(now);
  const releases: [string, Date, InventedUpdate][] = [
    [`${today}.2`, now, testsUpdate],
    [today, new Date(now.getTime() - 10_000), remindersUpdate],
    [
      bucharestTag(new Date(now.getTime() - 3 * day)),
      new Date(now.getTime() - 3 * day),
      archiveUpdate,
    ],
    [
      bucharestTag(new Date(now.getTime() - 14 * day)),
      new Date(now.getTime() - 14 * day),
      firstUpdate,
    ],
  ];
  return releases.map(([tag, publishedAt, update]) => ({
    tag,
    published_at: publishedAt.toISOString(),
    headline: update.headline,
    lead: update.lead,
    features: update.features as unknown as ReleaseInsert['features'],
    improvements: update.improvements,
    fixes: update.fixes,
    body: updateBody(update),
  }));
}

// The admin's profile is made older than every invented release and set to have read up to the
// one three days ago, so each run leaves exactly the two of today unread, however old the account.
export async function seedReleases(db: SeedClient, adminUserId: string, now = new Date()) {
  const rows = inventedReleases(now);
  const tags = rows.map((row) => row.tag);

  // Invented releases of earlier days would also be unread; real ones never share a body.
  const earlier = await db
    .from('releases')
    .select('tag, body')
    .in(
      'headline',
      inventedUpdates.map((update) => update.headline)
    );
  if (earlier.error) throw new Error(`Could not read the releases: ${earlier.error.message}`);
  const bodies = new Set(rows.map((row) => row.body));
  const stale = earlier.data
    .filter((row) => bodies.has(row.body) && !tags.includes(row.tag))
    .map((row) => row.tag);
  if (stale.length > 0) {
    const removed = await db.from('releases').delete().in('tag', stale);
    if (removed.error) {
      throw new Error(`Could not remove earlier invented releases: ${removed.error.message}`);
    }
  }

  const upserted = await db.from('releases').upsert(rows, { onConflict: 'tag' });
  if (upserted.error) throw new Error(`Could not seed the releases: ${upserted.error.message}`);

  const profile = await db
    .from('profiles')
    .select('created_at')
    .eq('user_id', adminUserId)
    .single();
  if (profile.error) throw new Error(`Could not read the admin profile: ${profile.error.message}`);
  const oldest = new Date(now.getTime() - 15 * day);
  const updated = await db
    .from('profiles')
    .update({
      releases_acknowledged_through: rows[2]!.tag,
      ...(new Date(profile.data.created_at) > oldest ? { created_at: oldest.toISOString() } : {}),
    })
    .eq('user_id', adminUserId);
  if (updated.error) {
    throw new Error(`Could not set the admin's read releases: ${updated.error.message}`);
  }

  return { releases: rows.length, removed: stale.length, unread: tags.slice(0, 2) };
}
