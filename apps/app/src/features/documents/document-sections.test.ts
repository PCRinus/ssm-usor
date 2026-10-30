import { documentTypeKeys, fireSafetyDocumentTypeKeys } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import fireManifest from '../../../../../packages/document-engine/templates/fire/manifest.json';
import manifest from '../../../../../packages/document-engine/templates/manifest.json';
import { notGeneratedTitles } from './document-labels';
import {
  documentSections,
  fireSafetyDocumentSectionIds,
  fireSafetyDocumentSections,
  sectionOf,
} from './document-sections';

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
      ['7', 'inspectorate', 'Documente pentru inspectorat'],
    ]);
    expect(fireSafetyDocumentSectionIds).toEqual([
      'other',
      'decisions',
      'own-instructions',
      'training-themes',
      'tests',
      'means',
      'registers',
      'inspectorate',
    ]);
  });

  it('name a document not generated yet by its template title', () => {
    expect(notGeneratedTitles).toEqual(
      Object.fromEntries(
        [...manifest.templates, ...fireManifest.templates]
          .filter((template) => !('perEmployee' in template))
          .map((template) => [template.typeKey, template.title])
      )
    );
  });

  it('place a type in the sections of its own set', () => {
    expect(sectionOf('fire_work_permit', 'fire_safety')).toBe('registers');
    expect(sectionOf('fire_evacuation_plan', 'fire_safety')).toBe('other');
    expect(sectionOf('control_report')).toBe('control-report');
  });
});
