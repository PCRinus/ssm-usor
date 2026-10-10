import { documentTypeKeys, fireSafetyDocumentTypeKeys } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import fireManifest from '../../../../../packages/document-engine/templates/fire/manifest.json';
import { type ClientDocument, notGeneratedTitles } from './document-labels';
import {
  documentSections,
  fireSafetyDocumentSectionIds,
  fireSafetyDocumentSections,
  sectionOf,
  type SectionRow,
  sectionSummary,
} from './document-sections';

const documentRow = (state: { issued?: boolean; draft?: boolean; dataChanged?: boolean }) =>
  ({
    kind: 'document',
    document: {
      issued: state.issued ? {} : null,
      draft: state.draft ? { dataChanged: state.dataChanged ?? false } : null,
    } as ClientDocument,
  }) as const;
const emptyRow = (kind: Exclude<SectionRow['kind'], 'document'>) => ({ kind, document: null });

describe('document sections', () => {
  it('hold every document of the pack once, in the pack order', () => {
    expect(documentSections.flatMap((section) => section.typeKeys)).toEqual([...documentTypeKeys]);
  });

  it('hold every fire-safety document once, in the binder order', () => {
    expect(fireSafetyDocumentSections.flatMap((section) => section.typeKeys)).toEqual([
      ...fireSafetyDocumentTypeKeys,
    ]);
  });

  it('list the whole fire-safety binder under its own numbers', () => {
    expect(
      fireSafetyDocumentSections.map((section) => [section.number, section.id, section.title])
    ).toEqual([
      ['1', 'decisions', 'Decizii interne'],
      ['2', 'own-instructions', 'Instrucțiuni proprii în domeniul situațiilor de urgență'],
      ['3', 'training-themes', 'Tematica de instruire'],
      ['4', 'tests', 'Teste de verificare a cunoștințelor'],
      ['5', 'means', 'Mijloace de apărare și organizarea la locul de muncă'],
      ['6', 'registers', 'Registre și formulare PSI'],
    ]);
    expect(fireSafetyDocumentSectionIds).toEqual([
      'other',
      'decisions',
      'own-instructions',
      'training-themes',
      'tests',
      'means',
      'registers',
    ]);
  });

  it('name a fire-safety document not generated yet by its template title', () => {
    expect(notGeneratedTitles).toEqual(
      Object.fromEntries(
        fireManifest.templates.map((template) => [template.typeKey, template.title])
      )
    );
  });

  it('place a type in the sections of its own set', () => {
    expect(sectionOf('fire_work_permit', 'fire_safety')).toBe('registers');
    expect(sectionOf('fire_evacuation_plan', 'fire_safety')).toBe('other');
    expect(sectionOf('control_report')).toBe('control-report');
  });
});

describe('section summary', () => {
  it.each([
    ['nothing listed', [], 'negenerat'],
    [
      'built documents of which none exists',
      [emptyRow('notGenerated'), emptyRow('notGenerated')],
      'negenerat',
    ],
    ['a document that does not apply', [emptyRow('notApplicable')], 'nu se aplică'],
    [
      'drafts beside one that does not apply',
      [documentRow({ draft: true }), documentRow({ draft: true }), emptyRow('notApplicable')],
      '2 ciorne',
    ],
    [
      'issued, drafts and changed data',
      [
        documentRow({ issued: true }),
        documentRow({ draft: true, dataChanged: true }),
        documentRow({ draft: true }),
      ],
      '1 emis · 2 ciorne · 1 cu date modificate',
    ],
    [
      'one built document missing beside existing ones',
      [documentRow({ draft: true }), emptyRow('notGenerated'), emptyRow('notApplicable')],
      '1 ciornă · 1 negenerat',
    ],
    [
      'several built documents missing beside existing ones',
      [
        documentRow({ issued: true }),
        documentRow({ issued: true }),
        emptyRow('notGenerated'),
        emptyRow('notGenerated'),
        emptyRow('notGenerated'),
      ],
      '2 emise · 3 negenerate',
    ],
  ] as const)('reads right for %s', (_, rows, summary) => {
    expect(sectionSummary(rows)).toBe(summary);
  });
});
