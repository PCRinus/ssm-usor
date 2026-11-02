import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { type InstructionBody, instructionBodySchema, textHash } from '@ssm-usor/contracts';

import type { Database } from '../../src/database.types';
import { officeJobTitles } from './seed-employees';
import type { SeedClient } from './seed-organization';

type Group = Database['public']['Enums']['instruction_module_group'];
type Domain = Database['public']['Enums']['instruction_domain'];
type Fixture = { title: string; group: Group; domain: Domain; body: InstructionBody };

const fixturesFile = path.join(
  import.meta.dirname,
  '..',
  'fixtures',
  'instruction-modules',
  'modules.json'
);

const modulesByTitle: Record<string, string[]> = {
  Electrician: ['Scări metalice'],
  Instalator: ['Scări metalice'],
  Zidar: ['Scări metalice'],
  'Muncitor necalificat': ['Scări metalice'],
  'Agent curățenie': ['Activități de curățenie'],
  Gestionar: ['Activități de birou'],
};

const fireModulesByTitle: Record<string, string[]> = {
  Sudor: ['Lucrul cu foc deschis'],
  'Lăcătuș mecanic': ['Lucrul cu foc deschis'],
  Instalator: ['Lucrul cu foc deschis'],
};

/** Which fixture modules a seeded position applies; office posts apply the office module. */
export function instructionsFor(jobTitle: string): string[] | 'none' | null {
  if (modulesByTitle[jobTitle]) return modulesByTitle[jobTitle];
  if (officeJobTitles.includes(jobTitle)) return ['Activități de birou'];
  return null;
}

/**
 * Which fire-safety fixture modules a seeded position applies. Never undecided: the fire-safety
 * set waits for every position to decide, and the seed completes that set for its clients.
 */
export function fireInstructionsFor(jobTitle: string): string[] | 'none' {
  return fireModulesByTitle[jobTitle] ?? 'none';
}

export async function readFixtures(): Promise<Fixture[]> {
  const fixtures = JSON.parse(await readFile(fixturesFile, 'utf8')) as Fixture[];
  return fixtures.map((fixture) => ({
    ...fixture,
    body: instructionBodySchema.parse(fixture.body),
  }));
}

async function seedLibrary(db: SeedClient, organizationId: string, createdBy: string) {
  const existing = await db
    .from('instruction_modules')
    .select('id, title')
    .eq('organization_id', organizationId);
  if (existing.error) throw new Error(`Could not read the library: ${existing.error.message}`);
  const ids = new Map(existing.data.map((row) => [row.title, row.id]));
  let added = 0;
  for (const fixture of await readFixtures()) {
    if (ids.has(fixture.title)) continue;
    const module = await db
      .from('instruction_modules')
      .insert({
        organization_id: organizationId,
        title: fixture.title,
        module_group: fixture.group,
        domain: fixture.domain,
        created_by: createdBy,
      })
      .select('id')
      .single();
    if (module.error) throw new Error(`Could not seed a module: ${module.error.message}`);
    const version = await db.from('instruction_module_versions').insert({
      organization_id: organizationId,
      module_id: module.data.id,
      number: 1,
      body: fixture.body,
      text_hash: await textHash(fixture.body),
      created_by: createdBy,
    });
    if (version.error) throw new Error(`Could not seed a module version: ${version.error.message}`);
    ids.set(fixture.title, module.data.id);
    added += 1;
  }
  return { ids, added };
}

type Decide = (jobTitle: string) => string[] | 'none' | null;

// Only positions still undecided are touched, so a rerun leaves alone what was applied or
// decided by hand.
async function decidePositions(
  db: SeedClient,
  organizationId: string,
  createdBy: string,
  ids: Map<string, string>,
  domain: Domain,
  decide: Decide
) {
  const decision = domain === 'su' ? 'needs_fire_instructions' : 'needs_instructions';
  const positions = await db
    .from('job_positions')
    .select('id, client_id, name')
    .eq('organization_id', organizationId)
    .is(decision, null)
    .is('archived_at', null);
  if (positions.error) {
    throw new Error(`Could not read job positions: ${positions.error.message}`);
  }
  const rows: Database['public']['Tables']['job_position_instructions']['Insert'][] = [];
  const needNone: string[] = [];
  for (const position of positions.data) {
    const titles = decide(position.name);
    if (titles === 'none') needNone.push(position.id);
    if (!titles || titles === 'none') continue;
    for (const title of titles) {
      const moduleId = ids.get(title);
      if (!moduleId) continue;
      rows.push({
        organization_id: organizationId,
        client_id: position.client_id,
        job_position_id: position.id,
        module_id: moduleId,
        domain,
        created_by: createdBy,
      });
    }
  }
  if (rows.length > 0) {
    const { error } = await db.from('job_position_instructions').insert(rows);
    if (error) throw new Error(`Could not seed applied instructions: ${error.message}`);
  }
  // In chunks: the ids go in the query string, and a few hundred overflow the URI limit.
  for (let start = 0; start < needNone.length; start += 100) {
    const { error } = await db
      .from('job_positions')
      .update(domain === 'su' ? { needs_fire_instructions: false } : { needs_instructions: false })
      .in('id', needNone.slice(start, start + 100));
    if (error) throw new Error(`Could not decide seeded job positions: ${error.message}`);
  }
  return { applied: rows.length, decided: needNone.length };
}

export async function seedInstructionModules(
  db: SeedClient,
  organizationId: string,
  createdBy: string
) {
  const { ids, added } = await seedLibrary(db, organizationId, createdBy);
  const ssm = await decidePositions(db, organizationId, createdBy, ids, 'ssm', instructionsFor);
  const su = await decidePositions(db, organizationId, createdBy, ids, 'su', fireInstructionsFor);
  return {
    modules: added,
    applied: ssm.applied,
    decided: ssm.decided,
    fireApplied: su.applied,
    fireDecided: su.decided,
  };
}
