import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { ssmAnnexData } from '../../tools/annex-samples';
import { previewDocuments } from '../../tools/preview-samples';
import { renderAnnex } from '../annex';
import { templatesUrl } from '../template-store';
import { entries, read } from './read';

// An asterisk opens a footnote ("*) Acest panou …"), never a list.
const otherBullet = /^[\s\u00a0]*[•·▪◦●○■►➢✓»]/u;

function bulletsOf(docx: Uint8Array) {
  const zip = new PizZip(docx);
  const numbering = zip.file('word/numbering.xml')?.asText() ?? '';
  const glyphs = [...numbering.matchAll(/<w:lvl\b[^>]*>([\s\S]*?)<\/w:lvl>/g)]
    .map((match) => match[1]!)
    .filter((level) => level.includes('<w:numFmt w:val="bullet"/>'))
    .map((level) => /<w:lvlText w:val="([^"]*)"/.exec(level)?.[1] ?? '')
    .filter((glyph) => glyph && glyph !== '–');
  const typed = Object.keys(zip.files)
    .filter((name) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name))
    .flatMap(
      (name) =>
        zip
          .file(name)!
          .asText()
          .match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? []
    )
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('')
    )
    .filter((text) => otherBullet.test(text));
  return [...glyphs, ...typed];
}

describe('bullets of the occupational safety set', () => {
  const templates = entries.filter((entry) => entry.set === 'ssm').map((entry) => entry.path);

  it.each(templates)('%s marks its lists with an en dash only', (name) => {
    expect(bulletsOf(read(name))).toEqual([]);
  });

  it('prints an en dash only, once merged', () => {
    const merged = previewDocuments(templatesUrl).documents.filter(
      ({ name }) => !name.includes('/') && templates.includes(name)
    );
    expect(merged.length).toBeGreaterThan(0);
    for (const { name, label, docx } of merged)
      expect(bulletsOf(docx), `${name} ${label}`).toEqual([]);
  });

  it('prints an annex with both kinds of typed list in en dashes', () => {
    const annex = renderAnnex(
      'ssm',
      {
        blocks: [
          {
            kind: 'article',
            paragraphs: [
              'Se verifică:',
              '• cablul;',
              '- ștecherul;',
              '1. apărătoarea:',
              '▪ fixarea ei.',
            ],
          },
        ],
      },
      ssmAnnexData
    );
    expect(bulletsOf(annex)).toEqual([]);
  });
});
