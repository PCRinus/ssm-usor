---
title: Instrucțiuni proprii
description: Ce este o instrucțiune proprie, cum o scrii în formularul ghidat, cum o aplici la posturile unui client, unde se tipărește și cum îți umpli biblioteca din documentația importată.
topics:
  - id: instructiuni.ce-este
    heading: Ce este o instrucțiune proprie
  - id: instructiuni.biblioteca
    heading: IPSSM și IPSU
  - id: instructiuni.formular
    heading: Scrierea unei instrucțiuni
  - id: instructiuni.lipeste-text
    heading: Lipește text
  - id: instructiuni.pornire-existenta
    heading: Pornești de la o instrucțiune existentă
  - id: instructiuni.nume-client
    heading: Numele unui client în text
  - id: instructiuni.aplicare
    heading: Aplicarea la posturi
  - id: instructiuni.tiparire
    heading: Unde se tipărește
  - id: instructiuni.versiuni
    heading: Versiunile și documentele rămase în urmă
  - id: instructiuni.din-import
    heading: Instrucțiunile din documentația importată
sources:
  - docs/architecture/adr-034-own-instructions-as-app-text.md
  - docs/architecture/adr-012-own-instructions.md
  - packages/contracts/src/instruction-body.ts
  - packages/contracts/src/instruction-splitter.ts
  - apps/app/src/features/instructions/*.tsx
  - apps/app/src/features/instructions/instruction-draft.ts
  - apps/app/src/features/imports/library/*.tsx
  - apps/app/src/features/imports/library/library-model.ts
---

Instrucțiunile proprii sunt biblioteca ta de texte pentru activitățile și echipamentele clienților. Le scrii o dată, le aplici la posturile oricărui client, iar aplicația le tipărește ca anexe ale instrucțiunilor proprii ale fiecărui client.

## Ce este o instrucțiune proprie

O instrucțiune proprie spune cum se lucrează în siguranță la o activitate, la un echipament de muncă sau cu o categorie de echipament de protecție: munca de birou, o scară metalică, un polizor, purtarea căștii. Angajatorul are obligația să elaboreze instrucțiuni proprii pentru activitățile și locurile lui de muncă (Legea nr. 319/2006, art. 13 lit. e)); tu le scrii pentru clienții tăi.

O instrucțiune are un titlu, o categorie și un text făcut din articole numerotate, cu titluri de secțiune între ele. Articolele se numerotează de la 1, după locul lor; titlurile de secțiune nu se numără. Textul nu are formatare, tabele sau imagini: anexa se tipărește la fel pentru toate instrucțiunile.

## IPSSM și IPSU

Biblioteca e în meniul **Instrucțiuni proprii**, cu două taburi:

- **IPSSM**: instrucțiunile de securitate și sănătate în muncă, cu categoriile _Activități_, _Echipamente de muncă_ și _Echipament de protecție_;
- **IPSU**: instrucțiunile pentru situații de urgență (PSI), cu categoriile _Spații și activități_, _Instalații și echipamente_ și _Lucrări periculoase_.

Categoria ordonează anexele și grupează lista din care alegi instrucțiunile unui post. Nu se tipărește.

Lista arată, pentru fiecare instrucțiune, versiunea, câte articole are și la câte posturi e aplicată. O instrucțiune pe care nu o mai folosești o arhivezi; una aplicată la un post nu se arhivează până nu o scoți de pe post.

## Scrierea unei instrucțiuni

Apeși **Scrie o instrucțiune**, alegi titlul, categoria și domeniul, apoi de la ce pornești: **Structura propusă** sau o instrucțiune existentă. Instrucțiunea intră în bibliotecă la prima salvare.

Structura propusă împarte textul în secțiunile potrivite categoriei. La _Echipamente de muncă_, de exemplu: Domeniul de aplicare, Cine îl poate folosi, Verificări înainte de pornire, În timpul utilizării, Oprire, curățare și întreținere, Ce faci la o defecțiune, Echipament de protecție necesar, Acțiuni interzise, Situații de urgență. Secțiunile sunt o propunere: le poți redenumi, muta sau șterge.

- **Textul gri** din fiecare căsuță e un îndemn: spune ce să scrii acolo. Nu se salvează și nu se tipărește, iar o secțiune lăsată goală nu apare în anexă.
- **Arată un exemplu** pune în secțiune un articol scris de noi, ca model. Îl adaptezi sau îl ștergi.
- Fiecare rând dintr-un articol e un paragraf. Un rând care începe cu „a)”, „1.”, „–” sau „•” se tipărește ca punct al unei enumerări.
- **Previzualizare** îți arată anexa așa cum se tipărește, chiar înainte să salvezi.

După ultimul articol, anexa tipărește singură „Acte normative avute în vedere”: Legea nr. 319/2006 și H.G. nr. 1425/2006 la IPSSM, Legea nr. 307/2006 și normele generale aprobate prin O.M.A.I. nr. 163/2007 la IPSU. Nu le scrii tu.

### Lipește text

Dacă ai instrucțiunea într-un fișier Word sau PDF, copiezi textul și alegi **Lipește text**. Aplicația îl împarte în articole după numerotare („Art. 12”, „12.”, „12)”), face titluri de secțiune din rândurile scurte și îți arată ce a ieșit înainte să adauge. Articolele se numerotează din nou de la 1. Un text fără nicio numerotare devine câte un articol pe paragraf, iar fereastra îți spune asta.

Același lucru se întâmplă când lipești mai multe paragrafe într-un singur articol: aplicația îți propune să le împartă.

### Pornești de la o instrucțiune existentă

La **Pornește de la** alegi o instrucțiune din bibliotecă. Textul ei se copiază în cea nouă, ca să-l adaptezi; instrucțiunea din bibliotecă rămâne cum este. E calea potrivită pentru o variantă a unei instrucțiuni pe care o ai deja, de exemplu pentru alt tip de scară.

### Numele unui client în text

O instrucțiune din bibliotecă se aplică la mai mulți clienți. Dacă textul numește unul dintre clienții tăi, formularul marchează articolul și îți spune: „Textul numește clientul … Instrucțiunea se aplică și altor clienți.” Salvarea nu e oprită; hotărăști tu dacă scoți numele.

## Aplicarea la posturi

Pe pagina unui post, cardurile **Instrucțiuni specifice SSM** și **Instrucțiuni specifice PSI** arată ce instrucțiuni privesc postul. Cu **Alege instrucțiunile** bifezi instrucțiunile din bibliotecă, cu **Copiază de la alt post** le iei de la un post asemănător, iar dacă postul nu are nevoie de nimic dincolo de partea comună, alegi **Postul nu necesită instrucțiuni specifice**.

Un post nedecis oprește generarea instrucțiunilor proprii ale clientului: documentul are nevoie să știe ce anexează pentru fiecare post.

## Unde se tipărește

Fiecare instrucțiune aplicată la un post al clientului devine o anexă a instrucțiunilor proprii ale lui: IPSSM în Documente SSM, IPSU în Documente PSI.

- **Pagina de titlu.** Anexa începe cu o pagină de titlu: „ANEXA N”, instrucțiunile cărora le aparține, titlul și data versiunii.
- **Textul.** Pe paginile următoare, articolele cu „Art. N.” îngroșat, titlurile de secțiune și actele normative la sfârșit.
- **Antetul.** Fiecare pagină are antetul documentului, care numește anexa și îi numără paginile separat: „Anexa 2 · Pag. 1 din 3”. O anexă nu continuă numerotarea instrucțiunilor proprii, pentru că aceeași instrucțiune apare la mai mulți clienți.
- **Descarcă Word** dă instrucțiunile proprii împreună cu anexele, ca PDF-ul. În fișierul Word paginile poartă doar „Pag. X”, fără total; PDF-ul emis are numărul complet.

Tematica de instruire citează fiecare anexă cu articolele ei, „Art. 1–N”, unde N e numărul exact de articole al versiunii anexate.

## Versiunile și documentele rămase în urmă

Fiecare salvare care schimbă textul face o versiune nouă; cele vechi rămân, ca documentele emise să-și păstreze anexele. O salvare care schimbă doar spațiile, literele mari sau punctuația nu face o versiune nouă.

Un document emis cu o versiune mai veche rămâne în urmă: în Documente SSM sau Documente PSI apare „Instrucțiuni actualizate”, cu instrucțiunea care s-a schimbat. Îl generezi din nou ca să ia versiunea nouă.

## Instrucțiunile din documentația importată

Când imporți un client din documentația lui, aplicația citește separat și instrucțiunile proprii din pachet și ți le propune pentru bibliotecă, cu posturile la care se aplică. Le verifici în pagina importului, la **Instrucțiuni proprii**, după ce creezi clientul. Pașii sunt în [Importul din documente](/clienti/import/#instrucțiunile-proprii-din-documentație).
