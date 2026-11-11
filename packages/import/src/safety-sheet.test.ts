import { fireSubstanceMaxLengths } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { safetySheetModel } from './models';
import {
  clipText,
  hasSafetySheetStructure,
  notClassifiedText,
  readSafetySheetAnswer,
  safetySheetAnswer,
  safetySheetCharacters,
  safetySheetRequest,
  safetySheetSections,
  SafetySheetTooLongError,
} from './safety-sheet';
import { answer, datasheetText, sheetText } from './test/safety-sheet';

const draftOf = (reading: ReturnType<typeof readSafetySheetAnswer>) => {
  if (reading.kind !== 'draft') throw new Error('expected a draft');
  return reading;
};

describe('safetySheetRequest', () => {
  it('sends the sheet to the reading model with the strict schema', () => {
    const request = safetySheetRequest(sheetText);

    expect(request.model).toBe(safetySheetModel);
    expect(request.answer.name).toBe('safety_sheet');
    expect(request.messages.at(-1)?.content).toContain('Degresant Rapid DX-40');
    expect(request.messages[0]?.content).toContain('Romanian');
  });

  it('refuses a text past the cap', () => {
    expect(() => safetySheetRequest('x'.repeat(safetySheetCharacters + 1))).toThrow(
      SafetySheetTooLongError
    );
  });

  it('reads an answer the provider wrote with blanks', () => {
    const parsed = safetySheetAnswer.parse({ ...answer(), unNumber: '  ', handling: ' ' });

    expect(parsed.unNumber).toBe('');
    expect(parsed.handling).toBe('');
  });
});

describe('safetySheetSections', () => {
  it('finds the sixteen sections of a sheet', () => {
    expect([...safetySheetSections(sheetText)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1)
    );
    expect(hasSafetySheetStructure(sheetText)).toBe(true);
  });

  it('finds them by their subsections in another language', () => {
    const english = Array.from(
      { length: 16 },
      (_, index) => `${index + 1}.1 Heading of part ${index + 1}\n   text`
    ).join('\n');

    expect(hasSafetySheetStructure(english)).toBe(true);
  });

  it('finds no structure in a technical data sheet', () => {
    expect(hasSafetySheetStructure(datasheetText)).toBe(false);
  });
});

describe('readSafetySheetAnswer', () => {
  it('composes the classification and the identification codes from what the sheet holds', () => {
    const { draft, droppedCodes } = draftOf(readSafetySheetAnswer(answer(), sheetText));

    expect(droppedCodes).toBe(0);
    expect(draft.name).toBe('Degresant Rapid DX-40');
    expect(draft.classification).toBe('Flam. Liq. 2, H225; Eye Irrit. 2, H319; STOT SE 3, H336');
    expect(draft.identificationCodes).toBe(
      'Etanol: CAS 64-17-5, CE 200-578-6; Propan-2-ol: CAS 67-63-0, CE 200-661-7; UN 1993'
    );
    expect(draft.extinguishingAgents).toContain('nu se folosește jet de apă compact');
    expect(draft).not.toHaveProperty('quantity');
    expect(draft).not.toHaveProperty('storagePlace');
  });

  it('names no component when the product has one', () => {
    const { draft } = draftOf(
      readSafetySheetAnswer(
        answer({ components: [{ name: 'Etanol', cas: '64-17-5', ec: '' }] }),
        sheetText
      )
    );

    expect(draft.identificationCodes).toBe('CAS 64-17-5; UN 1993');
  });

  it('drops and counts every code the file does not hold', () => {
    const { draft, droppedCodes } = draftOf(
      readSafetySheetAnswer(
        answer({
          hazards: [
            { hazardClass: 'Flam. Liq. 2', statements: ['H225', 'H226'] },
            { hazardClass: 'Acute Tox. 4', statements: ['H302+H332'] },
          ],
          components: [{ name: 'Etanol', cas: '64-17-5', ec: '999-999-9' }],
          unNumber: 'UN 1170',
          healthEnvironmentRisks: 'Iritare gravă a ochilor (H319); toxic la inhalare (H331).',
          physicalChemicalProperties: 'Lichid incolor; component CAS 108-88-3.',
        }),
        sheetText
      )
    );

    expect(draft.classification).toBe('Flam. Liq. 2, H225; Acute Tox. 4');
    expect(draft.identificationCodes).toBe('CAS 64-17-5');
    expect(draft.healthEnvironmentRisks).toBe('Iritare gravă a ochilor (H319); toxic la inhalare.');
    expect(draft.physicalChemicalProperties).toBe('Lichid incolor; component.');
    expect(droppedCodes).toBe(7);
  });

  it('counts a code written outside its format', () => {
    const { draft, droppedCodes } = draftOf(
      readSafetySheetAnswer(
        answer({ components: [{ name: 'Etanol', cas: '64175', ec: '' }], unNumber: '' }),
        sheetText
      )
    );

    expect(draft.identificationCodes).toBeNull();
    expect(droppedCodes).toBe(1);
  });

  it('leaves a field empty where the sheet says nothing', () => {
    const { draft } = draftOf(
      readSafetySheetAnswer(
        answer({ healthEnvironmentRisks: '', unNumber: '', components: [], protectionMeans: '-' }),
        sheetText
      )
    );

    expect(draft.healthEnvironmentRisks).toBeNull();
    expect(draft.identificationCodes).toBeNull();
    expect(draft.protectionMeans).toBeNull();
  });

  it('writes a product that is not classified as such', () => {
    const { draft } = draftOf(
      readSafetySheetAnswer(answer({ hazards: [], notClassified: true }), sheetText)
    );

    expect(draft.classification).toBe(notClassifiedText);
  });

  it('keeps every text within its column', () => {
    const long = Array.from({ length: 200 }, (_, index) => `măsura numărul ${index}`).join('; ');
    const { draft } = draftOf(
      readSafetySheetAnswer(
        answer({ interventionMeasures: long, extinguishingAgents: long, productName: long }),
        sheetText
      )
    );

    expect(draft.interventionMeasures!.length).toBeLessThanOrEqual(
      fireSubstanceMaxLengths.interventionMeasures
    );
    expect(draft.interventionMeasures).toMatch(/măsura numărul \d+$/);
    expect(draft.extinguishingAgents!.length).toBeLessThanOrEqual(
      fireSubstanceMaxLengths.extinguishingAgents
    );
    expect(draft.name!.length).toBeLessThanOrEqual(fireSubstanceMaxLengths.name);
  });

  it('refuses a file the model says is no safety data sheet', () => {
    expect(readSafetySheetAnswer(answer({ isSafetyDataSheet: false }), sheetText)).toEqual({
      kind: 'not_a_sheet',
    });
  });

  it('refuses a file without the sections, whatever the model says', () => {
    expect(readSafetySheetAnswer(answer(), datasheetText)).toEqual({ kind: 'not_a_sheet' });
  });
});

describe('clipText', () => {
  it('cuts at the last phrase that fits', () => {
    expect(clipText('unu doi; trei patru; cinci șase', 22)).toBe('unu doi; trei patru');
  });

  it('cuts at a word when no phrase ends early enough', () => {
    expect(clipText('cuvinte multe fără niciun semn de punctuație', 20)).toBe('cuvinte multe fără');
  });
});
