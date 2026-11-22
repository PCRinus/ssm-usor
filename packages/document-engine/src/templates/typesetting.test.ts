import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { annexTemplate } from '../annex-template';
import { signingTypeKeys } from '../signing';
import { documentText } from '../text';
import { bodyOf, decisionFiles, documentTextOf, entries, read, typesetFiles } from './read';

const suSheet = 'fire/fisa_instructaj_su.docx';

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

  // The in-app editor evaluates a page field only when its code is the bare keyword; the
  // "\\* ARABIC" LibreOffice spells out makes it paint the cached result on every page.
  it.each(typesetFiles)('%s writes its page fields without a format switch', (name) => {
    const zip = new PizZip(read(name));
    const parts = Object.keys(zip.files).filter((file) =>
      /^word\/(header|footer)\d*\.xml$/.test(file)
    );
    const codes = parts.flatMap(
      (part) =>
        zip
          .file(part)!
          .asText()
          .match(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g) ?? []
    );
    expect(codes.filter((code) => /PAGE/.test(code) && /\\\*/.test(code))).toEqual([]);
  });

  it.each(typesetFiles)('%s numbers its pages through, without a restart', (name) => {
    expect(bodyOf(name)).not.toMatch(/<w:pgNumType\b[^>]*w:start=/);
  });

  it.each(typesetFiles)(
    '%s aligns nothing with spaces and spaces nothing with empty paragraphs',
    (name) => {
      // A table cell or a text box may be empty; a paragraph that holds a picture is not, and a
      // formula counts as text. A table of contents is empty until the merge writes its entries.
      const body = bodyOf(name)
        .replace(/<m:oMath(Para)?[ >][\s\S]*?<\/m:oMath\1>/g, '<w:t>x</w:t>')
        .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '<w:tbl/>')
        .replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, '')
        .replace(/<w:sdt>(?:(?!<\/w:sdt>)[\s\S])*?Table of Contents[\s\S]*?<\/w:sdt>/g, '');
      const texts = paragraphsOf(body).map(documentTextOf);
      expect(texts.filter((text) => /^[ \u00a0\t]/.test(text))).toEqual([]);
      // Loop tags stand alone in a paragraph. The only empty paragraphs are the ones Word needs
      // after a table: at the end, or between two tables that would otherwise be saved as one;
      // a page break that a section prints for some items of a loop only; and an article's
      // "Art. N." on a line of its own, which prints its number.
      // The fire-safety sheet's cover back opens on a spacer of exact height that places its
      // warning low: LibreOffice drops the space above a paragraph at the top of a page.
      const empty = paragraphsOf(body).filter(
        (paragraph) =>
          documentTextOf(paragraph).trim() === '' &&
          !(
            name === suSheet &&
            /<w:pageBreakBefore(?: w:val="true")?\/>[\s\S]*w:lineRule="exact"/.test(paragraph)
          ) &&
          !/<w:numPr>/.test(paragraph) &&
          !/<w:drawing|<w:object|<w:pict|<mc:AlternateContent|<w:br w:type="page"\/>/.test(
            paragraph
          )
      );
      // Or set at 1 pt, where it takes no room: one original cannot be saved without them.
      for (const paragraph of empty.filter((item) => !item.includes('<w:sz w:val="2"/>'))) {
        expect(body.slice(0, body.indexOf(paragraph)).trimEnd()).toMatch(/<w:tbl\/>$/);
      }
    }
  );

  // The outline is what the contents, the PDF's bookmarks and the editor's navigation list:
  // the originals set long runs of articles in the heading styles.
  it.each([
    ['11.1_employer_briefing.docx', 19],
    ['2.1_general_training_material.docx', 19],
    ['3.1_own_instructions.docx', 21],
    ['9.1_risk_assessment.docx', 20],
    ['fire/2.1_fire_own_instructions.docx', 25],
  ] as const)('%s has a table of contents, and its %i headings are its titles', (name, count) => {
    const body = bodyOf(name);
    expect(body.match(/<w:docPartGallery w:val="Table of Contents"\/>/g)).toHaveLength(1);
    const headings = paragraphsOf(body)
      .filter((paragraph) => /<w:pStyle w:val="Heading\d"\/>/.test(paragraph))
      .map(documentTextOf);
    expect(headings).toHaveLength(count);
    for (const heading of headings) {
      expect(heading).toMatch(
        name.startsWith('fire/')
          ? /^Capitolul [IVXLC]+\.|^BIBLIOGRAFIE$/
          : /^(Subc|C)apitolul [IVXLC]+\.[IVXLC.{}a-z]* \p{Lu}|^Anexa Nr\. \d\.|^Bibliografie$/u
      );
    }
    expect(body).not.toContain('<w:outlineLvl');
  });

  it.each(typesetFiles)('%s uses one font, the body and title sizes, and Romanian', (name) => {
    const xml = bodyOf(name);
    // The back of the fire-safety sheet's cover holds the model's warning alone, set large.
    const sized =
      name === suSheet
        ? xml.replace(
            /<w:p\b(?:(?!<\/w:p>)[\s\S])*?(?:ATENȚIE!|Nicio persoană nu va fi admisă la lucru)[\s\S]*?<\/w:p>/g,
            ''
          )
        : xml;
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
        ...sized.matchAll(
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
    // 10 pt body; 12 pt document titles and chapters, 11 pt subchapters; 14 and 16 pt on a
    // cover page. Smaller only inside a table too wide for the body size and for the label of a
    // signing space, never for a heading over running text.
    expect([...sizes].filter((size) => ![7, 8, 9, 10, 11, 12, 14, 16].includes(size))).toEqual([]);
    const outsideTables = sized
      .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '')
      .replace(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?>semnătura și ștampila<\/w:t><\/w:r><\/w:p>/g, '');
    expect(outsideTables).not.toMatch(
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(14|16|18)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/
    );
    expect([...languages]).toEqual(['ro-RO']);
  });

  // A label takes its size from its list level, or without one from its paragraph's end mark,
  // which the originals left at 9 pt under 10 pt text.
  it.each(typesetFiles)(
    '%s prints its list labels at the size of their text, and its dashes as en dashes in Arial',
    (name) => {
      const zip = new PizZip(read(name));
      const numbering = zip.file('word/numbering.xml')?.asText() ?? '';
      const abstractOf = new Map(
        [
          ...numbering.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g),
        ].map(([, num, abstract]) => [num!, abstract!])
      );
      const levels = new Map(
        [
          ...numbering.matchAll(
            /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g
          ),
        ].flatMap(([, abstract, body = '']) =>
          [...body.matchAll(/<w:lvl w:ilvl="(\d)"[^>]*>([\s\S]*?)<\/w:lvl>/g)].map(
            ([, level, definition = '']) => [`${abstract}/${level}`, definition] as const
          )
        )
      );
      const sizeOf = (properties = '') => /<w:sz w:val="(\d+)"\/>/.exec(properties)?.[1];
      const mismatched: string[] = [];
      for (const paragraph of bodyOf(name).match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
        const properties = /^<w:p\b[^>]*>\s*(<w:pPr>[\s\S]*?<\/w:pPr>)/.exec(paragraph)?.[1] ?? '';
        const num = /<w:numId w:val="(\d+)"/.exec(properties)?.[1];
        const level = levels.get(
          `${abstractOf.get(num ?? '')}/${/<w:ilvl w:val="(\d)"/.exec(properties)?.[1] ?? '0'}`
        );
        const text = /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >][^<]/.exec(
          paragraph.slice(paragraph.indexOf(properties) + properties.length)
        )?.[0];
        if (!level || !text || /<w:lvlText w:val=""\/>/.test(level)) continue;
        const label =
          sizeOf(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(level)?.[1]) ??
          sizeOf(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(properties)?.[1]);
        const dashFont = /<w:lvlText w:val="[-–]"\/>/.test(level)
          ? /<w:rFonts [^>]*w:ascii="([^"]+)"/.exec(level)?.[1]
          : undefined;
        if (
          (label && label !== sizeOf(text)) ||
          /<w:lvlText w:val="-"\/>/.test(level) ||
          (dashFont && dashFont !== 'Arial')
        ) {
          mismatched.push(documentTextOf(paragraph).slice(0, 40));
        }
      }
      expect(mismatched).toEqual([]);
    }
  );

  it.each(typesetFiles)('%s justifies nothing', (name) => {
    // Without hyphenation a justified line opens uneven gaps between words.
    expect(bodyOf(name)).not.toContain('<w:jc w:val="both"/>');
  });

  it.each(typesetFiles)("%s names none of LibreOffice's own fonts in its styles", (name) => {
    // No text uses them, but a viewer without them warns that it shows substitutes.
    const styles = new PizZip(read(name)).file('word/styles.xml')!.asText();
    expect(styles).not.toMatch(/"(Liberation (Serif|Sans)|Noto [^"]*)"/);
  });

  it.each(typesetFiles)('%s has no picture floating at the left between two lines', (name) => {
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

  it.each(typesetFiles)('%s contains no hyperlinks', (name) => {
    // The originals carry dead internal links, and clearing them carelessly wraps all the text
    // in a link to nowhere, which some viewers draw as links.
    expect(bodyOf(name)).not.toContain('<w:hyperlink');
  });

  it.each(typesetFiles)('%s lists in the editor no bookmark that nothing points to', (name) => {
    // The editor's navigation pane lists every bookmark not named with a leading underscore.
    const body = bodyOf(name);
    const named = new Set(
      [
        ...body.matchAll(/\b(?:PAGEREF|REF)\s+"?([^\s"\\]+)|\bHYPERLINK\b[^<]*?\\l\s+"([^"]+)"/g),
      ].map((match) => match[1] ?? match[2])
    );
    const listed = [...body.matchAll(/<w:bookmarkStart\b[^>]*?\bw:name="([^"]*)"/g)]
      .map((match) => match[1]!)
      .filter((bookmark) => !bookmark.startsWith('_') && !named.has(bookmark));
    expect(listed).toEqual([]);
  });

  const sheetHeaders: Record<string, string[]> = {
    'fisa_instruire_ssm.docx': ['Fișa SSM · {{employee.headerName}}Pag. 1 din 1', 'Pag. 1 din 1'],
    'fire/fisa_instructaj_su.docx': ['Fișa SU · {{employee.headerName}}Pag. 1 din 1'],
  };

  it.each(typesetFiles)(
    '%s has the house margins, no header but the document details, and a footer that ends with the branding line',
    (name) => {
      const xml = bodyOf(name);
      // 25 mm for binding and 20 mm elsewhere, in twentieths of a point. The occupational
      // safety set files a landscape page turned in its portrait binder, bound on its top edge:
      // its left margin is 20 mm and its top margin and header 5 mm lower.
      const boundOnTop = (section: string) =>
        !name.startsWith('fire/') && section.includes('w:orient="landscape"');
      const sections = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!;
      for (const section of sections)
        expect(section).toMatch(
          boundOnTop(section)
            ? /<w:pgMar [^>]*w:left="1134"[^>]*w:right="1134"/
            : /<w:pgMar [^>]*w:left="1417"[^>]*w:right="1134"/
        );
      const lower = (section: string) => (boundOnTop(section) ? 283 : 0);
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
      if (decisionFiles.includes(name)) {
        for (const section of sections) {
          expect(section).toMatch(/<w:pgMar [^>]*w:top="1134"/);
          expect(section).toMatch(/<w:pgMar [^>]*w:header="680"/);
        }
        expect([...headers].sort()).toEqual([
          'Decizia nr. {{decisionNumber}} SSM din {{issueDate}} · {{client.legalName}}Pag. 1 din 1',
          'Pag. 1 din 1',
        ]);
      } else if (sheetHeaders[name]) {
        for (const section of sections) {
          expect(section).toMatch(/<w:pgMar [^>]*w:top="1134"/);
          expect(section).toMatch(/<w:pgMar [^>]*w:header="680"/);
        }
        expect([...headers].sort()).toEqual(sheetHeaders[name]);
      } else if (headers.every((text) => text === '')) {
        for (const section of sections)
          expect(section).toMatch(new RegExp(`<w:pgMar [^>]*w:top="${1134 + lower(section)}"`));
      } else {
        for (const section of sections)
          expect(section).toMatch(new RegExp(`<w:pgMar [^>]*w:header="${680 + lower(section)}"`));
        for (const text of headers) {
          expect(text).toContain('Data întocmirii documentului:{{issueDate}}');
          expect(text).toContain('Întocmit pentru:{{client.legalName}}');
          expect(text).toMatch(/Cod document:.+Denumire document:.+(Pag\. |Anexa \{\{number\}\})/);
        }
      }
      const footers = parts.filter((file) => /word\/footer\d*\.xml/.test(file));
      expect(footers.length).toBeGreaterThan(0);
      for (const part of footers) {
        expect(documentTextOf(zip.file(part)!.asText()), part).toMatch(
          /\{\{#branding\}\}Document generat cu SSM Ușor · ssmusor\.ro\{\{\/branding\}\}$/
        );
      }
      // A first page of its own prints no footer unless its section names one for it.
      for (const section of sections.filter((each) =>
        /<w:titlePg(?: w:val="(?:true|1)")?\/>/.test(each)
      ))
        expect(section).toContain('<w:footerReference w:type="first"');
    }
  );

  const keepsNext = (properties: string) => {
    const match = /<w:keepNext(?: w:val="(\w+)")?\/>/.exec(properties);
    return match ? !['false', '0', 'off'].includes(match[1] ?? 'true') : undefined;
  };

  // The Heading styles of the imported files keep with the next paragraph too.
  const keepingOf = (name: string) => {
    const styles = new PizZip(read(name)).file('word/styles.xml')!.asText();
    const definitions = new Map(
      [...styles.matchAll(/<w:style ([^>]*)>([\s\S]*?)<\/w:style>/g)]
        .filter(([, attributes = '']) => attributes.includes('w:type="paragraph"'))
        .map(([, attributes = '', body = '']) => [
          /w:styleId="([^"]+)"/.exec(attributes)![1]!,
          {
            basedOn: /<w:basedOn w:val="([^"]+)"/.exec(body)?.[1],
            own: keepsNext(/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(body)?.[0] ?? ''),
            isDefault: /w:default="(1|true)"/.test(attributes),
          },
        ])
    );
    const styleKeeps = (id: string | undefined, depth = 0): boolean => {
      const style = id === undefined ? undefined : definitions.get(id);
      if (!style || depth > 20) return false;
      return style.own ?? styleKeeps(style.basedOn, depth + 1);
    };
    const defaultStyle = [...definitions].find(([, style]) => style.isDefault)?.[0];
    return (block: string) => {
      if (block.startsWith('<w:tbl>')) return false;
      const style = /<w:pStyle w:val="([^"]+)"/.exec(propertiesOf(block))?.[1] ?? defaultStyle;
      return keepsNext(propertiesOf(block)) ?? styleKeeps(style);
    };
  };
  const propertiesOf = (block: string) =>
    /^<w:p\b[^>]*>\s*<w:pPr>[\s\S]*?<\/w:pPr>/.exec(block)?.[0] ?? '';
  // The originals typed many of their lists' letters and dashes by hand.
  const isListItem = (block: string) =>
    block.startsWith('<w:p') &&
    (propertiesOf(block).includes('<w:numPr>') ||
      /^([a-z]\)|\d{1,2}[.)]\s|[-–•]\s)/.test(documentTextOf(block).trim()));
  const blocksOf = (name: string) =>
    bodyOf(name).match(
      /<w:sdt>[\s\S]*?<\/w:sdt>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g
    ) ?? [];

  // A heading, the paragraph that introduces a table, and a loop tag between them, or more lines
  // as short as a staff category's heading and the lines naming its place, posts and trainer. A
  // longer run moves to the next page whole and leaves most of a page empty before it.
  it.each(typesetFiles)(
    '%s keeps at most three paragraphs in a row with the next, or a few short lines',
    (name) => {
      const paragraphKeeps = keepingOf(name);
      const runs: string[][] = [[]];
      for (const block of blocksOf(name)) {
        if (paragraphKeeps(block)) runs.at(-1)!.push(documentTextOf(block).trim());
        else runs.push([]);
      }
      for (const run of runs.filter((each) => each.length > 3)) {
        expect(run.join('').replace(/\{\{[^}]*\}\}/g, '').length).toBeLessThanOrEqual(400);
      }
    }
  );

  it.each(typesetFiles)('%s keeps a line ending in ":" with the list item after it', (name) => {
    const paragraphKeeps = keepingOf(name);
    const blocks = blocksOf(name);
    const stranded = blocks
      .filter(
        (block, index) =>
          !block.startsWith('<w:tbl>') &&
          documentTextOf(block).trim().endsWith(':') &&
          isListItem(blocks[index + 1] ?? '') &&
          !paragraphKeeps(block)
      )
      .map(documentTextOf);
    expect(stranded).toEqual([]);
  });

  it.each(decisionFiles)(
    '%s keeps a heading, what follows it, and its table on one page',
    (name) => {
      const heading = paragraphsOf(bodyOf(name)).find((paragraph) =>
        documentTextOf(paragraph).includes('PROCES-VERBAL DE LUARE DE CUNOȘTINȚĂ')
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
  const texts = typesetFiles.map((name) => [name, documentText(read(name))] as const);

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

  // A Symbol font's private-use code points (an arrow, a degree sign) print as a gap in Arial.
  it.each(texts)('%s carries no private-use character', (_, text) => {
    expect(text).not.toMatch(/[\uE000-\uF8FF]/);
  });

  it.each(texts)("%s has none of the originals' typos or missing diacritics", (_, text) => {
    expect(text).not.toMatch(
      /instuirii|activitatatilor|deasemeni|deoparte|în tabelului|securitatii|sanatatii|(?<!\p{L})in munca(?!\p{L})|(?<!\p{L})si(?!\p{L})|functia|Subsemnat|laindemana|tinanduse|preventelor|contcteaza|cf\.deciziei|vor hotăra/u
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

// The contracts keep their fonts until they are reviewed.
describe('fonts of both documentation sets', () => {
  const fontFiles: [string, Uint8Array][] = [
    ...entries
      .filter(
        (entry) =>
          (entry.set === 'ssm' || entry.set === 'fire') &&
          entry.typeKey !== signingTypeKeys.agreement
      )
      .map((entry): [string, Uint8Array] => [entry.path, read(entry.path)]),
    ['the annex template', annexTemplate('ssm')],
    ['the fire-safety annex template', annexTemplate('su')],
  ];

  // A style, a list level or the document default naming another font reaches an empty line, a
  // tab or a label, and the in-app editor, which packages Arial only, warns on a device without it.
  it.each(fontFiles)('%s names no font but Arial in any of its parts', (_, bytes) => {
    const zip = new PizZip(bytes);
    const named = new Set<string>();
    for (const part of zip.file(/^word\/.*\.xml$/)) {
      const xml = part.asText();
      for (const [, fonts = ''] of xml.matchAll(/<w:rFonts\b([^>]*)\/>/g)) {
        for (const [, font] of fonts.matchAll(/w:(?:ascii|hAnsi|eastAsia|cs)="([^"]*)"/g)) {
          named.add(font!);
        }
        if (/Theme="/i.test(fonts)) named.add('a theme font');
      }
      for (const [, font] of xml.matchAll(/<w:font w:name="([^"]*)"/g)) named.add(font!);
      for (const [, font] of xml.matchAll(/<a:(?:latin|ea|cs|font)\b[^>]*typeface="([^"]+)"/g)) {
        named.add(font!);
      }
    }
    expect([...named]).toEqual(['Arial']);
    expect(zip.file('word/styles.xml')!.asText()).toMatch(
      /<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"\/>/
    );
  });
});

// tools/import/word_layout.py says why. The fire-safety set and the contracts keep their layout
// until they are reviewed too, but for the fire-safety training sheet, a form drawn like the
// occupational safety one.
describe('Word 2013 layout of the occupational safety set', () => {
  const files: [string, Uint8Array][] = [
    ...entries
      .filter(
        (entry) =>
          (entry.set === 'ssm' && entry.typeKey !== signingTypeKeys.agreement) ||
          entry.path === 'fire/fisa_instructaj_su.docx'
      )
      .map((entry): [string, Uint8Array] => [entry.path, read(entry.path)]),
    ['the annex template', annexTemplate('ssm')],
  ];

  const paragraphsOf = (xml: string) => xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  const ssmFiles = files.filter(([name]) => name.endsWith('.docx'));

  const contents = [
    '2.1_general_training_material.docx',
    '3.1_own_instructions.docx',
    '9.1_risk_assessment.docx',
    '11.1_employer_briefing.docx',
  ];

  it.each(contents)(
    '%s sets a chapter at 12 pt and a subchapter at 11 pt, both centred',
    (name) => {
      const headings = paragraphsOf(bodyOf(name)).filter((paragraph) =>
        /<w:pStyle w:val="Heading[12]"\/>/.test(paragraph)
      );
      expect(headings.length).toBeGreaterThan(0);
      for (const heading of headings) {
        const size = /Heading1/.test(heading) ? 24 : 22;
        expect(heading, documentTextOf(heading)).toContain('<w:jc w:val="center"/>');
        const sizes = [...heading.matchAll(/<w:r>[\s\S]*?<w:sz w:val="(\d+)"\/>[\s\S]*?<\/w:r>/g)];
        expect(new Set(sizes.map((match) => Number(match[1])))).toEqual(new Set([size]));
      }
    }
  );

  const tablesAsLines = (xml: string) => {
    let depth = 0;
    let out = '';
    let from = 0;
    for (const tag of xml.matchAll(/<(\/?)w:tbl>/g)) {
      if (tag[1]) {
        depth -= 1;
        if (depth === 0) from = tag.index + tag[0].length;
      } else {
        if (depth === 0)
          out += `${xml.slice(from, tag.index)}<w:p><w:r><w:t>[tabel]</w:t></w:r></w:p>`;
        depth += 1;
      }
    }
    return out + xml.slice(from);
  };

  it.each(contents)(
    '%s sets a heading nearer its own text than what comes before it, with no empty line beside it',
    (name) => {
      const paragraphs = paragraphsOf(tablesAsLines(bodyOf(name))).filter(
        (paragraph) => !/^(\{\{[#/^][^}]*\}\})+$/.test(documentTextOf(paragraph))
      );
      paragraphs.forEach((paragraph, index) => {
        const level = /<w:pStyle w:val="Heading([12])"\/>/.exec(paragraph)?.[1];
        if (!level) return;
        const previous = paragraphs[index - 1] ?? '';
        const spacing = /<w:spacing\b[^>]*\/>/.exec(paragraph)![0];
        const side = (key: string) => Number(new RegExp(`w:${key}="(\\d+)"`).exec(spacing)?.[1]);
        const sitsRightUnder =
          level === '2'
            ? /<w:pStyle w:val="Heading1"\/>/.test(previous)
            : /<w:sectPr\b/.test(previous);
        const label = documentTextOf(paragraph);
        expect([side('before'), side('after')], label).toEqual(
          level === '1' ? [sitsRightUnder ? 0 : 120, 280] : [sitsRightUnder ? 0 : 240, 160]
        );
        expect(spacing, label).not.toContain('w:line=');
        for (const neighbour of [previous, paragraphs[index + 1] ?? 'x'])
          expect(
            documentTextOf(neighbour).trim() !== '' ||
              /<w:(numPr|sectPr|drawing|br|fldChar)\b/.test(neighbour),
            label
          ).toBe(true);
      });
    }
  );

  it("sets 4.1's typed headings nearer their text, the first chapter with nothing above it", () => {
    const spacing = paragraphsOf(bodyOf('4.1_training_themes.docx'))
      .filter((paragraph) => /^(Sub)?[Cc]apitolul [IVX]+\./u.test(documentTextOf(paragraph)))
      .map((paragraph) => {
        const own = /<w:spacing\b[^>]*\/>/.exec(paragraph)![0];
        const side = (key: string) => Number(new RegExp(`w:${key}="(\\d+)"`).exec(own)![1]);
        return `${documentTextOf(paragraph).split(' ')[0]} ${side('before')}/${side('after')}`;
      });
    expect(spacing).toEqual([
      'Capitolul 0/280',
      'Subcapitolul 240/160',
      'Capitolul 120/280',
      'Subcapitolul 240/160',
      'Capitolul 120/280',
    ]);
  });

  it.each(ssmFiles.map(([name]) => name).filter((name) => !contents.includes(name)))(
    '%s gives none of its paragraphs an outline level, so its PDF has no bookmarks of body text',
    (name) => {
      expect(bodyOf(name)).not.toMatch(/<w:pStyle w:val="Heading\d"\/>|<w:outlineLvl/);
    }
  );

  // The originals set their articles in a copy of a bold 16 pt heading style, which every
  // paragraph that never switched bold off printed whole.
  it.each([
    '2.1_general_training_material.docx',
    '3.1_own_instructions.docx',
    '11.1_employer_briefing.docx',
  ])('%s sets its articles in a regular style, the labels bold on their own', (name) => {
    const styles = new PizZip(read(name)).file('word/styles.xml')!.asText();
    const article = /<w:style\b[^>]*w:styleId="Paragraph1"[^>]*>[\s\S]*?<\/w:style>/.exec(
      styles
    )![0];
    expect(article).not.toMatch(/<w:b\/>|<w:keepNext|<w:sz w:val="32"\/>/);
  });

  it.each(ssmFiles)('%s prints every "(Preluare din …)" note in italic, not bold', (_, bytes) => {
    const body = new PizZip(bytes).file('word/document.xml')!.asText();
    const notes = [
      ...body.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?\(Preluare din(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g),
    ].map((match) => match[0]);
    for (const note of notes) {
      expect(note).toMatch(/<w:i\/>/);
      expect(note).not.toMatch(/<w:b\/>/);
    }
  });

  const numberingOf = (bytes: Uint8Array) =>
    new PizZip(bytes).file('word/numbering.xml')?.asText() ?? '';
  const houseTablesOf = (bytes: Uint8Array) =>
    (
      new PizZip(bytes)
        .file('word/document.xml')!
        .asText()
        .match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []
    ).filter((table) => table.includes('<w:tblStyle w:val="HouseTable"/>'));

  it.each(ssmFiles)('%s marks every bullet with an en dash', (_, bytes) => {
    const bullets = [...numberingOf(bytes).matchAll(/<w:lvl\b[^>]*>([\s\S]*?)<\/w:lvl>/g)]
      .map((match) => match[1]!)
      .filter((level) => level.includes('<w:numFmt w:val="bullet"/>'))
      .map((level) => /<w:lvlText w:val="([^"]*)"/.exec(level)?.[1])
      .filter((glyph) => glyph);
    expect(new Set(bullets)).toEqual(new Set(bullets.length ? ['–'] : []));
  });

  // The sheets fit a training on one page in 7 and 9 pt.
  it.each(ssmFiles.filter(([name]) => !/^(fire\/)?fisa_/.test(name)))(
    "%s sets its house tables at 10 or 8 pt, the registers' headers at 7",
    (name, bytes) => {
      for (const table of houseTablesOf(bytes)) {
        const sizes = (row: string) =>
          [
            ...row.matchAll(
              /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/g
            ),
          ].map((match) => Number(match[1]));
        const rows = table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g)!;
        const header = rows.filter((row) => row.includes('<w:tblHeader/>')).flatMap(sizes);
        const body = rows.filter((row) => !row.includes('<w:tblHeader/>')).flatMap(sizes);
        expect(body.filter((size) => size === 14 || size === 18)).toEqual([]);
        if (name === '7.1_event_registers.docx') expect(new Set(header)).toEqual(new Set([14]));
        else expect(header.filter((size) => size === 14 || size === 18)).toEqual([]);
      }
    }
  );

  it.each(ssmFiles)('%s hangs a dash item of a table cell from its dash', (_, bytes) => {
    const typed = houseTablesOf(bytes).flatMap((table) =>
      (table.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [])
        .map(documentTextOf)
        .filter((text) => /^\s*[–-]\s+\S/.test(text))
    );
    expect(typed).toEqual([]);
  });

  const articleListsOf = (numbering: string) =>
    new Set(
      [...numbering.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g)]
        .filter(([, , abstract]) =>
          new RegExp(
            `w:abstractNumId="${abstract}"[^>]*>\\s*<w:lvl w:ilvl="0"[^>]*>(?:(?!</w:lvl>)[\\s\\S])*?<w:lvlText w:val="Art`
          ).test(numbering)
        )
        .map(([, num]) => num)
    );
  const articleFiles = ssmFiles
    .map(([name]) => name)
    .filter((name) => articleListsOf(numberingOf(read(name))).size > 0);

  it('finds the articles of every document that has them', () => {
    expect(articleFiles).toEqual(
      expect.arrayContaining([
        '1.1_decision_training.docx',
        '2.1_general_training_material.docx',
        '3.1_own_instructions.docx',
        '6_protective_equipment_list.docx',
        '11.1_employer_briefing.docx',
        '12_control_regulation.docx',
        '13_signing_regulation_annex.docx',
      ])
    );
  });

  // 1.27 cm, as the decisions; 1.9 cm where three digits ("Art. 328.") are wider than that.
  it.each(articleFiles)(
    '%s sets "Art. N." on the margin and its text at a tab, its wrapped lines back at the margin',
    (name) => {
      const numbering = numberingOf(read(name));
      const tab = ['2.1_general_training_material.docx', '3.1_own_instructions.docx'].includes(name)
        ? 1080
        : 720;
      const levels = [...numbering.matchAll(/<w:lvl w:ilvl="0"[^>]*>([\s\S]*?)<\/w:lvl>/g)]
        .map((match) => match[1]!)
        .filter((level) => /<w:lvlText w:val="Art\. %1\."\/>/.test(level));
      expect(levels.length).toBeGreaterThan(0);
      for (const level of levels) {
        expect(level).not.toContain('<w:suff ');
        expect(level).toContain(
          `<w:tabs><w:tab w:val="num" w:pos="${tab}"/></w:tabs><w:ind w:left="0" w:hanging="0"/>`
        );
      }
    }
  );

  // tools/import/typography.py, heading_line_of_its_own: an article of numbered paragraphs, or
  // whose first paragraph introduces a list, prints its label and note on a line of their own;
  // in a document with contents, so does one that holds a second paragraph or a table.
  it.each(articleFiles)('%s lays out every article by one rule', (name) => {
    const book = contents.includes(name);
    const body = bodyOf(name).replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '<w:p>TABLE</w:p>');
    const paragraphs = paragraphsOf(body).filter(
      (paragraph) => !/^(\{\{[#/^][^}]*\}\})+$/.test(documentTextOf(paragraph).trim())
    );
    const texts = paragraphs.map((paragraph) => documentTextOf(paragraph).trim());
    const articles = articleListsOf(numberingOf(read(name)));
    const numId = (paragraph: string) => /<w:numId w:val="(\d+)"/.exec(paragraph)?.[1];
    const isArticle = (paragraph: string) =>
      articles.has(numId(paragraph) ?? '') &&
      (/<w:ilvl w:val="(\d+)"/.exec(paragraph)?.[1] ?? '0') === '0';
    // As typography.py's balanced_end: a letter's label ("lit. c) și d))") closes nothing.
    const afterNote = (text: string) => {
      if (!/^\((?:Preluare din|Conform)\b/u.test(text)) return text;
      let depth = 0;
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '(') depth += 1;
        else if (text[index] === ')' && !/(?:^|[\s,])[a-z]$/u.test(text.slice(0, index))) {
          depth -= 1;
          if (depth === 0) return text.slice(index + 1).trimStart();
        }
      }
      return text;
    };
    const wrong: string[] = [];
    paragraphs.forEach((paragraph, index) => {
      if (!isArticle(paragraph)) return;
      const first = afterNote(texts[index]!);
      const rest = paragraphs.slice(index + 1);
      const end = rest.findIndex(
        (each) => isArticle(each) || /<w:pStyle w:val="Heading[12]"\/>/.test(each)
      );
      const alineats = rest
        .slice(0, end === -1 ? undefined : end)
        .some(
          (each) =>
            !(numId(each) !== undefined && numId(each) !== '0') &&
            /^\(\d+\)/.test(afterNote(documentTextOf(each).trim()))
        );
      const next = paragraphs[index + 1] ?? '';
      const isItem = (each: string) =>
        (numId(each) !== undefined && numId(each) !== '0' && !isArticle(each)) ||
        /^([a-z]\)|\d{1,2}[.)]\s|[-–•»▪]\s)/u.test(documentTextOf(each).trim());
      const nextIsItem = numId(next) !== undefined && numId(next) !== '0' && !isArticle(next);
      const more = rest
        .slice(0, end === -1 ? undefined : end)
        .some(
          (each) =>
            each === '<w:p>TABLE</w:p>' || (documentTextOf(each).trim() !== '' && !isItem(each))
        );
      const quotesOnlyItsFirst =
        afterNote(texts[index]!) !== texts[index]! && !/[:;]$/u.test(first);
      const alone =
        (book && first !== '' && more && !quotesOnlyItsFirst) ||
        (first !== '' && alineats) ||
        /^\(\d+\)/.test(first) ||
        /:\s+\(1\)\s/.test(first) ||
        (first.endsWith(':') &&
          (nextIsItem ||
            /^(\(\d+\)|[a-z]\)|[A-Z]\.|\d{1,2}\.)\s/.test(afterNote(texts[index + 1] ?? ''))));
      if (alone) wrong.push(`runs on: ${texts[index]!.slice(0, 80)}`);
      if (first === '' && !/<w:keepNext\/>/.test(paragraph))
        wrong.push(`does not keep with its text: ${texts[index]!.slice(0, 80)}`);
    });
    expect(wrong).toEqual([]);
  });

  // import_templates.py, keep_lead_ins: the merge removes the loop tags between a lead-in and
  // its list, so the lead-in keeps with whatever comes after them.
  it.each(ssmFiles)('%s keeps every line that ends with ":" with the list under it', (_, bytes) => {
    const styles = new PizZip(bytes).file('word/styles.xml')!.asText();
    const keeps = (paragraph: string) => {
      const own = /<w:keepNext(?: w:val="(\w+)")?\/>/.exec(paragraph);
      if (own) return !['false', '0', 'off'].includes(own[1] ?? 'true');
      const style = /<w:pStyle w:val="([^"]+)"\/>/.exec(paragraph)?.[1];
      const definition = style
        ? new RegExp(`w:styleId="${style}"[^>]*>[\\s\\S]*?</w:style>`).exec(styles)?.[0]
        : undefined;
      return /<w:keepNext(?: w:val="(?:true|1|on)")?\/>/.test(definition ?? '');
    };
    const body = new PizZip(bytes)
      .file('word/document.xml')!
      .asText()
      .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '<w:p>TABLE</w:p>');
    const paragraphs = paragraphsOf(body).filter(
      (paragraph) => !/^(\{\{[#/^][^}]*\}\})+$/.test(documentTextOf(paragraph).trim())
    );
    const isItem = (paragraph: string) =>
      /<w:numPr>(?:(?!<\/w:numPr>)[\s\S])*<w:numId w:val="[1-9]/.test(paragraph) ||
      /^\s*(?:[a-z]\)|\d{1,2}[.)]\s|[-–•]\s|\(\d{1,3}\)\s)/.test(
        [...paragraph.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)]
          .map((match) => match[1] ?? ' ')
          .join('')
      );
    const loose = paragraphs
      .filter(
        (paragraph, index) =>
          documentTextOf(paragraph).trim().endsWith(':') &&
          isItem(paragraphs[index + 1] ?? '') &&
          !keeps(paragraph)
      )
      .map((paragraph) => documentTextOf(paragraph).trim().slice(0, 60));
    expect(loose).toEqual([]);
  });

  it("numbers 6's copy of annex 2 to H.G. 1048/2006 and letters what each item protects against", () => {
    const body = bodyOf('6_protective_equipment_list.docx');
    const numbering = numberingOf(read('6_protective_equipment_list.docx'));
    const formatOf = (text: string) => {
      const paragraph = paragraphsOf(body).find((each) => documentTextOf(each).trim() === text)!;
      const num = /<w:numId w:val="(\d+)"\/>/.exec(paragraph)![1];
      const ilvl = /<w:ilvl w:val="(\d)"\/>/.exec(paragraph)?.[1] ?? '0';
      const abstract = new RegExp(
        `<w:num w:numId="${num}"[^>]*>\\s*<w:abstractNumId w:val="(\\d+)"`
      ).exec(numbering)![1];
      return new RegExp(
        `<w:abstractNum\\b[^>]*w:abstractNumId="${abstract}"[^>]*>(?:(?!</w:abstractNum>)[\\s\\S])*?<w:lvl w:ilvl="${ilvl}"[^>]*>(?:(?!</w:lvl>)[\\s\\S])*?<w:lvlText w:val="([^"]*)"`
      ).exec(numbering)![1];
    };
    expect(formatOf('Dispozitive de filtrare împotriva:')).toBe('%1.');
    expect(formatOf('gazelor;')).toBe('%2)');
  });

  // 1., a), – from the outside in (tools/import/typography.py, house_order): a letter's list
  // never holds numbers. The method's nomenclature in 9 keeps the dashes it prints.
  it.each(ssmFiles)('%s never numbers a list under a letter', (name, bytes) => {
    const numbering = numberingOf(bytes);
    const levelOf = (paragraph: string) => {
      const num = /<w:numId w:val="(\d+)"\/>/.exec(paragraph)?.[1];
      if (!num || num === '0') return null;
      const ilvl = /<w:ilvl w:val="(\d)"\/>/.exec(paragraph)?.[1] ?? '0';
      const abstract = new RegExp(
        `<w:num w:numId="${num}"[^>]*>\\s*<w:abstractNumId w:val="(\\d+)"`
      ).exec(numbering)?.[1];
      const level = new RegExp(
        `<w:abstractNum\\b[^>]*w:abstractNumId="${abstract}"[^>]*>(?:(?!</w:abstractNum>)[\\s\\S])*?(<w:lvl w:ilvl="${ilvl}"[^>]*>[\\s\\S]*?</w:lvl>)`
      ).exec(numbering)?.[1];
      if (!level) return null;
      const indent = (xml: string) => /<w:ind w:left="(\d+)" w:hanging="(\d+)"\/>/.exec(xml);
      const own = indent(/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0] ?? '') ?? indent(level);
      return {
        format: /<w:numFmt w:val="(\w+)"\/>/.exec(level)?.[1],
        label: own ? Number(own[1]) - Number(own[2]) : 0,
      };
    };
    const body = new PizZip(bytes).file('word/document.xml')!.asText();
    const wrong: string[] = [];
    let parents: { format?: string; label: number }[] = [];
    for (const paragraph of paragraphsOf(body.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, ''))) {
      const text = documentTextOf(paragraph).trim();
      if (/^(\{\{[#/^][^}]*\}\})+$/.test(text)) continue;
      const level = levelOf(paragraph);
      if (!level) {
        if (text) parents = [];
        continue;
      }
      while (parents.length > 0 && parents.at(-1)!.label >= level.label - 120) parents.pop();
      if (parents.at(-1)?.format === 'lowerLetter' && level.format === 'decimal')
        wrong.push(text.slice(0, 60));
      parents.push(level);
    }
    expect(wrong).toEqual([]);
  });

  it('opens chapter I of 3.1 on the page after its contents', () => {
    const body = bodyOf('3.1_own_instructions.docx');
    const contentsEnd = body.indexOf('</w:sdt>', body.indexOf('Table of Contents'));
    const chapter = paragraphsOf(body.slice(contentsEnd)).find((paragraph) =>
      paragraph.includes('<w:pStyle w:val="Heading1"/>')
    )!;
    expect(chapter).toContain('<w:pageBreakBefore/>');
  });

  it.each([
    '2.1_general_training_material.docx',
    '3.1_own_instructions.docx',
    '9.1_risk_assessment.docx',
    '11.1_employer_briefing.docx',
  ])('%s starts every chapter, annex and bibliography on a page, and no subchapter', (name) => {
    const paragraphs = paragraphsOf(bodyOf(name));
    const pageBreak = /<w:pageBreakBefore(?: w:val="(?:true|1|on)")?\/>/;
    const chapters = paragraphs.filter((paragraph) => paragraph.includes('w:val="Heading1"'));
    expect(chapters.length).toBeGreaterThan(5);
    for (const chapter of chapters) expect(chapter, documentTextOf(chapter)).toMatch(pageBreak);
    const subchapters = paragraphs.filter((paragraph) => paragraph.includes('w:val="Heading2"'));
    expect(subchapters.length).toBeGreaterThan(1);
    for (const subchapter of subchapters) {
      expect(subchapter, documentTextOf(subchapter)).not.toMatch(pageBreak);
    }
  });

  it.each([
    '2.1_general_training_material.docx',
    '9.1_risk_assessment.docx',
    '11.1_employer_briefing.docx',
  ])("%s never leaves a chapter's last short line alone on the page before the next", (name) => {
    const blocks = (
      bodyOf(name).match(
        /<w:sdt>[\s\S]*?<\/w:sdt>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g
      ) ?? []
    ).filter(
      (block) =>
        block.startsWith('<w:sdt') || !/^(\{\{[#/^][^}]*\}\})*$/.test(documentTextOf(block).trim())
    );
    const keeps = /<w:keepNext(?: w:val="(?:true|1|on)")?\/>/;
    let checked = 0;
    blocks.forEach((block, index) => {
      const opensPage =
        block.includes('<w:pageBreakBefore/>') &&
        (block.includes('w:val="Heading1"') || documentTextOf(block) === 'Cuprins');
      if (!opensPage || index < 2) return;
      const [before, last] = [blocks[index - 2]!, blocks[index - 1]!];
      if (
        !before.startsWith('<w:p') ||
        !last.startsWith('<w:p') ||
        documentTextOf(last).length > 90
      )
        return;
      if (last.includes('<w:sectPr') || before.includes('<w:sectPr')) return;
      checked += 1;
      expect(before, documentTextOf(last)).toMatch(keeps);
    });
    expect(checked).toBeGreaterThan(0);
  });

  it.each([
    '2.1_general_training_material.docx',
    '3.1_own_instructions.docx',
    '4.1_training_themes.docx',
    '9.1_risk_assessment.docx',
    '11.1_employer_briefing.docx',
  ])('%s has no empty paragraph right before a chapter that starts a page', (name) => {
    const blocks =
      bodyOf(name).match(
        /<w:sdt>[\s\S]*?<\/w:sdt>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g
      ) ?? [];
    const empty = (block: string) =>
      block.startsWith('<w:p') &&
      !/<w:(?:t|drawing|pict|object|sectPr|bookmarkStart|fldChar|instrText|br)\b|<m:oMath/.test(
        block
      );
    let chapters = 0;
    blocks.forEach((block, index) => {
      if (!block.includes('<w:pageBreakBefore/>')) return;
      chapters += 1;
      expect(empty(blocks[index - 1]!), documentTextOf(block)).toBe(false);
    });
    expect(chapters).toBeGreaterThan(1);
  });

  it("starts 4.1's chapters II and III on a page, chapter I under the document's title", () => {
    const chapters = paragraphsOf(bodyOf('4.1_training_themes.docx')).filter((paragraph) =>
      /^Capitolul [IVX]+\. [A-ZĂÎȘȚÂ][a-zăîșțâ]/.test(documentTextOf(paragraph))
    );
    expect(chapters.map((chapter) => chapter.includes('<w:pageBreakBefore/>'))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it.each([
    '2.1_general_training_material.docx',
    '3.1_own_instructions.docx',
    '11.1_employer_briefing.docx',
  ])('%s sets a list close under its lead-in and its sub-lists a tier deeper', (name) => {
    const paragraphs = paragraphsOf(bodyOf(name)).filter(
      (paragraph) => !/^\{\{[#/^][^}]*\}\}$/.test(documentTextOf(paragraph).trim())
    );
    const after = (paragraph: string) =>
      Number(/<w:spacing\b[^>]*w:after="(\d+)"/.exec(paragraph)?.[1] ?? 0);
    const numbering = numberingOf(read(name));
    const articleLists = new Set(
      [...numbering.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g)]
        .filter(([, , abstract]) =>
          new RegExp(
            `w:abstractNumId="${abstract}"[^>]*>(?:(?!</w:abstractNum>)[\\s\\S])*?<w:lvlText w:val="Art`
          ).test(numbering)
        )
        .map(([, num]) => num)
    );
    const isItem = (paragraph: string) => {
      const num = /<w:numId w:val="(\d+)"/.exec(paragraph)?.[1];
      return num !== undefined && num !== '0' && !articleLists.has(num);
    };
    const loose = paragraphs.filter(
      (paragraph, index) =>
        documentTextOf(paragraph).trim().endsWith(':') &&
        isItem(paragraphs[index + 1] ?? '') &&
        after(paragraph) > 40
    );
    expect(loose.map(documentTextOf)).toEqual([]);
    const evacuation = paragraphs.findIndex((paragraph) =>
      documentTextOf(paragraph).includes('Menținerea în stare de utilizare a tuturor:')
    );
    if (evacuation >= 0)
      expect(paragraphs[evacuation + 1]).toMatch(/<w:ind w:left="1440" w:hanging="360"\/>/);
  });

  it.each(files)('%s is laid out in compatibility mode 15', (_, bytes) => {
    const settings = new PizZip(bytes).file('word/settings.xml')!.asText();
    expect(settings.match(/<w:compatSetting w:name="compatibilityMode"[^>]*>/g)).toEqual([
      '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>',
    ]);
  });

  it.each(files)('%s sets every table on the margins, the header box included', (_, bytes) => {
    const zip = new PizZip(bytes);
    const indents = Object.keys(zip.files)
      .filter((name) => /^word\/[^/]+\.xml$/.test(name))
      .flatMap(
        (name) =>
          zip
            .file(name)!
            .asText()
            .match(/<w:tblInd\b[^>]*>/g) ?? []
      );
    expect(indents.filter((indent) => !/^<w:tblInd w:w="0" w:type="dxa"\/>$/.test(indent))).toEqual(
      []
    );
  });
});

describe('the "Conform …:" notes of 2.1', () => {
  const paragraphs =
    bodyOf('2.1_general_training_material.docx').match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  const runs = (paragraph: string) =>
    (paragraph.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? []).filter((run) => documentTextOf(run));
  const notes = paragraphs.flatMap((paragraph, index) => {
    if (!/^Conform /.test(documentTextOf(paragraph))) return [];
    const passage = [paragraph];
    for (const next of paragraphs.slice(index + 1)) {
      if (!/^(\(\d+\)|[a-z]\)) /.test(documentTextOf(next))) break;
      passage.push(next);
    }
    return [passage];
  });

  it('finds the four notes of chapters XIV and XV', () => {
    expect(notes.map((passage) => passage.length)).toEqual([2, 2, 4, 2]);
  });

  it('sets them on the text margin, only the citation italic and the labels bold', () => {
    for (const [note, ...quoted] of notes) {
      for (const paragraph of [note!, ...quoted]) {
        expect(paragraph).toContain('<w:ind w:left="0" w:hanging="0"/>');
        expect(paragraph).not.toMatch(/<w:numPr>/);
      }
      const [citation, ...rest] = runs(note!);
      expect(documentTextOf(citation!)).toMatch(/^Conform [^:]+:$/);
      expect(citation).toContain('<w:i/>');
      expect(citation).not.toContain('<w:b/>');
      for (const paragraph of [note!, ...quoted]) {
        for (const run of paragraph === note ? rest : runs(paragraph)) {
          expect(run, documentTextOf(run)).not.toContain('<w:i/>');
          const isLabel = /^(\(\d+\)|[a-z]\))$/.test(documentTextOf(run));
          expect(run.includes('<w:b/>'), documentTextOf(run)).toBe(isLabel);
        }
      }
      for (const paragraph of quoted) {
        expect(documentTextOf(runs(paragraph)[0]!)).toMatch(/^(\(\d+\)|[a-z]\))$/);
      }
    }
    expect(documentTextOf(runs(notes[2]![0]!)[2]!)).toBe('(1)');
  });
});
