import { describe, expect, it } from 'vitest';

import { instructionBodySchema } from './instruction-body';
import { splitInstruction, type SplitterParagraph } from './instruction-splitter';

const paragraph = (text: string, numbered?: SplitterParagraph['numbered']) =>
  numbered ? { text, numbered } : { text };

describe('splitInstruction on pasted text', () => {
  const pasted = [
    'ANEXA 3',
    'Instrucțiuni proprii de securitate și sănătate în muncă',
    'pentru utilizarea mașinii de tocat carne',
    '',
    'Domeniul de aplicare',
    'Art. 1. Prezenta instrucțiune se aplică personalului din bucătărie care folosește mașina de tocat.',
    'Art. 2. Mașina se folosește numai de lucrătorii instruiți.',
    'Înainte de pornire',
    'Art. 3. Lucrătorul verifică:',
    'a) cablul de alimentare și ștecherul;',
    'b) apărătoarea gurii de alimentare;',
    'c) fixarea cuțitului și a sitei.',
    'Art. 4. Se interzice:',
    '– introducerea mâinii în gura de alimentare;',
    '– curățarea mașinii cât timp este în priză.',
  ].join('\n');

  it('drops the label and the title, and keeps the title it found', () => {
    const result = splitInstruction(pasted);
    expect(result.title).toBe(
      'Instrucțiuni proprii de securitate și sănătate în muncă pentru utilizarea mașinii de tocat carne'
    );
  });

  it('makes headings and articles without their numbers, sub-points kept as typed', () => {
    const result = splitInstruction(pasted);
    expect(result.body.blocks).toEqual([
      { kind: 'heading', text: 'Domeniul de aplicare' },
      {
        kind: 'article',
        paragraphs: [
          'Prezenta instrucțiune se aplică personalului din bucătărie care folosește mașina de tocat.',
        ],
      },
      { kind: 'article', paragraphs: ['Mașina se folosește numai de lucrătorii instruiți.'] },
      { kind: 'heading', text: 'Înainte de pornire' },
      {
        kind: 'article',
        paragraphs: [
          'Lucrătorul verifică:',
          'a) cablul de alimentare și ștecherul;',
          'b) apărătoarea gurii de alimentare;',
          'c) fixarea cuțitului și a sitei.',
        ],
      },
      {
        kind: 'article',
        paragraphs: [
          'Se interzice:',
          '– introducerea mâinii în gura de alimentare;',
          '– curățarea mașinii cât timp este în priză.',
        ],
      },
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([1, 2, 3, 4]);
    expect(result.flags).toEqual([]);
    expect(instructionBodySchema.safeParse(result.body).success).toBe(true);
  });

  it('renumbers from 1 and reports the numbers the pack printed', () => {
    const result = splitInstruction(
      [
        'Subcapitolul XIII.VIII. Instrucțiuni proprii la utilizarea polizorului unghiular',
        'Art. 288. Polizorul se folosește cu apărătoarea montată.',
        'Art. 289. Discul se alege după materialul prelucrat.',
        'Articolul 290 – Se poartă ochelari de protecție.',
      ].join('\n')
    );
    expect(result.title).toBe('Instrucțiuni proprii la utilizarea polizorului unghiular');
    expect(result.body.blocks).toEqual([
      { kind: 'article', paragraphs: ['Polizorul se folosește cu apărătoarea montată.'] },
      { kind: 'article', paragraphs: ['Discul se alege după materialul prelucrat.'] },
      { kind: 'article', paragraphs: ['Se poartă ochelari de protecție.'] },
    ]);
    expect(result.articles).toEqual([
      { sourceNumber: 288 },
      { sourceNumber: 289 },
      { sourceNumber: 290 },
    ]);
  });

  it('drops an I.P.S.S.M. or I.P.S.U. label and an annex line', () => {
    expect(
      splitInstruction(
        'I.P.S.S.M. 2. Instrucțiuni proprii privind activitățile recepționerilor de hotel\nArt. 1. Recepționerul păstrează căile de acces libere.'
      )
    ).toMatchObject({
      title: 'Instrucțiuni proprii privind activitățile recepționerilor de hotel',
      body: {
        blocks: [
          { kind: 'article', paragraphs: ['Recepționerul păstrează căile de acces libere.'] },
        ],
      },
    });
    expect(
      splitInstruction(
        'Anexa nr. 2\nla Instrucțiunile proprii în domeniul situațiilor de urgență\nI.P.S.U.\nBirouri\n1. Se interzice fumatul în birouri.\n2. Aparatele electrice se scot din priză la plecare.'
      )
    ).toMatchObject({
      title: null,
      body: {
        blocks: [
          { kind: 'heading', text: 'Birouri' },
          { kind: 'article', paragraphs: ['Se interzice fumatul în birouri.'] },
          { kind: 'article', paragraphs: ['Aparatele electrice se scot din priză la plecare.'] },
        ],
      },
    });
  });

  it('keeps a chapter heading that follows the title, and drops a chapter that is the title', () => {
    expect(
      splitInstruction([
        paragraph(
          'Subcapitolul XIII.IV. Instrucțiuni proprii privind folosirea uscătorului de rufe'
        ),
        paragraph('CAPITOLUL I. Obiective și domeniu de aplicare :'),
        paragraph('Uscătorul se folosește numai cu filtrul curățat.', {
          label: 'Art. 12.',
          level: 0,
        }),
        paragraph('CAPITOLUL II. Reguli la oprire'),
        paragraph('Ușa se deschide după oprirea tamburului.', { label: 'Art. 13.', level: 0 }),
      ])
    ).toMatchObject({
      title: 'Instrucțiuni proprii privind folosirea uscătorului de rufe',
      body: {
        blocks: [
          { kind: 'heading', text: 'CAPITOLUL I. Obiective și domeniu de aplicare :' },
          { kind: 'article' },
          { kind: 'heading', text: 'CAPITOLUL II. Reguli la oprire' },
          { kind: 'article' },
        ],
      },
    });
    expect(
      splitInstruction(
        'Anexa nr. 1\nINSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR ÎN SPĂLĂTORII\nCapitolul I. Scop și domeniu de aplicare\nArt. 1. Spălătoria are stingătoare la intrare.'
      ).body.blocks[0]
    ).toEqual({ kind: 'heading', text: 'Capitolul I. Scop și domeniu de aplicare' });
    expect(
      splitInstruction(
        'CAPITOLUL XIII. Instrucțiuni proprii pentru spălătorie\nCapitolul I. Dispoziții generale\nArt. 1. Spălătoria se aerisește zilnic.'
      )
    ).toMatchObject({
      title: 'Instrucțiuni proprii pentru spălătorie',
      body: { blocks: [{ kind: 'heading', text: 'Capitolul I. Dispoziții generale' }, {}] },
    });
  });

  it('leaves out a printed article with no text, and says which', () => {
    const result = splitInstruction([
      paragraph('Cuțitele se țin în suport.', { label: 'Art. 43.', level: 0, list: '2' }),
      paragraph('', { label: 'Art. 44.', level: 0, list: '2' }),
      paragraph('Plita se curăță rece.', { label: 'Art. 45.', level: 0, list: '2' }),
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([43, 45]);
    expect(result.body.blocks).toHaveLength(2);
    expect(result.flags).toEqual([{ kind: 'empty_article', number: 44 }]);
  });

  it('drops a line that repeats the given title', () => {
    const result = splitInstruction(
      'Scări metalice portabile\nArt. 1. Scara se verifică înainte de folosire.',
      { title: 'Scări metalice portabile' }
    );
    expect(result.title).toBe('Scări metalice portabile');
    expect(result.body.blocks).toHaveLength(1);
  });

  it('keeps a first article that repeats the given title', () => {
    const result = splitInstruction(
      '1. Lucrul la înălțime se execută numai de personal instruit.\n2. Se folosesc centuri.\n3. Se verifică schela.',
      { title: 'Lucrul la înălțime' }
    );
    expect(result.title).toBeNull();
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([1, 2, 3]);
    expect(result.body.blocks[0]).toEqual({
      kind: 'article',
      paragraphs: ['Lucrul la înălțime se execută numai de personal instruit.'],
    });
  });

  it('keeps a cited law article that wraps onto a new line in its sentence', () => {
    const result = splitInstruction(
      [
        'Art. 1. Lucrătorii respectă prevederile din',
        'art. 13 din Legea nr. 319/2006 privind securitatea.',
        'Art. 2. Se aplică și cerințele de la',
        'Art. 1 privind accesul în hală.',
        'Articolul 7 din Legea nr. 307/2006 prevede verificarea stingătoarelor.',
        'Scule',
        'Art. 1. Sculele se verifică zilnic.',
      ].join('\n')
    );
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([1, 2, 1]);
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: [
          'Lucrătorii respectă prevederile din art. 13 din Legea nr. 319/2006 privind securitatea.',
        ],
      },
      {
        kind: 'article',
        paragraphs: [
          'Se aplică și cerințele de la Art. 1 privind accesul în hală.',
          'Articolul 7 din Legea nr. 307/2006 prevede verificarea stingătoarelor.',
        ],
      },
      { kind: 'heading', text: 'Scule' },
      { kind: 'article', paragraphs: ['Sculele se verifică zilnic.'] },
    ]);
  });

  it('takes typed bare numbers, and a list inside an article that starts again from 1', () => {
    const result = splitInstruction(
      [
        '1. Motostivuitorul se conduce numai de persoane autorizate ISCIR.',
        '2. Înainte de pornire conducătorul verifică:',
        '1. frânele;',
        '2. claxonul;',
        '3. Sarcina se transportă cu furcile coborâte.',
        '4) Viteza în hală nu depășește 10 km/h.',
      ].join('\n')
    );
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: ['Motostivuitorul se conduce numai de persoane autorizate ISCIR.'],
      },
      {
        kind: 'article',
        paragraphs: ['Înainte de pornire conducătorul verifică:', '1. frânele;', '2. claxonul;'],
      },
      { kind: 'article', paragraphs: ['Sarcina se transportă cu furcile coborâte.'] },
      { kind: 'article', paragraphs: ['Viteza în hală nu depășește 10 km/h.'] },
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([1, 2, 3, 4]);
  });

  it('keeps a typed "1." as a sub-point once articles are typed with "Art."', () => {
    const result = splitInstruction(
      'Art. 5. Se verifică:\n1. starea cablului;\n2. starea furtunului.\nArt. 6. Se lucrează în doi.'
    );
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: ['Se verifică:', '1. starea cablului;', '2. starea furtunului.'],
      },
      { kind: 'article', paragraphs: ['Se lucrează în doi.'] },
    ]);
  });

  it('does not take a decimal or a sub-number for an article', () => {
    const result = splitInstruction(
      '1. Distanța minimă este de 1,5 m.\n1.1. Pentru cabluri izolate.\n2. Se lucrează cu scula izolată.'
    );
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: ['Distanța minimă este de 1,5 m.', '1.1. Pentru cabluri izolate.'],
      },
      { kind: 'article', paragraphs: ['Se lucrează cu scula izolată.'] },
    ]);
  });

  it('takes a short line without a closing period between articles as a heading', () => {
    const result = splitInstruction(
      [
        'Art. 1. Lucrătorul poartă mănuși.',
        'În timpul lucrului',
        'Art. 2. Lucrătorul nu părăsește utilajul pornit.',
        'Se interzice:',
        'Art. 3. Fumatul lângă rezervor.',
      ].join('\n')
    );
    expect(result.body.blocks.map((block) => block.kind)).toEqual([
      'article',
      'heading',
      'article',
      'heading',
      'article',
    ]);
  });

  it('keeps a short line in the article when no article follows it', () => {
    const result = splitInstruction(
      'Art. 1. La terminarea lucrului:\nStingerea utilajului\n– se închide robinetul;\n– se curăță masa.'
    );
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: [
          'La terminarea lucrului:',
          'Stingerea utilajului',
          '– se închide robinetul;',
          '– se curăță masa.',
        ],
      },
    ]);
  });

  it('joins the lines of a paragraph copied from a PDF', () => {
    const result = splitInstruction(
      [
        'Art. 1. Înainte de începerea lucrului, lucrătorul verifică starea sculelor de mână și',
        'înlocuiește pe cele cu mânere fisurate sau slăbite.',
        'Art. 2. Sculele se păstrează în trusa lor, în locul stabilit de conducătorul locului de',
        'Muncă, ferite de umezeală.',
      ].join('\n')
    );
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: [
          'Înainte de începerea lucrului, lucrătorul verifică starea sculelor de mână și înlocuiește pe cele cu mânere fisurate sau slăbite.',
        ],
      },
      {
        kind: 'article',
        paragraphs: [
          'Sculele se păstrează în trusa lor, în locul stabilit de conducătorul locului de Muncă, ferite de umezeală.',
        ],
      },
    ]);
  });

  it('takes the text of an article from the next line when "Art. N." stands alone', () => {
    const result = splitInstruction(
      'Art. 7.\nSe poartă cizme de cauciuc.\nArt. 8.\nSe lucrează uscat.'
    );
    expect(result.body.blocks).toEqual([
      { kind: 'article', paragraphs: ['Se poartă cizme de cauciuc.'] },
      { kind: 'article', paragraphs: ['Se lucrează uscat.'] },
    ]);
  });

  it('makes one article per paragraph when nothing is numbered, and says so', () => {
    const result = splitInstruction(
      [
        'Folosirea aparatului de cafea',
        'Aparatul se pornește numai după ce s-a verificat nivelul apei.',
        'Se interzice atingerea duzei de abur:',
        '– în timpul funcționării;',
        '– imediat după oprire.',
        'Aparatul se curăță zilnic, scos din priză.',
      ].join('\n')
    );
    expect(result.flags).toEqual([{ kind: 'no_numbering' }]);
    expect(result.body.blocks).toEqual([
      { kind: 'heading', text: 'Folosirea aparatului de cafea' },
      {
        kind: 'article',
        paragraphs: ['Aparatul se pornește numai după ce s-a verificat nivelul apei.'],
      },
      {
        kind: 'article',
        paragraphs: [
          'Se interzice atingerea duzei de abur:',
          '– în timpul funcționării;',
          '– imediat după oprire.',
        ],
      },
      { kind: 'article', paragraphs: ['Aparatul se curăță zilnic, scos din priză.'] },
    ]);
    expect(result.articles).toEqual([
      { sourceNumber: null },
      { sourceNumber: null },
      { sourceNumber: null },
    ]);
  });

  it('flags text before the first article and makes it an article', () => {
    const result = splitInstruction(
      'Lucrătorii sunt instruiți la angajare și periodic, conform tematicii aprobate.\nArt. 1. Se poartă vestă reflectorizantă.'
    );
    expect(result.flags).toEqual([{ kind: 'text_before_first_article' }]);
    expect(result.articles).toEqual([{ sourceNumber: null }, { sourceNumber: 1 }]);
  });

  it('reads text copied from Word: a label before a tab is the number, other tabs a table row', () => {
    const result = splitInstruction(
      [
        '1.\tLucrătorul verifică scara înainte de folosire:',
        'a)\ttălpile antiderapante;',
        '·\tbalamalele și dispozitivul de blocare.',
        '2.\tScările se folosesc după tabelul de mai jos:',
        'Înălțime\tLucrători\tAsigurare',
        'peste 2 m\t2\tcentură',
      ].join('\n')
    );
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: [
          'Lucrătorul verifică scara înainte de folosire:',
          'a) tălpile antiderapante;',
          '• balamalele și dispozitivul de blocare.',
        ],
      },
      {
        kind: 'article',
        paragraphs: [
          'Scările se folosesc după tabelul de mai jos:',
          'Înălțime – Lucrători – Asigurare',
          'peste 2 m – 2 – centură',
        ],
      },
    ]);
    expect(result.flags).toEqual([
      { kind: 'table_row', article: 2 },
      { kind: 'table_row', article: 2 },
    ]);
  });

  it('flags an empty text', () => {
    const result = splitInstruction('\n\n  \n');
    expect(result.body.blocks).toEqual([]);
    expect(result.flags).toEqual([{ kind: 'no_articles' }]);
  });
});

describe('splitInstruction on paragraphs read from Word', () => {
  it('starts an article at each top-level number of the article list', () => {
    const result = splitInstruction([
      paragraph('Instrucțiuni proprii pentru lucrul la înălțime'),
      paragraph('Dispoziții generale'),
      paragraph('Lucrul la înălțime se face numai cu centură de siguranță.', {
        label: 'Art. 41.',
        level: 0,
        list: '7',
      }),
      paragraph('Centura se verifică înainte de fiecare folosire:', {
        label: 'Art. 42.',
        level: 0,
        list: '7',
      }),
      paragraph('cusăturile;', { label: 'a)', level: 1, list: '7' }),
      paragraph('cataramele.', { label: 'b)', level: 1, list: '7' }),
      paragraph('Schelele se recepționează înainte de folosire.', {
        label: 'Art. 43.',
        level: 0,
        list: '7',
      }),
    ]);
    expect(result.title).toBe('Instrucțiuni proprii pentru lucrul la înălțime');
    expect(result.body.blocks).toEqual([
      { kind: 'heading', text: 'Dispoziții generale' },
      {
        kind: 'article',
        paragraphs: ['Lucrul la înălțime se face numai cu centură de siguranță.'],
      },
      {
        kind: 'article',
        paragraphs: [
          'Centura se verifică înainte de fiecare folosire:',
          'a) cusăturile;',
          'b) cataramele.',
        ],
      },
      { kind: 'article', paragraphs: ['Schelele se recepționează înainte de folosire.'] },
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([41, 42, 43]);
  });

  it('takes the list with most top-level numbers for the articles, others continuing them', () => {
    const result = splitInstruction([
      paragraph('Aparatul de sudură se leagă la pământ.', { label: '12.', level: 0, list: '3' }),
      paragraph('Sudorul poartă:', { label: '13.', level: 0, list: '3' }),
      paragraph('mască de sudură;', { label: '1.', level: 0, list: '9' }),
      paragraph('șorț de piele.', { label: '2.', level: 0, list: '9' }),
      paragraph('Locul de muncă se curăță de materiale combustibile.', {
        label: '14.',
        level: 0,
        list: '3',
      }),
    ]);
    expect(result.body.blocks).toEqual([
      { kind: 'article', paragraphs: ['Aparatul de sudură se leagă la pământ.'] },
      {
        kind: 'article',
        paragraphs: ['Sudorul poartă:', '1. mască de sudură;', '2. șorț de piele.'],
      },
      {
        kind: 'article',
        paragraphs: ['Locul de muncă se curăță de materiale combustibile.'],
      },
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([12, 13, 14]);
  });

  it('prints a Word bullet as a bullet and keeps plain paragraphs in the article', () => {
    const result = splitInstruction([
      paragraph('Se interzice:', { label: '1.', level: 0 }),
      paragraph('fumatul;', { label: '\uf0b7', level: 1 }),
      paragraph('focul deschis.', { label: '-', level: 1 }),
      paragraph('Abaterile se raportează conducătorului locului de muncă.'),
    ]);
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: [
          'Se interzice:',
          '• fumatul;',
          '– focul deschis.',
          'Abaterile se raportează conducătorului locului de muncă.',
        ],
      },
    ]);
  });

  it('joins a table row with dashes and flags it', () => {
    const result = splitInstruction([
      paragraph('Stingătoarele se aleg după clasa de incendiu:', { label: '1.', level: 0 }),
      { text: 'Clasa A\tPulbere sau apă pulverizată', table: true },
      { text: 'Clasa B\t Pulbere, spumă sau CO2 \t', table: true },
      paragraph('Stingătoarele se verifică anual.', { label: '2.', level: 0 }),
    ]);
    expect(result.body.blocks[0]).toEqual({
      kind: 'article',
      paragraphs: [
        'Stingătoarele se aleg după clasa de incendiu:',
        'Clasa A – Pulbere sau apă pulverizată',
        'Clasa B – Pulbere, spumă sau CO2',
      ],
    });
    expect(result.flags).toEqual([
      { kind: 'table_row', article: 1 },
      { kind: 'table_row', article: 1 },
    ]);
  });

  it('keeps a number typed by hand inside an article Word numbers', () => {
    const result = splitInstruction([
      paragraph('Distanțele de siguranță față de liniile electrice sunt:', {
        label: 'Art. 61.',
        level: 0,
      }),
      paragraph('12. pentru tensiuni până la 1 kV, 1 m;'),
      paragraph('16) pentru tensiuni între 1 și 110 kV, 3 m.'),
      paragraph('Lucrările se fac numai cu aviz de la distribuitor.', {
        label: 'Art. 62.',
        level: 0,
      }),
    ]);
    expect(result.body.blocks).toEqual([
      {
        kind: 'article',
        paragraphs: [
          'Distanțele de siguranță față de liniile electrice sunt:',
          '12. pentru tensiuni până la 1 kV, 1 m;',
          '16) pentru tensiuni între 1 și 110 kV, 3 m.',
        ],
      },
      { kind: 'article', paragraphs: ['Lucrările se fac numai cu aviz de la distribuitor.'] },
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([61, 62]);
    expect(result.flags).toEqual([]);
  });

  it('still starts an article at a typed "Art. N" beside Word numbers', () => {
    const result = splitInstruction([
      paragraph('Schela se montează pe teren nivelat.', { label: 'Art. 5.', level: 0 }),
      paragraph('Art. 6. Podinele se leagă de schelă.'),
      paragraph('legăturile se verifică zilnic;', { label: 'a)', level: 1 }),
    ]);
    expect(result.body.blocks).toEqual([
      { kind: 'article', paragraphs: ['Schela se montează pe teren nivelat.'] },
      {
        kind: 'article',
        paragraphs: ['Podinele se leagă de schelă.', 'a) legăturile se verifică zilnic;'],
      },
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([5, 6]);
  });

  it('keeps a paragraph that opens with a law citation inside its article', () => {
    const result = splitInstruction([
      paragraph('Stingătoarele se verifică anual.', { label: 'Art. 4.', level: 0 }),
      paragraph('Articolul 7 din Legea nr. 307/2006 prevede verificarea lor.'),
      paragraph('Hidranții se verifică semestrial.', { label: 'Art. 5.', level: 0 }),
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([4, 5]);
    expect(result.body.blocks[0]).toEqual({
      kind: 'article',
      paragraphs: [
        'Stingătoarele se verifică anual.',
        'Articolul 7 din Legea nr. 307/2006 prevede verificarea lor.',
      ],
    });
  });

  it('takes the level labelled "Art. N." for the articles when it is not the top one', () => {
    const result = splitInstruction([
      paragraph('Lucrul cu motoferăstrăul', { label: 'I.', level: 0 }),
      paragraph('Motoferăstrăul se pornește pe sol.', { label: 'Art. 288.', level: 1 }),
      paragraph('Se poartă viziera și antifoanele.', { label: 'Art. 289.', level: 1 }),
      paragraph('casca se poartă cu viziera coborâtă;', { label: 'a)', level: 2 }),
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([288, 289]);
    expect(result.body.blocks.at(-1)).toEqual({
      kind: 'article',
      paragraphs: ['Se poartă viziera și antifoanele.', 'a) casca se poartă cu viziera coborâtă;'],
    });
  });

  it('makes one article per paragraph when Word numbers no article', () => {
    const result = splitInstruction([
      paragraph('Stingătoarele se verifică anual.'),
      paragraph('Hidranții se verifică semestrial.'),
      paragraph('verificarea se consemnează;', { label: '\uf0b7', level: 0 }),
    ]);
    expect(result.flags).toEqual([{ kind: 'no_numbering' }]);
    expect(result.body.blocks).toEqual([
      { kind: 'article', paragraphs: ['Stingătoarele se verifică anual.'] },
      {
        kind: 'article',
        paragraphs: ['Hidranții se verifică semestrial.', '• verificarea se consemnează;'],
      },
    ]);
  });

  it('keeps the numbers of a pack that numbers the same articles twice', () => {
    const result = splitInstruction([
      paragraph('Prima regulă.', { label: 'Art. 358.', level: 0, list: '4' }),
      paragraph('A doua regulă.', { label: 'Art. 359.', level: 0, list: '4' }),
      paragraph('Regulă repetată.', { label: 'Art. 358.', level: 0, list: '4' }),
    ]);
    expect(result.articles.map((article) => article.sourceNumber)).toEqual([358, 359, 358]);
    expect(result.body.blocks).toHaveLength(3);
  });
});
