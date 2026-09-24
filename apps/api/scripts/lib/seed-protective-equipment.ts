import type { Database } from '../../src/database.types';
import { officeJobTitles } from './seed-employees';
import type { SeedClient } from './seed-organization';

type EntryInsert = Database['public']['Tables']['job_position_equipment']['Insert'];
type Entry = Pick<EntryInsert, 'risk' | 'item' | 'quantity' | 'duration_months' | 'allocation'>;

const inventory = (risk: string, item: string, months: number, quantity = 1): Entry => ({
  risk,
  item,
  quantity,
  duration_months: months,
  allocation: 'personal_inventory',
});
const shared = (risk: string, item: string, months: number): Entry => ({
  risk,
  item,
  quantity: 1,
  duration_months: months,
  allocation: 'section_inventory',
});
const consumable = (risk: string, item: string, quantity = 1): Entry => ({
  risk,
  item,
  quantity,
  duration_months: null,
  allocation: 'consumable',
});

const boots = inventory('Lovituri, strivire (picioare)', 'Bocanci cu bombeu', 12);
const overalls = inventory('Înțepături, tăieturi, zgârieturi (corp)', 'Salopetă de lucru', 12);
const gloves = inventory(
  'Înțepături, tăieturi, zgârieturi (mâini)',
  'Mănuși de protecție mecanică',
  6,
  2
);
const helmet = inventory(
  'Lovituri, cădere de obiecte de la înălțime (craniu)',
  'Cască de protecție',
  24
);
const vest = inventory('Șoc, lovire de către vehicule', 'Vestă reflectorizantă', 12);
const goggles = inventory('Împroșcare, stropire (față, ochi)', 'Ochelari de protecție', 12);

const equipmentByTitle: Record<string, Entry[]> = {
  Sudor: [
    shared('Radiații, împroșcare (față, ochi)', 'Mască de sudură', 24),
    inventory('Căldură, foc (mâini)', 'Mănuși de sudor', 3, 2),
    inventory('Căldură, foc (corp)', 'Șorț din piele', 12),
    boots,
  ],
  Electrician: [
    inventory('Electrocutare (mâini)', 'Mănuși electroizolante', 12),
    inventory('Electrocutare (picioare)', 'Încălțăminte electroizolantă', 12),
    overalls,
  ],
  'Lăcătuș mecanic': [gloves, goggles, overalls, boots],
  Șofer: [vest, consumable('Frig, intemperii', 'Mănuși de iarnă')],
  'Operator producție': [gloves, overalls, boots, consumable('Zgomot', 'Antifoane interne', 10)],
  'Manipulant mărfuri': [gloves, boots, vest],
  Gestionar: [gloves, vest],
  Vânzător: [consumable('Agenți biologici', 'Mănuși de unică folosință', 100)],
  Ospătar: [inventory('Alunecare, cădere la același nivel', 'Încălțăminte antiderapantă', 12)],
  Bucătar: [
    inventory('Căldură, foc (mâini)', 'Mănuși termoizolante', 6),
    inventory('Alunecare, cădere la același nivel', 'Încălțăminte antiderapantă', 12),
    inventory('Împroșcare, stropire (corp)', 'Șorț de bucătărie', 6, 2),
  ],
  'Agent curățenie': [
    consumable('Substanțe chimice (mâini)', 'Mănuși de menaj', 10),
    inventory('Alunecare, cădere la același nivel', 'Încălțăminte antiderapantă', 12),
  ],
  'Muncitor necalificat': [gloves, overalls, boots, helmet],
  Zidar: [gloves, overalls, boots, helmet, goggles],
  Instalator: [gloves, overalls, boots, helmet],
};

export function equipmentFor(jobTitle: string): Entry[] | 'none' | null {
  if (equipmentByTitle[jobTitle]) return equipmentByTitle[jobTitle];
  return officeJobTitles.includes(jobTitle) ? 'none' : null;
}

// Only positions still undecided are touched, so a rerun leaves alone what was entered or
// decided by hand.
export async function seedProtectiveEquipment(
  db: SeedClient,
  organizationId: string,
  createdBy: string
) {
  const positions = await db
    .from('job_positions')
    .select('id, client_id, name')
    .eq('organization_id', organizationId)
    .is('needs_protective_equipment', null)
    .is('archived_at', null);
  if (positions.error) {
    throw new Error(`Could not read job positions: ${positions.error.message}`);
  }
  const rows: EntryInsert[] = [];
  const needNone: string[] = [];
  for (const position of positions.data) {
    const equipment = equipmentFor(position.name);
    if (equipment === 'none') needNone.push(position.id);
    if (!equipment || equipment === 'none') continue;
    for (const entry of equipment) {
      rows.push({
        ...entry,
        organization_id: organizationId,
        client_id: position.client_id,
        job_position_id: position.id,
        created_by: createdBy,
      });
    }
  }
  if (rows.length > 0) {
    const { error } = await db.from('job_position_equipment').insert(rows);
    if (error) throw new Error(`Could not seed equipment entries: ${error.message}`);
  }
  if (needNone.length > 0) {
    const { error } = await db
      .from('job_positions')
      .update({ needs_protective_equipment: false })
      .in('id', needNone);
    if (error) throw new Error(`Could not decide seeded job positions: ${error.message}`);
  }
  return { entries: rows.length, decided: needNone.length };
}
