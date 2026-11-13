import { describe, expect, it } from 'vitest';

import { legalActs } from './citation-index';
import { conformLine, normalizeIncoming } from './legal-wording';

const act = (id: string) => legalActs().find((each) => each.id === id)!;
const roadCode = { act: act('oug-195-2002') };
const safetyLaw = { act: act('lege-319-2006') };

describe("the portal's wording in the templates' conventions", () => {
  it('writes ș and ț with a comma, superscripts as characters, an en dash between spaces', () => {
    expect(normalizeIncoming('(1^1) Conducătorii  şi  pasagerii ţin cont ,  art. 5 - 7')).toBe(
      '(1¹) Conducătorii și pasagerii țin cont, art. 5 – 7'
    );
  });

  it('names another act as the templates do', () => {
    expect(
      normalizeIncoming(
        'potrivit Legii nr. 319/2006, Hotărârii Guvernului nr. 1.425/2006 și Ordonanței de urgență a Guvernului nr. 99/2000'
      )
    ).toBe('potrivit Legii 319/2006, H.G. 1425/2006 și O.U.G. 99/2000');
    expect(normalizeIncoming('conform H.G. nr. 355/2007 și O.G. nr. 2/2001')).toBe(
      'conform H.G. 355/2007 și O.G. 2/2001'
    );
  });

  it("keeps the template's diacritics where the portal leaves them out", () => {
    expect(
      conformLine(
        '(1^1) Conducatorii de autovehicule avand locuri prevazute trebuie sa informeze pasagerii.',
        '(1¹) Conducătorii de autovehicule având locuri prevăzute trebuie să informeze pasagerii.',
        roadCode
      )
    ).toEqual({
      text: '(1¹) Conducătorii de autovehicule având locuri prevăzute trebuie să informeze pasagerii.',
      notes: [],
    });
  });

  it('keeps a word the portal changed, even when it differs from the old one by a diacritic', () => {
    expect(
      conformLine(
        '(2) Persoanele au obligația să poarte pe cap cască de protecție omologată.',
        '(2) Persoanele au obligația să poarte casca de protecție omologată.',
        roadCode
      ).text
    ).toBe('(2) Persoanele au obligația să poarte pe cap cască de protecție omologată.');
  });

  it("takes the portal's word, and says so, where a line with diacritics lacks one the template has", () => {
    expect(
      conformLine(
        '(1) Angajatorul ia măsura de protecție colectivă.',
        '(1) Angajatorul ia o măsură de protecție.',
        safetyLaw
      )
    ).toEqual({
      text: '(1) Angajatorul ia măsura de protecție colectivă.',
      notes: [`took the portal's "măsura" where the template wrote "măsură"`],
    });
  });

  it('restores the diacritics the wording pass restores, and lists the words it cannot', () => {
    expect(
      conformLine('Lucratorii trec frontiera numai dupa instruire.', null, {
        ...roadCode,
        dictionary: { lucratorii: 'lucrătorii', dupa: 'după' },
      })
    ).toEqual({
      text: 'Lucrătorii trec frontiera numai după instruire.',
      notes: [
        '"Lucratorii" spelled "Lucrătorii"',
        '"dupa" spelled "după"',
        'written without diacritics, words the template lacks: trec, frontiera, numai, instruire',
      ],
    });
  });

  it("keeps the template's quote marks, and gives new quotes Romanian ones", () => {
    expect(
      conformLine(
        'cu dispozitive tip "mâini libere" sau «căști»',
        'cu dispozitive tip «mâini libere»',
        roadCode
      ).text
    ).toBe('cu dispozitive tip «mâini libere» sau „căști”');
  });

  it('names the act where the portal refers to one of its own articles', () => {
    expect(
      conformLine(
        '(4) Încălcarea art. 36 alin. (2) din prezenta ordonanță de urgență se sancționează.',
        null,
        roadCode
      )
    ).toEqual({
      text: '(4) Încălcarea art. 36 alin. (2) din O.U.G. 195/2002 se sancționează.',
      notes: ['"prezenta ordonanță de urgență" named as "O.U.G. 195/2002"'],
    });
    expect(
      conformLine('Măsurile prevăzute la art. 5 ale prezentei legi se aplică.', null, safetyLaw)
        .text
    ).toBe('Măsurile prevăzute la art. 5 ale Legii 319/2006 se aplică.');
  });

  it('leaves the act naming itself alone outside a reference to an article', () => {
    expect(conformLine('Prezenta lege se aplică în toate sectoarele.', null, safetyLaw).text).toBe(
      'Prezenta lege se aplică în toate sectoarele.'
    );
  });

  it('keeps the name the template gave the act, or the words it kept, at the same place', () => {
    expect(
      conformLine(
        '(2) Dispozițiile prevăzute în prezenta ordonanță de urgență au ca scop siguranța.',
        '(2) Dispozițiile prevăzute în O.U.G. 195/2002 au ca scop siguranța.',
        roadCode
      ).text
    ).toBe('(2) Dispozițiile prevăzute în O.U.G. 195/2002 au ca scop siguranța.');
    expect(
      conformLine(
        '(1) Participanții sunt supuși dispozițiilor din prezenta ordonanță de urgență și ale art. 5 din prezenta ordonanță de urgență.',
        '(1) Participanții sunt supuși dispozițiilor din prezenta ordonanță de urgență.',
        roadCode
      ).text
    ).toBe(
      '(1) Participanții sunt supuși dispozițiilor din prezenta ordonanță de urgență și ale art. 5 din O.U.G. 195/2002.'
    );
  });
});
