import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  testResult,
  trainingSheetFormSample,
  trainingSheetSamples,
  transcribedNote,
  transcriptionLine,
} from '../../tools/training-sheet-samples';
import { renderDocument, templatePlaceholders } from '../render';
import { documentText } from '../text';
import { documentTextOf, perEmployeeEntries, read, sheetEntries } from './read';

describe('the individual training sheets', () => {
  it('are, with the signing agreement, the test sheet and the acknowledgement of duties, the per-employee entries of their manifests, with no number', () => {
    expect(perEmployeeEntries.map(({ typeKey, path }) => [typeKey, path])).toEqual([
      ['training_sheet_ssm', 'fisa_instruire_ssm.docx'],
      ['signing_agreement', 'act_aditional_semnare_electronica.docx'],
      ['test_sheet', 'fisa_test.docx'],
      ['duties_acknowledgement', 'fisa_atributii_ssm.docx'],
      ['training_sheet_su', 'fire/fisa_instructaj_su.docx'],
    ]);
    for (const entry of perEmployeeEntries) expect(entry).not.toHaveProperty('number');
    for (const entry of sheetEntries) {
      expect(entry.title).toMatch(/^Fișa individuală de (instruire SSM|instructaj SU)$/);
    }
  });

  const dotted = (data: object, prefix = ''): string[] =>
    Object.entries(data).flatMap(([key, value]) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? dotted(value as object, `${prefix}${key}.`)
        : [`${prefix}${key}`]
    );
  const rowNames = [
    ...['heldOn', 'hours', 'occupation', 'material', 'trainer', 'verifier', 'note', '$index'],
    ...['date', 'grade', 'examiner'],
  ];

  describe.each([
    ['ssm', 'fisa_instruire_ssm.docx'],
    ['su', 'fire/fisa_instructaj_su.docx'],
  ] as const)('%s', (domain, name) => {
    const [recorded, empty] = trainingSheetSamples(domain) as [
      ReturnType<typeof trainingSheetSamples>[number],
      ReturnType<typeof trainingSheetSamples>[number],
    ];

    it('asks only for what the merge data has', () => {
      const known = new Set([...dotted(recorded.data), ...rowNames]);
      expect(templatePlaceholders(read(name)).filter((each) => !known.has(each))).toEqual([]);
    });

    it.each([recorded, empty])('merges the $label sample with every loop closed', ({ data }) => {
      const text = documentText(renderDocument(read(name), data));
      expect(text).not.toContain('{{');
      expect(text).toContain(data.client.legalName);
    });

    it('prints every recorded row and who trained, and the trainee only once, as the name', () => {
      const { data } = recorded;
      const text = documentText(renderDocument(read(name), data));
      for (const row of [...data.periodic, ...data.supplementary]) {
        expect(text).toContain(row.material);
        expect(text).toContain(row.heldOn);
        expect(text).toContain(row.trainer);
      }
      expect(text).toContain(data.hiring.workplace.place);
      expect(text).toContain(data.admission.name);
      const body = documentTextOf(
        new PizZip(renderDocument(read(name), data)).file('word/document.xml')!.asText()
      );
      expect(body.split(data.employee.name)).toHaveLength(2);
    });

    it('marks the transcribed rows and blocks, and prints the line on them only when there are some', () => {
      const transcribed = (docx: Uint8Array) =>
        documentText(docx).split(transcribedNote).length - 1;
      const text = documentText(renderDocument(read(name), recorded.data));
      expect(text).toContain(transcriptionLine);
      expect(transcribed(renderDocument(read(name), recorded.data))).toBe(
        (domain === 'ssm' ? 3 : 2) + 1
      );
      expect(documentText(renderDocument(read(name), empty.data))).not.toContain('transcris');
    });

    const titles = (docx: Uint8Array) =>
      [
        ...new PizZip(docx)
          .file('word/document.xml')!
          .asText()
          .matchAll(/<w:alias w:val="([^"]+)"\/>/g),
      ].map((match) => match[1]!);

    it('prints no field on the paper sheet', () => {
      for (const { data } of [recorded, empty]) {
        expect(titles(renderDocument(read(name), data))).toEqual([]);
      }
    });

    it("prints the signed sheet's fields once each, and the rows signed on paper as text", () => {
      const data = trainingSheetFormSample(domain);
      const docx = renderDocument(read(name), data);
      const printed = titles(docx);
      expect(new Set(printed).size).toBe(printed.length);
      expect(printed).toEqual(
        expect.arrayContaining(['h2_date', 'h2_sig_trainee', 'p3_date', 'p17_note'])
      );
      expect(printed.some((title) => /^(h1|p1|p2)_/.test(title))).toBe(false);
      expect(printed.includes('adm_sig')).toBe(domain === 'ssm');
      expect(printed.includes('s17_sig_verifier')).toBe(domain === 'ssm');
      expect(printed.includes('t2_date') && printed.includes('t5_examiner')).toBe(domain === 'ssm');
      expect(printed.some((title) => title.startsWith('t1_'))).toBe(false);
      const text = documentText(docx);
      expect(text).toContain(transcribedNote);
      expect(printed).toContain('transcription_line');
      expect(text).not.toContain(transcriptionLine);
      expect(text).toContain(data.periodic[1]!.material);
      for (const result of data.testResults) expect(text).toContain(result.material);
      expect(text).not.toContain('{{');
    });

    it('prints a row per item of its blank rows, and none without them', () => {
      const rows = (data: Record<string, unknown>) =>
        (
          new PizZip(renderDocument(read(name), data))
            .file('word/document.xml')!
            .asText()
            .match(/<w:tr>/g) ?? []
        ).length;
      const { data } = empty;
      expect(
        rows(data) -
          rows({ ...data, blankRows: { periodic: [], supplementary: [], testResults: [] } })
      ).toBe(
        data.blankRows.periodic.length +
          data.blankRows.supplementary.length +
          data.blankRows.testResults.length
      );
    });
  });

  it("leaves the signed SSM sheet's admission signature field three empty lines tall", () => {
    const xml = new PizZip(
      renderDocument(read('fisa_instruire_ssm.docx'), trainingSheetFormSample('ssm'))
    )
      .file('word/document.xml')!
      .asText();
    const field = xml.split('<w:sdt>').find((each) => each.includes('<w:alias w:val="adm_sig"/>'))!;
    const content = field.slice(field.indexOf('<w:sdtContent>'), field.indexOf('</w:sdtContent>'));
    const texts = [...content.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]!);
    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text).toMatch(/^\u2002+$/);
    expect(content.match(/<w:br\/>/g)).toHaveLength(2);
  });

  it.each([0, 2, 5])('prints %i test results on the SSM sheet, blank rows up to five', (count) => {
    const { data } = trainingSheetSamples('ssm')[0]!;
    const results = Array.from({ length: count }, (_, index) =>
      testResult(`0${index + 1}.02.2026`, `Test de verificare a cunoștințelor nr. ${index + 1}`)
    );
    const docx = renderDocument(read('fisa_instruire_ssm.docx'), {
      ...data,
      testResults: results,
      blankRows: { ...data.blankRows, testResults: Array.from({ length: 5 - count }, () => ({})) },
    });
    const xml = new PizZip(docx).file('word/document.xml')!.asText();
    const block = xml.slice(xml.indexOf('Rezultatele testărilor'));
    const table = block.slice(block.indexOf('<w:tbl>'), block.indexOf('</w:tbl>'));
    expect(table.match(/<w:tr>/g)).toHaveLength(1 + 5);
    const text = documentText(docx);
    for (const result of results) {
      expect(text).toContain(`${result.date}\n${result.material}\nadmis\n${result.examiner}`);
    }
  });

  it('follows the rubrics of annex 11 to the norms of H.G. 1425/2006', () => {
    const text = documentText(read('fisa_instruire_ssm.docx'));
    for (const rubric of [
      'Întreprinderea/unitatea',
      'FIȘĂ DE INSTRUIRE INDIVIDUALĂ',
      'Legitimația, marca',
      'Grupa sanguină',
      'Autorizații (ISCIR ș.a.)',
      'Traseul de deplasare la/de la serviciu',
      'Instruirea la angajare',
      'Semnătura celui care a verificat însușirea cunoștințelor',
      'Loc de muncă/post de lucru',
      'Admis la lucru',
      'Funcția (șef secție, atelier, șantier etc.)',
      'Instruirea periodică suplimentară',
      'Data efectuării',
      'Rezultatele testărilor',
      'Accidente de muncă sau îmbolnăviri profesionale suferite',
      'Nr. zile ITM',
      'Sancțiuni aplicate pentru nerespectarea reglementărilor de securitate și sănătate în muncă',
      'Control medical periodic',
      'Testarea psihologică periodică',
    ]) {
      expect(text).toContain(rubric);
    }
  });

  it('follows the rubrics of the annex to the general dispositions of OMAI 712/2005', () => {
    const text = documentText(read('fire/fisa_instructaj_su.docx'));
    for (const rubric of [
      'FIȘĂ INDIVIDUALĂ',
      'de instructaj în domeniul situațiilor de urgență',
      'ATENȚIE!',
      'Nicio persoană nu va fi admisă la lucru',
      'fără efectuarea instructajului introductiv general',
      'și a instructajului la locul de muncă.',
      'Date personale',
      'Calificarea (specialitatea, meseria)',
      'Semnătura salariatului (persoanei care a verificat însușirea cunoștințelor)',
      'Semnătura persoanei instruite',
      'Specialitatea (meseria)',
      'Instructaj periodic',
      'Semnătura celui care a instruit',
    ]) {
      expect(text).toContain(rubric);
    }
  });
});
