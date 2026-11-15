import { legalActs } from '@ssm-usor/document-engine/citations';
import { describe, expect, it } from 'vitest';

import { actSubject, bundledActCitations, summarizeCitations } from './act-citations';

describe('actSubject', () => {
  it('keeps what follows the number and the date', () => {
    expect(
      actSubject('Legea nr. 307 din 12 iulie 2006 privind apărarea împotriva incendiilor')
    ).toBe('privind apărarea împotriva incendiilor');
    expect(actSubject('Legea nr. 53 din 24 ianuarie 2003 – Codul muncii')).toBe('Codul muncii');
  });

  it('starts after the second date of an order two ministers signed', () => {
    expect(
      actSubject(
        'Ordinul ministrului muncii nr. 450 din 6 iunie 2006 și al ministrului sănătății publice nr. 825 din 5 iulie 2006 pentru aprobarea Normelor metodologice'
      )
    ).toBe('pentru aprobarea Normelor metodologice');
  });

  it('takes the name before the number when nothing follows the date', () => {
    expect(actSubject('Legea drepturilor pacientului nr. 46 din 21 ianuarie 2003')).toBe(
      'Legea drepturilor pacientului'
    );
  });

  it('gives every bundled act a subject that is neither empty nor half of a title', () => {
    for (const act of legalActs()) {
      const subject = actSubject(act.title);
      expect(subject, act.name).toBeTruthy();
      expect(subject, act.name).not.toMatch(/^(și al|nr\.|din )/);
      expect(subject, act.name).not.toMatch(/ din \d{1,2} [a-z]+ \d{4}/);
    }
  });
});

describe('summarizeCitations', () => {
  const acts = [
    { id: 'lege-319-2006', title: 'Legea nr. 319 din 14 iulie 2006 a securității' },
    { id: 'lege-307-2006', title: 'Legea nr. 307 din 12 iulie 2006 privind incendiile' },
    { id: 'lege-126-1995', title: 'Legea nr. 126 din 27 decembrie 1995 privind explozivii' },
  ];

  it('counts the document types and the quoted passages, and takes the domain from the set', () => {
    const summary = summarizeCitations(acts, [
      {
        act: 'lege-319-2006',
        manifest: 'ssm',
        typeKey: 'general_training_material',
        form: 'quote',
      },
      {
        act: 'lege-319-2006',
        manifest: 'ssm',
        typeKey: 'general_training_material',
        form: 'quote',
      },
      { act: 'lege-319-2006', manifest: 'ssm', typeKey: 'decision_training', form: 'reference' },
      { act: 'lege-319-2006', manifest: 'other', typeKey: 'service_contract', form: 'reference' },
      {
        act: 'lege-307-2006',
        manifest: 'fire',
        typeKey: 'fire_training_material',
        form: 'reference',
      },
      {
        act: 'lege-307-2006',
        manifest: 'ssm',
        typeKey: 'general_training_material',
        form: 'reference',
      },
    ]);

    expect(summary.get('lege-319-2006')).toEqual({
      subject: 'a securității',
      domains: ['ssm'],
      citedIn: { documents: 3, quotes: 2 },
    });
    expect(summary.get('lege-307-2006')).toEqual({
      subject: 'privind incendiile',
      domains: ['ssm', 'su'],
      citedIn: { documents: 2, quotes: 0 },
    });
    expect(summary.get('lege-126-1995')).toEqual({
      subject: 'privind explozivii',
      domains: [],
      citedIn: { documents: 0, quotes: 0 },
    });
  });

  it('summarizes every bundled act once', () => {
    const summary = bundledActCitations();
    expect(summary.size).toBe(legalActs().length);
    expect(bundledActCitations()).toBe(summary);
  });
});
