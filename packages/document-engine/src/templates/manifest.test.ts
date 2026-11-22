import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { annexTemplate } from '../annex-template';
import { templateChangeProblems } from '../template-change';
import { templateSets, templatesUrl } from '../template-store';
import { documentText } from '../text';
import {
  documentTextOf,
  entries,
  originals,
  perEmployeeFiles,
  read,
  setEntries,
  templateFiles,
  typesetFiles,
} from './read';

describe('built-in templates', () => {
  it.each(typesetFiles)('%s carries nothing of the client it was made from', (name) => {
    expect(documentText(read(name))).not.toMatch(originals);
  });

  it.each(['ssm', 'su'] as const)('the %s annex template carries nothing of a client', (domain) => {
    expect(documentText(annexTemplate(domain))).not.toMatch(originals);
  });
});

// Written by us and not imported (ADR 007), so they are kept apart from the provider's pack.
describe('templates outside the pack', () => {
  const otherUrl = new URL('other/', templatesUrl);
  const manifest = { templates: entries.filter((entry) => entry.set === 'other') };
  const files = readdirSync(fileURLToPath(otherUrl)).filter((name) => name.endsWith('.docx'));

  it('are the files of their manifest, named after their types', () => {
    expect(manifest.templates.map((entry) => entry.file).sort()).toEqual([...files].sort());
    for (const entry of manifest.templates) expect(entry.file).toBe(`${entry.typeKey}.docx`);
  });

  it.each(files)('%s carries nothing of the contract it was modelled on', (name) => {
    const text = documentText(new Uint8Array(readFileSync(new URL(name, otherUrl))));
    expect(text).not.toMatch(originals);
    expect(text).not.toMatch(/\b\d+([.,]\d+)? ?(RON|lei)\b/i);
  });

  it('numbers the articles of the contract with a list, and nothing else', () => {
    const zip = new PizZip(readFileSync(new URL('service_contract.docx', otherUrl)));
    expect(zip.file('word/numbering.xml')!.asText()).toContain('w:lvlText w:val="Art. %1."');
    const numbered = (
      zip
        .file('word/document.xml')!
        .asText()
        .match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
    )
      .filter((paragraph) => /<w:numId w:val="[1-9]/.test(paragraph))
      .map(documentTextOf);
    expect(numbered.length).toBeGreaterThan(25);
    for (const text of numbered) {
      expect(text).not.toMatch(/^\{\{[#/]/);
      expect(text).not.toMatch(/^[a-z]\) /);
    }
  });
});

// Every original of the provider's pack is listed, ported or not, under its number in the
// binder, so the folder shows at a glance what is still to do. A cover is X.0, whatever the
// original's number. Decision 1.5 came later, from a third pack.
// The record of risk zones (9.2, ADR 045) and the annex on the electronic signature (13,
// ADR 023) have no original: their wording is ours.
describe('manifest', () => {
  const manifest = { templates: setEntries('ssm') };
  const ported = manifest.templates.filter((entry) => entry.file);

  it('lists all 23 originals once, and the documents written without one', () => {
    expect(manifest.templates.filter((entry) => entry.original)).toHaveLength(23);
    expect(
      manifest.templates.filter((entry) => !entry.original).map((entry) => entry.typeKey)
    ).toEqual(['risk_zones_record', 'signing_regulation_annex']);
    expect(new Set(manifest.templates.map((entry) => entry.number)).size).toBe(25);
  });

  it('names each ported template after its number and its type', () => {
    for (const entry of ported) {
      expect(entry.file).toBe(`${entry.number}_${entry.typeKey}.docx`);
      expect(entry.typeKey).toMatch(/^[a-z][a-z0-9_]{1,59}$/);
      expect(entry.title).toBeTruthy();
    }
    expect(new Set(ported.map((entry) => entry.typeKey)).size).toBe(ported.length);
  });

  it.each(['ssm', 'fire'] as const)('numbers every cover of the %s set X.0', (set) => {
    const covers = setEntries(set).filter((entry) => /(^|_)cover_/.test(entry.typeKey));
    expect(covers.length).toBeGreaterThan(4);
    for (const entry of covers) expect(entry.number).toMatch(/^\d+\.0$/);
  });

  it('matches the files in the folder exactly', () => {
    expect(ported.map((entry) => entry.file).sort()).toEqual(
      templateFiles.filter((name) => !perEmployeeFiles.includes(name)).sort()
    );
  });
});

describe.each(templateSets.map(({ folder, set }) => [folder, set] as const))(
  'the change of each template in %smanifest.json',
  (_folder, set) => {
    const manifest = { templates: entries.filter((entry) => entry.set === set) };
    const acts = JSON.parse(readFileSync(new URL('legal-acts.json', templatesUrl), 'utf8')) as {
      acts: { id: string }[];
    };
    const actIds = new Set(acts.acts.map((act) => act.id));

    it.each(manifest.templates.map((entry) => [entry.typeKey, entry.change] as const))(
      '%s says what kind of change it was, in a note, and which change of an act it resolves',
      (_typeKey, change) => {
        expect(templateChangeProblems(change, actIds)).toEqual([]);
      }
    );
  }
);
