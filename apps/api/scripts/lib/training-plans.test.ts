import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { hiringMinutes, hiringPlans } from '../../src/modules/trainings/proposal';

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);

function paragraphs(file: string) {
  const xml = new PizZip(readFileSync(new URL(file, templatesUrl)))
    .file('word/document.xml')!
    .asText();
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((paragraph) => {
    let text = '';
    paragraph.replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, (_, run: string) => {
      text += run;
      return '';
    });
    return text.replace(/\u00a0/g, ' ').trim();
  });
}

const totals = (lines: string[]) =>
  lines.flatMap((line, index) => (line === 'TIMP TOTAL DE INSTRUIRE' ? [lines[index + 1]] : []));

describe('the hiring plans a training held is proposed from', () => {
  it('are the content lines and durations of the training themes 4.2', () => {
    const text = paragraphs('4.2_training_themes.docx');
    expect(text.join('\n')).toContain(
      `CONȚINUTUL MATERIALULUI DE INSTRUIRE: ${hiringPlans.ssm.introductoryGeneral}`
    );
    expect(text.join('\n')).toContain(
      `CONȚINUTUL MATERIALULUI DE INSTRUIRE: ${hiringPlans.ssm.workplaceOpening}{{#modules}}{{citation}}; {{/modules}}${hiringPlans.ssm.workplaceClosing}`
    );
    expect(totals(text)).toEqual([`${hiringMinutes.ssm} min`, `${hiringMinutes.ssm} min`]);
  });

  it('are the content lines and durations of the fire-safety training themes 3.1', () => {
    const text = paragraphs('fire/3.1_fire_training_themes.docx');
    expect(text).toContain(
      `CONȚINUTUL MATERIALULUI DE INSTRUIRE: ${hiringPlans.psi.introductoryGeneral}`
    );
    expect(text).toContain(
      `CONȚINUTUL MATERIALULUI DE INSTRUIRE: ${hiringPlans.psi.workplaceOpening} (Decizia nr. {{fire.decisionNumbers.instructions}})${hiringPlans.psi.workplaceClosing}`
    );
    expect(totals(text)).toEqual([`${hiringMinutes.psi} min`, `${hiringMinutes.psi} min`]);
  });
});
