import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { psiAnnexData, psiAnnexSample, ssmAnnexData, ssmAnnexSample } from '../tools/annex-samples';
import { annexParagraphs, appendAnnexes, renderAnnex } from './annex';
import { annexTemplate } from './annex-template';
import { TemplateError, templatePlaceholders } from './render';

const templatesUrl = new URL('../templates/', import.meta.url);
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, templatesUrl)));

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
const paragraphTexts = (xml: string) =>
  (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((paragraph) =>
    decode(
      [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)]
        .map((match) => match[1] ?? '\t')
        .join('')
    )
  );
const part = (file: Uint8Array, name: string) => new PizZip(file).file(name)!.asText();
const headerParts = (file: Uint8Array) =>
  Object.keys(new PizZip(file).files).filter((name) => /^word\/[\w-]*header\d*\.xml$/.test(name));

describe('annexParagraphs', () => {
  it('numbers the articles by their place and never the headings', () => {
    const paragraphs = annexParagraphs({
      blocks: [
        { kind: 'heading', text: 'Domeniul de aplicare' },
        { kind: 'article', paragraphs: ['Prima regulă.'] },
        { kind: 'heading', text: 'Acțiuni interzise' },
        { kind: 'article', paragraphs: ['A doua regulă.', 'Explicația ei.'] },
      ],
    });
    expect(
      paragraphs.map((paragraph) => paragraph.heading || paragraph.article || paragraph.paragraph)
    ).toEqual([
      'Domeniul de aplicare',
      { number: 1, text: 'Prima regulă.' },
      'Acțiuni interzise',
      { number: 2, text: 'A doua regulă.' },
      'Explicația ei.',
    ]);
  });

  it('hangs a paragraph from its marker, letters under numbers one tier deeper', () => {
    const [, ...items] = annexParagraphs({
      blocks: [
        {
          kind: 'article',
          paragraphs: [
            'Se verifică:',
            '1. cablul;',
            'a) izolația;',
            'b)   ștecherul;',
            '2. apărătoarea;',
            '– fixarea ei.',
            'Fără marcaj.',
          ],
        },
        { kind: 'article', paragraphs: ['Se interzice:', 'a) fumatul;', '• focul deschis.'] },
      ],
    });
    const tiers = items.map((item) =>
      item.item1
        ? [1, item.item1]
        : item.item2
          ? [2, item.item2]
          : item.item3
            ? [3, item.item3]
            : item.article
              ? ['article', item.article.text]
              : ['paragraph', item.paragraph]
    );
    expect(tiers).toEqual([
      [1, { marker: '1.', text: 'cablul;' }],
      [2, { marker: 'a)', text: 'izolația;' }],
      [2, { marker: 'b)', text: 'ștecherul;' }],
      [1, { marker: '2.', text: 'apărătoarea;' }],
      [3, { marker: '–', text: 'fixarea ei.' }],
      ['paragraph', 'Fără marcaj.'],
      ['article', 'Se interzice:'],
      [1, { marker: 'a)', text: 'fumatul;' }],
      [2, { marker: '•', text: 'focul deschis.' }],
    ]);
  });
});

describe.each([
  {
    domain: 'ssm' as const,
    code: 'IPSSM',
    prefix: 'I.P.S.S.M.',
    of: 'securității și sănătății în muncă',
  },
  { domain: 'psi' as const, code: 'IPSU', prefix: 'I.P.S.U.', of: 'situațiilor de urgență' },
])('the $domain annex template', ({ domain, code, prefix, of }) => {
  const template = annexTemplate(domain);
  const sample = domain === 'ssm' ? ssmAnnexSample : psiAnnexSample;
  const data = domain === 'ssm' ? ssmAnnexData : psiAnnexData;
  const rendered = renderAnnex(domain, sample, data);

  it('asks for the header of the own instructions, the annex and its paragraphs', () => {
    expect(templatePlaceholders(template)).toEqual(
      [
        '.',
        'branding',
        'client.legalName',
        'client.representativeName',
        'client.representativeRole',
        ...(domain === 'psi' ? ['fireSafetyTechnician.name'] : []),
        'issueDate',
        'marker',
        'number',
        'paragraphs',
        'provider.legalName',
        ...(domain === 'ssm' ? ['provider.representativeName', 'provider.representativeRole'] : []),
        'text',
        'title',
        'versionDate',
        'article',
        'heading',
        'item1',
        'item2',
        'item3',
        'paragraph',
      ]
        .filter((name) => name !== '.')
        .sort()
    );
  });

  it('prints the title page, then the text, then the acts it rests on', () => {
    const texts = paragraphTexts(part(rendered, 'word/document.xml')).filter(Boolean);
    expect(texts.slice(0, 4)).toEqual([
      `ANEXA ${data.number}`,
      `la Instrucțiunile proprii în domeniul ${of}`,
      `${prefix} ${data.title}`,
      `versiunea din ${data.versionDate}`,
    ]);
    expect(texts[4]).toBe('Domeniul de aplicare');
    expect(texts[5]).toMatch(/^Art\. 1\. Prezenta instrucțiune se aplică /);
    expect(texts.at(-1)).toMatch(
      domain === 'ssm'
        ? /^Acte normative avute în vedere: Legea nr\. 319\/2006 .* H\.G\. nr\. 1425\/2006\.$/
        : /^Acte normative avute în vedere: Legea nr\. 307\/2006 .* O\.M\.A\.I\. nr\. 163\/2007\.$/
    );
    const articles = texts.filter((text) => /^Art\. \d+\./.test(text));
    expect(articles).toHaveLength(sample.blocks.filter((block) => block.kind === 'article').length);
    expect(articles.at(-1)).toMatch(new RegExp(`^Art\\. ${articles.length}\\. `));
  });

  it('starts the text on a page of its own', () => {
    const xml = part(rendered, 'word/document.xml');
    const breakAt = xml.indexOf('<w:br w:type="page"/>');
    expect(breakAt).toBeGreaterThan(xml.indexOf('versiunea din'));
    expect(breakAt).toBeLessThan(xml.indexOf('Domeniul de aplicare'));
  });

  it('sets "Art. N." in bold and hangs a marked paragraph from its marker', () => {
    const xml = part(rendered, 'word/document.xml');
    expect(xml).toMatch(/<w:b\/><\/w:rPr><w:t[^>]*>Art\. 1\.<\/w:t>/);
    expect(xml).toMatch(/<w:pStyle w:val="AnnexItem1"\/>[\s\S]*?<w:t[^>]*>a\)<\/w:t><w:tab\/>/);
    const styles = part(rendered, 'word/styles.xml');
    expect(styles).toMatch(
      /w:styleId="AnnexItem1">[\s\S]*?<w:ind w:hanging="360" w:left="360"\/><w:jc w:val="both"\/>/
    );
    expect(styles).toMatch(/w:styleId="AnnexArticle">[\s\S]*?<w:jc w:val="both"\/>/);
  });

  it('names the annex in its header and counts its pages within it', () => {
    for (const name of headerParts(rendered)) {
      const text = paragraphTexts(part(rendered, name)).join('|');
      expect(text).toContain(`Cod document:|${code}`);
      expect(text).toContain(
        `Anexa ${data.number} la Instrucțiunile proprii în domeniul ${of}:|${prefix} ${data.title} · versiunea din ${data.versionDate}`
      );
      expect(text).toMatch(new RegExp(`Anexa ${data.number}\\|Pag\\. \\d+ din \\d+`));
      expect(part(rendered, name)).toMatch(/<w:instrText[^>]*> PAGE <[\s\S]*> NUMPAGES </);
      if (domain === 'psi') expect(text).toContain('Cadru tehnic PSI|Mihai STANCU');
    }
  });

  it('carries the same box of document details as the common part', () => {
    const firstRow = (file: Uint8Array) =>
      paragraphTexts(part(file, 'word/header1.xml').split('</w:tr>')[0]!).join('|');
    const common = read(
      domain === 'ssm' ? '3.2_own_instructions.docx' : 'fire/2.1_fire_own_instructions.docx'
    );
    expect(firstRow(template)).toBe(firstRow(common));
  });

  it('closes every page with the branding line, as the flag says', () => {
    const footer = (file: Uint8Array) => paragraphTexts(part(file, 'word/footer1.xml')).join('');
    expect(footer(rendered)).toBe('Document generat cu SSM Ușor · ssmusor.ro');
    expect(footer(renderAnnex(domain, sample, { ...data, branding: false }))).toBe('');
  });

  it('keeps what a member typed as text, never as markup', () => {
    const typed = renderAnnex(
      domain,
      { blocks: [{ kind: 'article', paragraphs: ['Tensiune < 50 V & curent {{mic}}.'] }] },
      data
    );
    expect(paragraphTexts(part(typed, 'word/document.xml'))).toContain(
      'Art. 1. Tensiune < 50 V & curent {{mic}}.'
    );
  });

  it('refuses to render without the annex it prints', () => {
    expect(() => renderAnnex(domain, sample, { ...data, versionDate: undefined })).toThrow(
      TemplateError
    );
  });
});

describe('appendAnnexes', () => {
  const common = read('3.2_own_instructions.docx');
  const annexes = [
    renderAnnex('ssm', ssmAnnexSample, ssmAnnexData),
    renderAnnex('ssm', ssmAnnexSample, { ...ssmAnnexData, number: 3, title: 'Ajutor de bucătar' }),
  ];
  const merged = appendAnnexes(common, annexes);
  const documentXml = part(merged, 'word/document.xml');
  const sections = documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? [];

  it('returns the common part alone when no module is annexed', () => {
    expect(appendAnnexes(common, [])).toBe(common);
  });

  it('keeps the common part, then each annex as a section of its own', () => {
    expect(sections).toHaveLength(3);
    const texts = paragraphTexts(documentXml);
    const commonTexts = paragraphTexts(part(common, 'word/document.xml'));
    expect(texts.slice(0, commonTexts.length)).toEqual(commonTexts);
    expect(texts.filter((text) => /^ANEXA \d$/.test(text))).toEqual(['ANEXA 2', 'ANEXA 3']);
    expect(documentXml.match(/<w:body>/g)).toHaveLength(1);
    expect(documentXml.trimEnd()).toMatch(/<\/w:sectPr><\/w:body><\/w:document>$/);
  });

  it('numbers the pages of each annex from 1 under its own header and footer', () => {
    const rels = part(merged, 'word/_rels/document.xml.rels');
    const types = part(merged, '[Content_Types].xml');
    const commonHeaders = new Set(
      [...sections[0]!.matchAll(/<w:headerReference\b[^>]*r:id="([^"]+)"/g)].map(
        (match) => match[1]
      )
    );
    for (const [index, section] of sections.slice(1).entries()) {
      expect(section).toMatch(/<w:pgNumType\b[^>]*w:start="1"/);
      expect(section).toMatch(/<w:type w:val="nextPage"\/>/);
      for (const type of ['default', 'even', 'first']) {
        for (const kind of ['header', 'footer']) {
          const id = new RegExp(`<w:${kind}Reference w:type="${type}" r:id="([^"]+)"`).exec(
            section
          )?.[1];
          expect(id).toBeDefined();
          expect(commonHeaders.has(id)).toBe(false);
          const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
          expect(target).toMatch(new RegExp(`^annex${index + 1}-${kind}\\d\\.xml$`));
          expect(types).toContain(`PartName="/word/${target}"`);
          const xml = part(merged, `word/${target}`);
          if (kind === 'header') {
            expect(paragraphTexts(xml).join('|')).toContain(`Anexa ${index + 2}|Pag. `);
          }
        }
      }
    }
    expect(sections[0]).not.toMatch(/w:start=/);
  });

  it('prints "Pag. X" alone, since the converter cannot count a section\'s pages', () => {
    for (const name of headerParts(merged)) {
      const xml = part(merged, name);
      expect(xml).not.toMatch(/NUMPAGES|SECTIONPAGES/);
      expect(xml).toMatch(/> PAGE </);
      expect(paragraphTexts(xml).join('|')).toMatch(/\|Pag\. \d+\|?$/);
    }
  });

  it("counts each section's pages with SECTIONPAGES when asked to", () => {
    const counted = appendAnnexes(common, annexes, { pageCount: 'section' });
    for (const name of headerParts(counted)) {
      const xml = part(counted, name);
      expect(xml).not.toMatch(/NUMPAGES/);
      expect(xml).toMatch(/> SECTIONPAGES </);
    }
  });

  it('brings the annex styles the common part lacks, once', () => {
    const styles = part(merged, 'word/styles.xml');
    for (const id of ['AnnexHeading', 'AnnexArticle', 'AnnexItem1', 'AnnexActs']) {
      expect(styles.match(new RegExp(`w:styleId="${id}"`, 'g'))).toHaveLength(1);
    }
  });
});

const converter = process.env.GOTENBERG_URL;
const pageCount = (pdf: Uint8Array) =>
  new TextDecoder('latin1').decode(pdf).match(/\/Type\s*\/Page\b/g)?.length ?? 0;
async function convert(docx: Uint8Array) {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)]), 'document.docx');
  // LibreOffice adds an empty page before a section that restarts at 1 on an even page.
  form.append('skipEmptyPages', 'true');
  const response = await fetch(`${converter}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
  });
  expect(response.ok).toBe(true);
  return new Uint8Array(await response.arrayBuffer());
}

describe.skipIf(!converter)('the converter', () => {
  it('prints the sample annexes on their pages: a title page, then the text', async () => {
    expect(pageCount(await convert(renderAnnex('ssm', ssmAnnexSample, ssmAnnexData)))).toBe(3);
    expect(pageCount(await convert(renderAnnex('psi', psiAnnexSample, psiAnnexData)))).toBe(2);
  }, 60_000);

  it('opens a common part with annexes appended, each on pages of its own', async () => {
    const common = read('3.2_own_instructions.docx');
    const annex = renderAnnex('ssm', ssmAnnexSample, ssmAnnexData);
    const pages = pageCount(await convert(common));
    expect(pageCount(await convert(appendAnnexes(common, [annex, annex])))).toBe(pages + 6);
  }, 120_000);
});
