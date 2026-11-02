import PizZip from 'pizzip';

import { type AnnexDomain, annexTemplate } from './annex-template';
import { renderDocument, type TemplateData } from './render';

// The shape of `instructionBodySchema` in `@ssm-usor/contracts`, which this package does not
// depend on.
export type AnnexBlock =
  { kind: 'heading'; text: string } | { kind: 'article'; paragraphs: readonly string[] };

export interface AnnexBody {
  blocks: readonly AnnexBlock[];
}

interface AnnexItem {
  marker: string;
  text: string;
}

export interface AnnexParagraph {
  heading: string | false;
  article: { number: number; text: string } | false;
  paragraph: string | false;
  item1: AnnexItem | false;
  item2: AnnexItem | false;
  item3: AnnexItem | false;
}

const marker = /^(\(?\p{Ll}{1,4}\)|\(?\d{1,3}(?:\.\d{1,3})*[.)]|[–—\-•·▪◦●○■►➢✓*])\s+/u;

const alineat = /^\(\d{1,3}\)$/u;

const markerKind = (label: string) =>
  alineat.test(label)
    ? 'alineat'
    : /\d/u.test(label)
      ? 'number'
      : /\p{L}/u.test(label)
        ? 'letter'
        : 'bullet';

const empty: AnnexParagraph = {
  heading: false,
  article: false,
  paragraph: false,
  item1: false,
  item2: false,
  item3: false,
};

// A paragraph that opens with a marker hangs from it, one tier deeper for each kind of marker
// its article met before ("a)" under "1."). An alineat ("(2)") divides the article itself, as
// in the orders the fire-safety annexes copy, so it never hangs under the letters before it.
export function annexParagraphs(body: AnnexBody): AnnexParagraph[] {
  const paragraphs: AnnexParagraph[] = [];
  let number = 0;
  for (const block of body.blocks) {
    if (block.kind === 'heading') {
      paragraphs.push({ ...empty, heading: block.text });
      continue;
    }
    number += 1;
    const [first = '', ...rest] = block.paragraphs;
    paragraphs.push({ ...empty, article: { number, text: first } });
    let tiers: string[] = /^\(1\)\s/u.test(first) ? ['alineat'] : [];
    for (const text of rest) {
      const match = marker.exec(text);
      if (!match) {
        paragraphs.push({ ...empty, paragraph: text });
        continue;
      }
      const kind = markerKind(match[1]!);
      if (kind === 'alineat') tiers = [kind];
      else if (!tiers.includes(kind)) tiers.push(kind);
      const tier = Math.min(tiers.indexOf(kind) + 1, 3) as 1 | 2 | 3;
      paragraphs.push({
        ...empty,
        [`item${tier}`]: { marker: match[1]!, text: text.slice(match[0].length) },
      });
    }
  }
  return paragraphs;
}

// `data` is what the own instructions' header merges (`issueDate`, `provider`, `client`,
// `branding`, and for `psi` `fireSafetyTechnician`) with the annex's `number`, `title` and
// `versionDate`.
export function renderAnnex(domain: AnnexDomain, body: AnnexBody, data: TemplateData): Uint8Array {
  return renderDocument(annexTemplate(domain), { ...data, paragraphs: annexParagraphs(body) });
}

const relationshipTypes = {
  header: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
  footer: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
} as const;

const contentTypes = {
  header: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  footer: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
} as const;

const finalSection = /<w:sectPr\b[^>]*>(?:(?!<w:sectPr\b)[\s\S])*?<\/w:sectPr>\s*<\/w:body>/;

function splitBody(xml: string) {
  const open = /<w:body>/.exec(xml);
  const section = finalSection.exec(xml);
  if (!open || !section) throw new Error('A Word document without a body or a final section.');
  const sectPr = section[0].replace(/\s*<\/w:body>$/, '');
  return {
    before: xml.slice(0, open.index + open[0].length),
    content: xml.slice(open.index + open[0].length, section.index),
    sectPr,
    after: xml.slice(section.index + sectPr.length),
  };
}

// A section ends with the paragraph that holds its properties.
function closeSection(content: string, sectPr: string) {
  const last = /<w:p\b(?:(?!<w:p\b)[\s\S])*<\/w:p>\s*$/.exec(content);
  if (!last || /<w:sectPr\b/.test(last[0])) return `${content}<w:p><w:pPr>${sectPr}</w:pPr></w:p>`;
  const paragraph = last[0];
  const closed = /<w:pPr>[\s\S]*?<\/w:pPr>/.test(paragraph)
    ? paragraph.replace(/<\/w:pPr>/, `${sectPr}</w:pPr>`)
    : paragraph.replace(/^(<w:p\b[^>]*?)(\/?)>/, (_, open: string, selfClosing: string) =>
        selfClosing ? `${open}><w:pPr>${sectPr}</w:pPr></w:p>` : `${open}><w:pPr>${sectPr}</w:pPr>`
      );
  return content.slice(0, last.index) + closed;
}

function relationshipTargets(rels: string) {
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[0])?.[1];
    if (id && target) targets.set(id, target);
  }
  return targets;
}

function stylesById(styles: string) {
  const byId = new Map<string, string>();
  for (const match of styles.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)) {
    const id = /w:styleId="([^"]+)"/.exec(match[0])?.[1];
    if (id) byId.set(id, match[0]);
  }
  return byId;
}

// In one file `NUMPAGES` counts every section's pages. `SECTIONPAGES` counts a section's own,
// but LibreOffice prints it as the number saved in the file, so by default the boxes print
// "Pag. X" without "din Y" (ADR 034, "The Word download").
export type AnnexPageCount = 'section' | 'none';

export function appendAnnexes(
  common: Uint8Array,
  annexes: readonly Uint8Array[],
  { pageCount = 'none' }: { pageCount?: AnnexPageCount } = {}
): Uint8Array {
  if (annexes.length === 0) return common;
  const zip = new PizZip(common);
  const documentXml = zip.file('word/document.xml')!.asText();
  let rels = zip.file('word/_rels/document.xml.rels')!.asText();
  let types = zip.file('[Content_Types].xml')!.asText();
  let styles = zip.file('word/styles.xml')!.asText();
  const knownStyles = stylesById(styles);
  const usedIds = new Set([...rels.matchAll(/\bId="([^"]+)"/g)].map((match) => match[1]!));
  const nextId = () => {
    let index = usedIds.size + 1;
    while (usedIds.has(`rId${index}`)) index += 1;
    usedIds.add(`rId${index}`);
    return `rId${index}`;
  };

  const { before, content, sectPr, after } = splitBody(documentXml);
  if ((documentXml.match(/<w:sectPr\b/g) ?? []).length === 1) {
    const targets = relationshipTargets(rels);
    for (const [, id] of sectPr.matchAll(/<w:headerReference\b[^>]*r:id="([^"]+)"/g)) {
      const part = zip.file(`word/${targets.get(id!)}`);
      if (part) zip.file(part.name, countSectionPages(part.asText(), pageCount));
    }
  }
  let body = closeSection(content, sectPr);
  let lastSection = '';

  annexes.forEach((annex, annexIndex) => {
    const annexZip = new PizZip(annex);
    const annexTargets = relationshipTargets(
      annexZip.file('word/_rels/document.xml.rels')!.asText()
    );
    const parts = splitBody(annexZip.file('word/document.xml')!.asText());
    const copied = new Map<string, string>();
    const sectionXml = parts.sectPr.replace(
      /<w:(header|footer)Reference\b([^>]*?)r:id="([^"]+)"([^>]*)\/>/g,
      (_, kind: 'header' | 'footer', head: string, id: string, tail: string) => {
        const target = annexTargets.get(id);
        if (!target) throw new Error(`An annex's ${kind} has no part.`);
        if (annexZip.file(`word/_rels/${target}.rels`)) {
          throw new Error(`An annex's ${kind} refers to other parts, which are not copied.`);
        }
        let newId = copied.get(target);
        if (!newId) {
          newId = nextId();
          copied.set(target, newId);
          const name = `annex${annexIndex + 1}-${target.replace(/^.*\//, '')}`;
          let xml = annexZip.file(`word/${target}`)!.asText();
          if (kind === 'header') xml = countSectionPages(xml, pageCount);
          zip.file(`word/${name}`, xml);
          rels = rels.replace(
            /<\/Relationships>/,
            `<Relationship Id="${newId}" Type="${relationshipTypes[kind]}" Target="${name}"/></Relationships>`
          );
          types = types.replace(
            /<\/Types>/,
            `<Override PartName="/word/${name}" ContentType="${contentTypes[kind]}"/></Types>`
          );
        }
        return `<w:${kind}Reference${head}r:id="${newId}"${tail}/>`;
      }
    );
    const section = everyPageType(restartPages(sectionXml));

    for (const [id, style] of stylesById(annexZip.file('word/styles.xml')!.asText())) {
      if (knownStyles.has(id)) continue;
      knownStyles.set(id, style);
      styles = styles.replace(/<\/w:styles>/, `${style}</w:styles>`);
    }

    if (lastSection) body = closeSection(body, lastSection);
    body += parts.content;
    lastSection = section;
  });

  zip.file('word/document.xml', `${before}${body}${lastSection}${after}`);
  zip.file('word/_rels/document.xml.rels', rels);
  zip.file('[Content_Types].xml', types);
  zip.file('word/styles.xml', styles);
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

function countSectionPages(header: string, pageCount: AnnexPageCount) {
  if (pageCount === 'section') {
    return header.replace(/(<w:instrText\b[^>]*>\s*)NUMPAGES\b/g, '$1SECTIONPAGES');
  }
  return header.replace(
    /<w:r\b(?:(?!<w:r\b)[\s\S])*?<w:t\b[^>]*>\s*din\s*<\/w:t><\/w:r>[\s\S]*?<w:instrText\b[^>]*>\s*NUMPAGES\b[\s\S]*?<w:fldChar w:fldCharType="end"\/><\/w:r>/g,
    ''
  );
}

function restartPages(sectPr: string) {
  if (/<w:pgNumType\b/.test(sectPr)) {
    return sectPr.replace(/<w:pgNumType\b([^>]*?)\/>/, (_, attributes: string) => {
      const kept = attributes.replace(/\s+w:start="\d+"/, '');
      return `<w:pgNumType${kept} w:start="1"/>`;
    });
  }
  return sectPr.replace(/(<w:pgMar\b[^>]*\/>)/, '$1<w:pgNumType w:start="1"/>');
}

// A section without a header of a kind takes the one before it, the common part's.
function everyPageType(sectPr: string) {
  let section = sectPr;
  for (const kind of ['header', 'footer'] as const) {
    const reference = new RegExp(`<w:${kind}Reference\\b[^>]*w:type="default"[^>]*/>`).exec(
      section
    );
    if (!reference) continue;
    for (const type of ['even', 'first']) {
      if (new RegExp(`<w:${kind}Reference\\b[^>]*w:type="${type}"`).test(section)) continue;
      section = section.replace(
        reference[0],
        `${reference[0]}${reference[0].replace('w:type="default"', `w:type="${type}"`)}`
      );
    }
  }
  return section;
}
