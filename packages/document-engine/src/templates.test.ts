import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderDocument, templatePlaceholders } from './render';
import { documentText } from './text';

const templatesUrl = new URL('../templates/', import.meta.url);
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, templatesUrl)));
const documentTextOf = (paragraph: string) =>
  [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');

const allTemplateFiles = readdirSync(fileURLToPath(templatesUrl)).filter((name) =>
  name.endsWith('.docx')
);

// What the provider's originals printed. None of it may survive in a template. A date counts
// from 2020 on: the laws the documents quote are dated too, and older.
const originals =
  /VELOCITA|PIPETECH|SAFETY CORE|POPA|LUCA|CASAPU|TALO[SȘ]|D-na|D-l |\b\d{2}\.\d{2}\.202\d\b/;

// What only the decisions have: a signature block, an acknowledgement table, its wording.
const decisionFiles = allTemplateFiles.filter((name) => name.includes('_decision_'));
const templateFiles = allTemplateFiles;

describe('built-in templates', () => {
  it.each(templateFiles)('%s carries nothing of the client it was made from', (name) => {
    expect(documentText(read(name))).not.toMatch(originals);
  });
});

// Every original of the provider's pack is listed, ported or not, under its own number, so
// the folder shows at a glance what is still to do.
describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8')) as {
    templates: {
      number: string;
      original: string;
      stage: number;
      typeKey: string | null;
      title: string | null;
      file: string | null;
    }[];
  };
  const ported = manifest.templates.filter((entry) => entry.file);

  it('lists all 23 originals once', () => {
    expect(manifest.templates).toHaveLength(23);
    expect(new Set(manifest.templates.map((entry) => entry.number)).size).toBe(23);
  });

  it('names each ported template after its original number and its type', () => {
    for (const entry of ported) {
      expect(entry.file).toBe(`${entry.number}_${entry.typeKey}.docx`);
      expect(entry.typeKey).toMatch(/^[a-z][a-z0-9_]{1,59}$/);
      expect(entry.title).toBeTruthy();
    }
    expect(new Set(ported.map((entry) => entry.typeKey)).size).toBe(ported.length);
  });

  it('matches the files in the folder exactly', () => {
    expect(ported.map((entry) => entry.file).sort()).toEqual([...templateFiles].sort());
  });
});

const bodyOf = (name: string) => new PizZip(read(name)).file('word/document.xml')!.asText();

// The house style the import script typesets every template to.
describe('typesetting', () => {
  const paragraphsOf = (xml: string) => xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];

  it.each(decisionFiles)('%s centres the signature block instead of spacing it out', (name) => {
    for (const placeholder of [
      '{{client.legalName}}',
      '{{client.representativeRole}}',
      '{{client.representativeName}}',
    ]) {
      const block = paragraphsOf(bodyOf(name)).filter(
        (paragraph) => documentTextOf(paragraph) === placeholder
      );
      expect(block.length, placeholder).toBeGreaterThan(0);
      for (const paragraph of block) expect(paragraph).toContain('<w:jc w:val="center"/>');
    }
  });

  it.each(templateFiles)(
    '%s aligns nothing with spaces and spaces nothing with empty paragraphs',
    (name) => {
      // A table cell or a text box may be empty; a paragraph that holds a picture is not.
      const body = bodyOf(name)
        .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '<w:tbl/>')
        .replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, '');
      const texts = paragraphsOf(body).map(documentTextOf);
      expect(texts.filter((text) => /^[ \u00a0\t]/.test(text))).toEqual([]);
      // Loop tags stand alone in a paragraph. The only empty paragraphs are the ones Word needs
      // after a table: at the end, or between two tables that would otherwise be saved as one.
      const empty = paragraphsOf(body).filter(
        (paragraph) =>
          documentTextOf(paragraph).trim() === '' &&
          !/<w:drawing|<w:object|<w:pict|<mc:AlternateContent/.test(paragraph)
      );
      // Or set at 1 pt, where it takes no room: one original cannot be saved without them.
      for (const paragraph of empty.filter((item) => !item.includes('<w:sz w:val="2"/>'))) {
        expect(body.slice(0, body.indexOf(paragraph)).trimEnd()).toMatch(/<w:tbl\/>$/);
      }
    }
  );

  it.each(templateFiles)('%s uses one font, the body and title sizes, and Romanian', (name) => {
    const xml = bodyOf(name);
    // Of the runs that carry text, here and below: a paragraph's end mark may keep a font, a
    // size or a language of its own, which nothing shows and LibreOffice does not let go of.
    const fonts = new Set(
      [
        ...xml.matchAll(
          /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:rFonts [^>]*w:ascii="([^"]+)"(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/g
        ),
      ].map((match) => match[1])
    );
    const sizes = new Set(
      [
        ...xml.matchAll(
          /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/g
        ),
      ].map((match) => Number(match[1]) / 2)
    );
    // Of the runs that carry text: that is what spell-check and hyphenation read. A paragraph's
    // end mark may keep a language of its own, which nothing shows.
    const languages = new Set(
      [
        ...xml.matchAll(
          /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:lang [^>]*w:val="([^"]+)"(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/g
        ),
      ].map((match) => match[1])
    );
    expect([...fonts]).toEqual(['Arial']);
    // 10 pt body; 12 pt document titles; 14 and 16 pt on a cover page. Smaller only inside a
    // table too wide for the body size, never for a heading over running text.
    expect([...sizes].filter((size) => ![7, 8, 9, 10, 12, 14, 16].includes(size))).toEqual([]);
    const outsideTables = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');
    expect(outsideTables).not.toMatch(
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(14|16|18)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/
    );
    expect([...languages]).toEqual(['ro-RO']);
  });

  it.each(templateFiles)('%s justifies nothing', (name) => {
    // Without hyphenation a justified line opens uneven gaps between words.
    expect(bodyOf(name)).not.toContain('<w:jc w:val="both"/>');
  });

  it.each(templateFiles)("%s names none of LibreOffice's own fonts in its styles", (name) => {
    // No text uses them, but a viewer without them warns that it shows substitutes.
    const styles = new PizZip(read(name)).file('word/styles.xml')!.asText();
    expect(styles).not.toMatch(/"(Liberation (Serif|Sans)|Noto [^"]*)"/);
  });

  it.each(templateFiles)('%s has no picture floating at the left between two lines', (name) => {
    // The in-app editor cannot lay out the page around one; as a character it looks the same.
    const floating = bodyOf(name).match(/<wp:anchor .*?<\/wp:anchor>/gs) ?? [];
    const atTheLeft = floating.filter((anchor) => {
      const offset = /<wp:positionH\b.*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/s.exec(anchor);
      return (
        anchor.includes('<wp:wrapTopAndBottom') && offset && Math.abs(Number(offset[1])) <= 360000
      );
    });
    expect(atTheLeft).toHaveLength(0);
  });

  it.each(templateFiles)('%s contains no hyperlinks', (name) => {
    // The originals carry dead internal links, and clearing them carelessly wraps all the text
    // in a link to nowhere, which some viewers draw as links.
    expect(bodyOf(name)).not.toContain('<w:hyperlink');
  });

  it.each(templateFiles)(
    '%s has the house margins, no header but the document details, and a footer that ends with the branding line',
    (name) => {
      const xml = bodyOf(name);
      // 25 mm left for binding, 20 mm elsewhere, in twentieths of a point.
      expect(xml).toMatch(/<w:pgMar [^>]*w:left="1417"[^>]*w:right="1134"/);
      // The footer sits inside the bottom margin: 12 mm to the footer, the text ends above 20 mm.
      expect(xml).toMatch(/<w:pgMar [^>]*w:footer="680"/);
      const bottom = Number(/<w:pgMar [^>]*w:bottom="(\d+)"/.exec(xml)![1]);
      expect(bottom).toBeGreaterThanOrEqual(1134);
      expect(bottom).toBeLessThan(1500);
      // No header, or the box of document details, which sits inside the top margin the way
      // the footer sits inside the bottom one. Every footer ends with the branding line, which
      // the merge data switches.
      const zip = new PizZip(read(name));
      const parts = Object.keys(zip.files);
      const headers = parts
        .filter((file) => /word\/header\d*\.xml/.test(file))
        .map((part) => documentTextOf(zip.file(part)!.asText()).trim());
      if (headers.every((text) => text === '')) {
        expect(xml).toMatch(/<w:pgMar [^>]*w:top="1134"/);
      } else {
        expect(xml).toMatch(/<w:pgMar [^>]*w:header="680"/);
        for (const text of headers) {
          expect(text).toContain('Data întocmirii documentului:{{issueDate}}');
          expect(text).toContain('Întocmit pentru:{{client.legalName}}');
          expect(text).toMatch(/Cod document:.+Denumire document:.+Pag\. /);
        }
      }
      const footers = parts.filter((file) => /word\/footer\d*\.xml/.test(file));
      expect(footers.length).toBeGreaterThan(0);
      for (const part of footers) {
        expect(documentTextOf(zip.file(part)!.asText()), part).toMatch(
          /\{\{#branding\}\}Document generat cu SSM Ușor · ssmusor\.ro\{\{\/branding\}\}$/
        );
      }
    }
  );

  it.each(decisionFiles)(
    '%s keeps a heading, what follows it, and its table on one page',
    (name) => {
      const heading = paragraphsOf(bodyOf(name)).find((paragraph) =>
        documentTextOf(paragraph).includes('PROCES VERBAL DE LUARE LA CUNOȘTINȚĂ')
      );
      expect(heading).toMatch(/<w:keepNext(\/| w:val="true"\/)>/);
      // A table that may not split is written as rows that keep with the next one.
      const table = bodyOf(name).match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
      expect(table).toMatch(/<w:keepNext(\/| w:val="true"\/)>/);
    }
  );
});

// The editorial pass of `tools/import/wording.ro.json`: what the originals got wrong.
describe('wording', () => {
  const texts = templateFiles.map((name) => [name, documentText(read(name))] as const);

  it.each(texts)(
    '%s uses comma-below letters, single spaces, no space before punctuation',
    (name, text) => {
      expect(text).not.toMatch(/[şţŞŢǎ]/);
      // The risk assessment writes its formulas as embedded objects, which leave gaps in the
      // extracted text where the page shows a formula.
      if (name.includes('risk_assessment')) return;
      expect(text).not.toMatch(/\S {2,}\S/);
      expect(text).not.toMatch(/\S[ \u00a0]+[,;:](\s|$)/m);
    }
  );

  it.each(texts)("%s has none of the originals' typos or missing diacritics", (_, text) => {
    expect(text).not.toMatch(
      /instuirii|activitatatilor|deasemeni|deoparte|în tabelului|securitatii|sanatatii|(?<!\p{L})in munca(?!\p{L})|(?<!\p{L})si(?!\p{L})|functia|Subsemnat/u
    );
  });

  it.each(texts.filter(([name]) => name.includes('_decision_')))(
    '%s words the acknowledgement for one signer or several',
    (_, text) => {
      expect(text).toContain(
        'fiecare persoană desemnată confirmă că a luat cunoștință de prezenta decizie'
      );
    }
  );
});

describe('decision_first_aid', () => {
  const template = read('1.3_decision_first_aid.docx');
  const data = {
    decisionNumber: 3,
    issueDate: '19.01.2026',
    client: {
      legalName: 'S.C. CLIENT DEMO S.R.L.',
      representativeName: 'Maria POPESCU',
      representativeRole: 'Director general',
    },
    provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.', representativeName: 'Ana IONESCU' },
    firstAiders: [
      { name: 'Ion MARIN', jobTitle: 'Manager magazin' },
      { name: 'Elena DUMITRU', jobTitle: 'Lucrător comercial' },
    ],
    firstAiderNames: 'Ion MARIN, Elena DUMITRU',
  };

  it('asks for exactly this data', () => {
    expect(templatePlaceholders(template)).toEqual([
      'branding',
      'client.legalName',
      'client.representativeName',
      'client.representativeRole',
      'decisionNumber',
      'firstAiderNames',
      'firstAiders',
      'issueDate',
      'jobTitle',
      'name',
      'provider.legalName',
      'provider.representativeName',
    ]);
  });

  it('names every first aider in the decision and in both tables, without honorifics', () => {
    const text = documentText(renderDocument(template, data));

    expect(text).not.toContain('{{');
    expect(text).toContain('Nr.: 3 SSM Din: 19.01.2026');
    expect(text).toContain(
      'Maria POPESCU în calitate de Director general în cadrul S.C. CLIENT DEMO S.R.L.'
    );
    expect(text).toContain(
      'Elena DUMITRU având funcția de Lucrător comercial în cadrul S.C. CLIENT DEMO S.R.L.'
    );
    // Once in the decision, once in each of the two acknowledgement tables.
    expect(text.match(/Ion MARIN/g)).toHaveLength(4);
    expect(text.match(/^Lucrător comercial$/gm)).toHaveLength(2);
    expect(text).toContain('S.C. SERVICIU EXTERN S.R.L. – Ana IONESCU');
    // Reads the same for one first aider or several.
    expect(text).toContain('Ion MARIN, Elena DUMITRU, desemnate să acorde primul ajutor');
  });

  it('refuses to render without a first aider name list rather than leave a gap', () => {
    const incomplete = { ...data, firstAiderNames: undefined };
    expect(() => renderDocument(template, incomplete)).toThrow(/firstAiderNames/);
  });
});

const people = [
  { name: 'Ion MARIN', jobTitle: 'Manager magazin' },
  { name: 'Elena DUMITRU', jobTitle: 'Lucrător comercial' },
];
const shared = {
  issueDate: '19.01.2026',
  client: {
    legalName: 'S.C. CLIENT DEMO S.R.L.',
    representativeName: 'Maria POPESCU',
    representativeRole: 'Director general',
  },
  provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.', representativeName: 'Ana IONESCU' },
};
const acknowledged = (text: string) =>
  expect(text.match(/^Lucrător comercial$/gm), 'one table row per person').toHaveLength(1);

describe('decision_training', () => {
  const template = read('1.1_decision_training.docx');
  const data = {
    ...shared,
    decisionNumber: 1,
    workplaceManagers: people,
    training: {
      periodicDuration: '2 ore',
      administrativeFrequency: 'SEMESTRIAL',
      administrativeMonths: 'Februarie, August',
      workerFrequency: 'TRIMESTRIAL',
      workerMonths: 'Februarie, Mai, August, Noiembrie',
      dayFrom: 2,
      dayTo: 7,
    },
  };

  it('prints the training schedule and a paragraph per workplace manager', () => {
    const text = documentText(renderDocument(template, data));

    expect(text).not.toContain('{{');
    expect(text).toContain('durata instruirii periodice va fi de 2 ore');
    // The original closes this sentence with the client's name and a full stop of its own.
    expect(text).toContain('din cadrul S.C. CLIENT DEMO S.R.L.\n');
    expect(text).not.toContain('..');
    expect(text).toContain(
      'va fi instruit SEMESTRIAL respectiv în lunile Februarie, August, în perioada (ziua) 2 – 7 ale lunii'
    );
    expect(text).toContain(
      'va fi instruit TRIMESTRIAL respectiv în lunile Februarie, Mai, August, Noiembrie'
    );
    expect(text).toContain(
      'Ion MARIN, având funcția de Manager magazin în cadrul societății; Elena DUMITRU,'
    );
    expect(
      text.match(
        /va efectua instruirea la locul de muncă și instruirea periodică pentru întreg personalul/g
      )
    ).toHaveLength(2);
    acknowledged(text);
  });

  it('carries none of the colours the provider marked text with', () => {
    const xml = new PizZip(template).file('word/document.xml')!.asText();
    expect(xml).not.toMatch(/w:color w:val="(FF0000|92D050)"/);
  });

  it('refuses to render without the training schedule', () => {
    expect(() => renderDocument(template, { ...data, training: undefined })).toThrow(
      /training\.periodicDuration/
    );
  });
});

describe('decision_risk_evaluation_team', () => {
  it("names the team and the provider's specialist with their title", () => {
    const text = documentText(
      renderDocument(read('1.2_decision_risk_evaluation_team.docx'), {
        ...shared,
        decisionNumber: 2,
        evaluationTeam: people,
        specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
      })
    );

    expect(text).not.toContain('{{');
    expect(text).toContain('Nr.: 2 SSM Din: 19.01.2026');
    expect(text.match(/va îndeplini și funcția de membru al echipei de evaluare/g)).toHaveLength(2);
    expect(text).toContain(
      'Ana IONESCU în calitate de Evaluator de risc SSM din cadrul S.C. SERVICIU EXTERN S.R.L.'
    );
    acknowledged(text);
  });
});

describe('decision_imminent_danger', () => {
  it('names the designated people in each of the five measures', () => {
    const imminentDangerText = people
      .map((person) => `${person.name} având funcția de ${person.jobTitle}`)
      .join(', ');
    const text = documentText(
      renderDocument(read('1.4_decision_imminent_danger.docx'), {
        ...shared,
        decisionNumber: 4,
        workplaceManager: people[0],
        imminentDanger: people,
        imminentDangerText,
      })
    );

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `Ion MARIN în calitate de Manager magazin în cadrul S.C. CLIENT DEMO S.R.L. desemnează următorii lucrători: ${imminentDangerText}, cu următoarele atribuții:`
    );
    // Named once; each of the five measures then refers to them.
    expect(text.split(imminentDangerText)).toHaveLength(2);
    expect(text.match(/: lucrătorii desemnați/g)).toHaveLength(5);
    acknowledged(text);
  });
});

describe('branding', () => {
  const template = read('1.2_decision_risk_evaluation_team.docx');
  const data = {
    ...shared,
    decisionNumber: 2,
    evaluationTeam: people,
    specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
  };
  const footerText = (file: Uint8Array) => {
    const zip = new PizZip(file);
    return Object.keys(zip.files)
      .filter((part) => /word\/footer\d*\.xml/.test(part))
      .map((part) => documentTextOf(zip.file(part)!.asText()));
  };

  it('prints the line in the footer when the merge data asks for it', () => {
    const footers = footerText(renderDocument(template, { ...data, branding: [{}] }));
    expect(new Set(footers)).toEqual(new Set(['Document generat cu SSM Ușor · ssmusor.ro']));
  });

  it('prints nothing when branding is empty or left out, and asks for no value', () => {
    expect(new Set(footerText(renderDocument(template, { ...data, branding: [] })))).toEqual(
      new Set([''])
    );
    expect(new Set(footerText(renderDocument(template, data)))).toEqual(new Set(['']));
  });
});
