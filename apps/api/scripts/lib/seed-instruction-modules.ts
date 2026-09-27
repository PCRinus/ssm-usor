import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { countArticles } from '@ssm-usor/document-engine';

import type { Database } from '../../src/database.types';
import { officeJobTitles } from './seed-employees';
import type { SeedClient } from './seed-organization';

type Group = Database['public']['Enums']['instruction_module_group'];
type Fixture = { file: string; title: string; group: Group };

const fixturesDir = path.join(import.meta.dirname, '..', 'fixtures', 'instruction-modules');

const modulesByTitle: Record<string, string[]> = {
  Electrician: ['Scări metalice'],
  Instalator: ['Scări metalice'],
  Zidar: ['Scări metalice'],
  'Muncitor necalificat': ['Scări metalice'],
  'Agent curățenie': ['Activități de curățenie'],
  Gestionar: ['Activități de birou'],
};

/** Which fixture modules a seeded position applies; office posts apply the office module. */
export function instructionsFor(jobTitle: string): string[] | 'none' | null {
  if (modulesByTitle[jobTitle]) return modulesByTitle[jobTitle];
  if (officeJobTitles.includes(jobTitle)) return ['Activități de birou'];
  return null;
}

async function readFixtures(): Promise<Fixture[]> {
  return JSON.parse(await readFile(path.join(fixturesDir, 'index.json'), 'utf8')) as Fixture[];
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
    const bytes = new Uint8Array(await readFile(path.join(fixturesDir, fixture.file)));
    const module = await db
      .from('instruction_modules')
      .insert({
        organization_id: organizationId,
        title: fixture.title,
        module_group: fixture.group,
        created_by: createdBy,
      })
      .select('id')
      .single();
    if (module.error) throw new Error(`Could not seed a module: ${module.error.message}`);
    const docxPath = `${organizationId}/${module.data.id}/1.docx`;
    const version = await db.from('instruction_module_versions').insert({
      organization_id: organizationId,
      module_id: module.data.id,
      number: 1,
      docx_path: docxPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size_bytes: bytes.length,
      article_count: countArticles(bytes),
      created_by: createdBy,
    });
    if (version.error) throw new Error(`Could not seed a module version: ${version.error.message}`);
    const upload = await db.storage.from('instruction-modules').upload(docxPath, bytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });
    if (upload.error) throw new Error(`Could not upload a module file: ${upload.error.message}`);
    ids.set(fixture.title, module.data.id);
    added += 1;
  }
  return { ids, added };
}

// Only positions still undecided are touched, so a rerun leaves alone what was applied or
// decided by hand.
export async function seedInstructionModules(
  db: SeedClient,
  organizationId: string,
  createdBy: string
) {
  const { ids, added } = await seedLibrary(db, organizationId, createdBy);
  const positions = await db
    .from('job_positions')
    .select('id, client_id, name')
    .eq('organization_id', organizationId)
    .is('needs_instructions', null)
    .is('archived_at', null);
  if (positions.error) {
    throw new Error(`Could not read job positions: ${positions.error.message}`);
  }
  const rows: Database['public']['Tables']['job_position_instructions']['Insert'][] = [];
  const needNone: string[] = [];
  for (const position of positions.data) {
    const titles = instructionsFor(position.name);
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
        created_by: createdBy,
      });
    }
  }
  if (rows.length > 0) {
    const { error } = await db.from('job_position_instructions').insert(rows);
    if (error) throw new Error(`Could not seed applied instructions: ${error.message}`);
  }
  if (needNone.length > 0) {
    const { error } = await db
      .from('job_positions')
      .update({ needs_instructions: false })
      .in('id', needNone);
    if (error) throw new Error(`Could not decide seeded job positions: ${error.message}`);
  }
  return { modules: added, applied: rows.length, decided: needNone.length };
}
