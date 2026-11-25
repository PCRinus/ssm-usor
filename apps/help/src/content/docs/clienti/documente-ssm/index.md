---
title: Documentația SSM
description: Dosarele documentației SSM a unui client, numerele documentelor, stările lor și ce faci cu fiecare, generarea și descărcarea întregii documentații.
sources:
  - docs/architecture/adr-005-document-generation.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-012-own-instructions.md
  - docs/architecture/adr-017-legislation-monitoring.md
  - docs/architecture/adr-045-risk-zones-record.md
  - docs/architecture/adr-046-ssm-duties-for-job-descriptions.md
  - packages/document-engine/tools/import/ssm-duties.ro.json
  - packages/contracts/src/documents.ts
  - apps/app/src/features/documents/documents-card.tsx
  - apps/app/src/features/documents/document-sections.ts
  - apps/app/src/features/documents/pack-layout.tsx
  - apps/app/src/features/documents/pack-folders.tsx
  - apps/app/src/features/documents/pack-folder.tsx
  - apps/app/src/features/documents/pack-empty.tsx
  - apps/app/src/features/documents/pack-labels.ts
  - apps/app/src/features/documents/pack-status.ts
  - apps/app/src/features/documents/pack-rows.tsx
  - apps/app/src/features/documents/document-row.tsx
  - apps/app/src/features/documents/annex-row.tsx
  - apps/app/src/features/documents/document-confirm-dialog.tsx
  - apps/app/src/features/documents/generate-documents-dialog.tsx
---

Tabul **Documentație SSM** al unui client ține documentele de securitate și sănătate în muncă pe care aplicația le scrie cu datele clientului: deciziile, materialele de instruire, instrucțiunile proprii, tematica, testul, registrele, evaluarea riscurilor, planul de prevenire și celelalte. Sunt așezate ca în dosarul tipărit, pe secțiuni, fiecare secțiune într-un dosar al ei. Tabul **Documentație SU** arată la fel; ce are în plus este în [Documentația SU](/clienti/documente-su/).

## Dosarele

Tabul se deschide pe toată documentația. Sus vezi câte documente sunt emise, câte sunt de actualizat, câte sunt ciorne și câte nu sunt generate încă, apoi o bară cu aceleași stări și, lângă ea, câte documente sunt în câte secțiuni. Butoanele **Descarcă documentația** și **Generează…** stau tot aici, deasupra dosarelor.

Dedesubt, fiecare secțiune a dosarului tipărit este un dosar, și cea care are un singur document. Un dosar arată:

- numărul secțiunii și titlul ei;
- câte documente are și, la instrucțiunile proprii, câte anexe;
- o bară cu stările documentelor lui;
- pe scurt, unde stă: „2 din 6 emise · 1 de actualizat”, „Toate emise”, „Negenerate”, iar la un dosar cu un singur document starea lui: Emis, Ciornă, De actualizat sau Negenerat.

Pe bare, verdele închis înseamnă emis, galbenul de actualizat, verdele-cenușiu ciornă, iar griul deschis negenerat. Un document se numără o singură dată, la starea cea mai urgentă: întâi de actualizat, apoi ciornă, apoi emis.

Pe telefon dosarele sunt o listă, unul sub altul: fiecare arată numărul și titlul secțiunii, bara și unde stă, fără numărul de documente și de anexe.

Un document pe care clientul îl are deja, dar pe care această versiune a aplicației încă nu îl cunoaște, apare la sfârșit, în dosarul **Alte documente SSM**.

## Un dosar deschis

Un clic pe un dosar îl deschide. Vezi numărul și titlul secțiunii, unde stă, și tabelul documentelor ei: numărul și titlul documentului, starea, data documentului și meniul lui de acțiuni. Un clic pe titlu deschide documentul.

Ca să treci prin documentație:

- **Toate secțiunile** te duce înapoi la dosare;
- săgețile din dreapta sus deschid secțiunea dinainte și pe cea de după; a câta secțiune este din câte scrie lângă ele, iar pe telefon sub titlul secțiunii;
- la capătul tabelului, butonul **Următoarea secțiune** deschide secțiunea următoare.

Săgețile și **Următoarea secțiune** nu adaugă pași în istoricul browserului: după ce ai deschis un dosar de pe pagina cu dosarele, butonul „înapoi” al browserului te duce înapoi la dosare, oricâte secțiuni ai parcurs între timp.

Bara, butoanele de generare și descărcarea întregii documentații nu apar într-un dosar deschis: sunt pe pagina cu toate dosarele.

Instrucțiunile proprii își arată anexele sub ele, câte una pe rând, fiecare cu versiunea instrucțiunii din bibliotecă pe care o anexează. Un clic pe anexă deschide instrucțiunea la acea versiune.

## Numerele documentelor

Fiecare document are numărul lui din dosarul tipărit, scris înaintea titlului: **3.1** sunt instrucțiunile proprii, **6** lista de dotare cu echipament individual de protecție, **9.1** evaluarea riscurilor. Numărul este același la orice client și oriunde apare documentul: în titlul documentului deschis, în ferestrele și mesajele despre el, în **Legislație** și în numele fișierelor descărcate, inclusiv în arhiva documentației.

Coperta unei secțiuni are numărul **X.0**: 1.0 este coperta deciziilor, 3.0 coperta instrucțiunilor proprii. După copertă, documentele secțiunii urmează în ordine, fără goluri: X.1, X.2 și așa mai departe, ca deciziile 1.1–1.5 după coperta 1.0. O secțiune fără copertă care are mai multe documente le numerotează tot de la X.1: secțiunea 9 are evaluarea riscurilor, **9.1**, și evidența zonelor cu risc ridicat și specific, **9.2**.

| Secțiune                                                     | Documente                                           |
| ------------------------------------------------------------ | --------------------------------------------------- |
| 1. Decizii interne                                           | 1.0 coperta, 1.1–1.5 deciziile                      |
| 2. Material de instruire introductiv-generală                | 2.0 coperta, 2.1 materialul                         |
| 3. Instrucțiuni proprii                                      | 3.0 coperta, 3.1 instrucțiunile proprii, cu anexele |
| 4. Tematica de instruire                                     | 4.0 coperta, 4.1 tematica și programul de instruire |
| 5. Test de verificare a cunoștințelor                        | 5.0 coperta, 5.1 testul la angajare                 |
| 6. Lista internă de dotare cu EIP                            | 6                                                   |
| 7. Registrele de evidență a evenimentelor                    | 7.0 coperta, 7.1 registrele                         |
| 8. Referat de control                                        | 8                                                   |
| 9. Evaluarea riscurilor                                      | 9.1 evaluarea riscurilor, 9.2 evidența zonelor      |
| 10. Planul de prevenire și protecție                         | 10                                                  |
| 11. Material de informare a angajatorului                    | 11.0 coperta, 11.1 materialul                       |
| 12. Regulament intern privind controlul propriu              | 12                                                  |
| 13. Atribuții și răspunderi SSM – anexe la fișele posturilor | 13, o anexă pentru fiecare post                     |
| 14. Anexă la regulamentul privind semnarea electronică       | 14                                                  |

Numărul documentului nu este numărul deciziei. O decizie poartă sub titlu „Decizia nr. 5 SSM”, numărul pe care îl primește la generare, numărând de la primul număr pe care l-ai dat.

## Atribuțiile SSM ale posturilor

Documentul **13**, „Atribuții și răspunderi în domeniul securității și sănătății în muncă – anexe la fișele posturilor”, îl primește orice client. Legea nr. 319/2006, art. 13 lit. d), cere angajatorului să stabilească prin fișa postului atribuțiile și răspunderile fiecărui lucrător în domeniul securității și sănătății în muncă, iar H.G. nr. 1425/2006, art. 15 alin. (1) pct. 4, face din propunerea lor o activitate a serviciului de prevenire și protecție, cu aprobarea angajatorului. Fișa postului rămâne documentul angajatorului; documentul 13 îi dă partea de securitate și sănătate în muncă, câte o anexă pentru fiecare post.

Pe prima pagină sunt semnăturile de predare: a ta, „Am propus și predat un exemplar”, și a angajatorului, „Am primit și aprobat”, apoi lista anexelor. Fiecare anexă începe pe o pagină nouă, în ordinea alfabetică a posturilor din tabul **Posturi de lucru**, și are rândul ei de aprobare, pentru că se păstrează la dosar lângă fișele postului respectiv. Un post fără angajați își primește și el anexa.

O anexă cuprinde:

- obligațiile oricărui lucrător, după Legea nr. 319/2006, art. 22 și art. 23 alin. (1);
- atribuțiile postului, din datele lui: instrucțiunile proprii pe care le aplică postul, cu numărul și titlul din documentul 3.1; echipamentul individual de protecție din documentul 6, dacă postul are; zonele cu risc ridicat și specific din documentul 9.2 legate de riscurile postului; intervalul instruirii periodice al postului;
- atribuțiile rolurilor pe care le au angajații postului, cu numele lor: conducător al locului de muncă, lucrător desemnat pentru primul ajutor, personal desemnat pentru pericol grav și iminent și reprezentant al lucrătorilor, acesta doar cât timp setul cuprinde decizia 1.5, ultimele două cu trimitere la decizia lor, 1.4 și 1.5; cine are două roluri apare la amândouă;
- răspunderea pentru neîndeplinirea lor.

Rândul despre zone apare în anexa unui post după ce ai adăugat zonele clientului, dacă o zonă este legată de riscurile postului. Când adaugi zone după ce documentul 13 a fost generat, ciorna lui arată „Date modificate” dacă o zonă ajunge astfel într-o anexă.

O regulă care ține doar de un post, de exemplu „nu folosește feliatorul de carne fără a fi instruit”, nu se scrie în documentul 13. O pui într-o instrucțiune proprie din biblioteca ta, pe care o aplici postului: anexa o numește singură, iar instrucțiunea o folosești la orice client cu același post.

Documentul 13 nu se modifică de mână: nu se schimbă în editor, unde îl deschizi doar pentru citit, nu se înlocuiește cu un fișier Word și nu are **Modifică documentul emis**. Anexele se scriu numai din datele clientului, iar fișele lucrătorilor le repetă întocmai, așa că îl schimbi prin date și **Generează din nou**. Așa, fișa de luare la cunoștință a fiecărui lucrător spune exact ce scrie în documentul 13 emis și știe când anexa postului s-a schimbat (vezi [Fișa de luare la cunoștință a atribuțiilor SSM](/clienti/angajati/instruire-si-teste/#fișa-de-luare-la-cunoștință-a-atribuțiilor-ssm)).

## Stările unui document

Coloana **Stare** spune unde este documentul și ce mai ai de făcut. Un document poate avea mai multe stări deodată.

### Emis

„Emis · rev. 1” este documentul definitiv, cu PDF-ul făcut la emitere. Un document emis nu se mai modifică. Ca să îl corectezi, alege **Modifică documentul emis** din meniul lui: se face o ciornă nouă din el, care îl înlocuiește când o emiți. Documentul 13 nu are această opțiune: îl generezi din nou. Până atunci, revizia emisă rămâne în vigoare și se poate descărca.

### Ciornă

„Ciornă · rev. 2” este o versiune pe care o mai poți schimba: o deschizi și o modifici în editor, o generezi din nou, o înlocuiești cu un fișier Word sau o ștergi. Ciorna documentului 13 doar o generezi din nou sau o ștergi. Când este gata, alege **Emite**. Dacă în ciornă a rămas text „DE COMPLETAT”, acolo unde aplicația nu a avut ce scrie, ți se spune înainte de emitere; butonul pentru locurile de completat din editor te duce la fiecare.

### Modificat

Ciorna a fost modificată de mână. Nu e nimic de rezolvat, dar ține minte: dacă o generezi din nou, modificările tale se pierd.

### Date modificate

Datele clientului din care este scris documentul s-au schimbat după ce a fost generată ciorna. Alege **Generează din nou** ca ciorna să le preia. Documentul se numără la „de actualizat”.

### Șablon actualizat

Șablonul din care s-a făcut documentul are o versiune nouă, cu un text de lege schimbat sau o corectură. Cu mouse-ul pe „Șablon actualizat” vezi versiunea care cere regenerarea și ce s-a schimbat în ea: cea mai nouă modificare legislativă de la versiunea documentului încoace, iar dacă nu e niciuna, cea mai nouă corectură. Alege **Generează din nou** ca documentul să preia versiunea nouă. Documentul se numără la „de actualizat”, fie el emis sau ciornă.

### Instrucțiuni actualizate

Apare la instrucțiunile proprii și la tematica de instruire. O instrucțiune din biblioteca ta pe care o anexează are acum o versiune nouă, sau posturile clientului aplică alte instrucțiuni decât cele din document. Sub stare scrie care instrucțiune s-a schimbat. Generează din nou întâi instrucțiunile proprii, apoi tematica, pentru că tematica citează instrucțiunile proprii așa cum sunt generate.

O anexă a instrucțiunilor proprii arată „Versiune nouă în bibliotecă” când instrucțiunea ei s-a schimbat de atunci. Documentul o anexează după ce generezi din nou instrucțiunile proprii; generarea din nou pierde modificările făcute de mână în ele.

### Negenerat

Documentul face parte din documentația clientului, dar nu a fost generat încă. Rândul este gri și nu are meniu. Îl generezi cu **Generează documentele lipsă**.

## Generarea

Cât timp documentația nu are niciun document, tabul arată un panou verde, „Documentația SSM nu este generată încă”, cu butonul **Generează documentația**, iar dedesubt aceleași dosare, toate negenerate: arată ce va cuprinde documentația înainte să o generezi. Poți deschide un dosar ca să vezi documentele lui.

Fereastra de generare îți cere data documentelor, de obicei data de început a contractului de prestări servicii cu clientul, și numărul primei decizii. Dacă lipsesc date pe care documentele le tipăresc, fereastra le arată pe rânduri, fiecare ducând la câmpul lui; documentele nu lasă niciun câmp gol.

Evidența zonelor cu risc ridicat și specific, documentul 9.2, nu oprește restul documentației. Cât timp clientul nu are zone adăugate și nici declarația că nu are, fereastra o arată deoparte, cu ce așteaptă, iar celelalte documente se generează fără ea. O generezi apoi cu **Generează documentele lipsă**. Ce cere este în [Evaluări de risc](/evaluari-de-risc/#ce-cer-documentele-91-92-și-10).

După prima generare, butonul devine **Generează documentele lipsă** cât timp lipsește vreun document, apoi dispare.

## Ce faci cu un document

Meniul cu trei puncte de la capătul rândului are, după starea documentului:

- **Deschide** sau **Deschide și modifică**, pentru o ciornă;
- **Emite**, pentru o ciornă;
- **Descarcă Word** și **Tipărește**, separat pentru ciornă și pentru documentul emis, iar **Deschide PDF** pentru documentul emis;
- **Modifică documentul emis**, când documentul este emis și nu are ciornă;
- **Generează din nou**, care completează documentul cu datele de acum ale clientului;
- **Încarcă un fișier Word**, care face dintr-un fișier al tău ciorna documentului, în locul celei de acum;
- **Șterge ciorna**.

Documentul 13 nu are **Deschide și modifică**, **Modifică documentul emis** și **Încarcă un fișier Word**, iar ciorna lui nu se modifică în editor: se scrie numai din datele clientului, cum spune și rândul de sub titlul lui.

O anexă a instrucțiunilor proprii are meniul ei, cu **Deschide** și **Descarcă Word**.

## Descărcarea documentației

**Descarcă documentația** face o arhivă cu toată documentația clientului:

- **Arhivă cu fișierele Word**: documentele emise și, pentru cele neemise încă, ciornele;
- **Arhivă cu PDF-urile**: doar documentele emise, cu PDF-ul făcut la emitere. Cât timp nu e niciun document emis, opțiunea nu se poate alege.

## Documentele care nu se aplică

Un document pe care clientul nu trebuie să îl aibă nu apare deloc, nici în dosare, nici în numărători:

- **Decizia 1.5**, privind reprezentanții lucrătorilor, se generează de la 10 lucrători în lista clientului. H.G. nr. 1425/2006, art. 53 alin. (2), cere cel puțin un reprezentant de la 10 la 49 de lucrători și doi de la 50 la 100. Dacă decizia a fost generată și numărul a scăzut, ea rămâne în documentație.
- **Documentul 14**, anexa la regulamentul privind semnarea electronică, apare doar la un client care are persoane invitate să semneze electronic fișele de instruire.

Fereastra de generare spune ce înseamnă numărul de lucrători al clientului pentru decizia 1.5.

## Clientul arhivat

La un client arhivat nu se mai generează și nu se mai emite nimic. Documentele lui se pot deschide, descărca și tipări în continuare. Dacă documentația lui nu a fost generată deloc, tabul arată doar un panou care spune că clientul este arhivat, fără dosare.
