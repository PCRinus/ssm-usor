---
title: Legislație
description: Ce acte normative urmărește aplicația și de unde le citește, cât de des le verifică, ce înseamnă coloanele listei de acte, ce înseamnă o modificare „În verificare”, cum se încheie și ce ai tu de făcut după aceea.
topics:
  - id: legislatie.pagina
    heading: Ce urmărește pagina Legislație
  - id: legislatie.verificare
    heading: Verificarea zilnică
  - id: legislatie.acte
    heading: Actele urmărite
  - id: legislatie.citat-in
    heading: Preluări și trimiteri
  - id: legislatie.cautare
    heading: Căutarea, filtrele și ordinea
  - id: legislatie.in-verificare
    heading: O modificare în verificare
  - id: legislatie.incheiere
    heading: Cum se încheie o modificare
  - id: legislatie.documente
    heading: Documentele de actualizat
  - id: legislatie.ce-nu-faci
    heading: Ce nu ai de făcut
sources:
  - docs/architecture/adr-017-legislation-monitoring.md
  - packages/contracts/src/legislation.ts
  - apps/api/src/modules/legislation/handlers.ts
  - apps/api/src/modules/legislation/act-citations.ts
  - apps/app/src/features/legislation/legislation-labels.ts
  - apps/app/src/features/legislation/last-check.tsx
  - apps/app/src/features/legislation/watched-acts.tsx
  - apps/app/src/features/legislation/watched-act-columns.tsx
  - apps/app/src/features/legislation/watched-act-cells.tsx
  - apps/app/src/features/legislation/watched-act-list.ts
  - apps/app/src/features/legislation/legal-changes.tsx
  - apps/app/src/features/legislation/documents-behind.tsx
---

Documentele pe care le generează aplicația citează legislația: unele paragrafe preiau cuvânt cu cuvânt articole din lege, altele trimit la un act sau la un articol. Pagina **Legislație** îți arată ce acte citează documentele, ce s-a schimbat în ele și ce documente trebuie generate din nou după ce un șablon se schimbă.

## Ce urmărește pagina Legislație

Pagina are trei secțiuni:

- **Documente de actualizat**: documentele clienților tăi generate dintr-o versiune mai veche a șablonului, de dinaintea unei modificări legislative sau a unei corecturi, și instrucțiunile proprii și tematicile generate din instrucțiuni schimbate între timp în bibliotecă sau la posturile de lucru;
- **Modificări**: formele consolidate noi ale actelor urmărite, cele mai recente primele, fiecare cu ce a schimbat și cum s-a încheiat;
- **Acte urmărite**: actele normative pe care le citează documentele aplicației.

Actele sunt aceleași pentru toate organizațiile, pentru că documentele pornesc din aceleași șabloane. Instrucțiunile proprii ale organizației tale nu fac parte din ele: textul lor îl scrii tu.

## Verificarea zilnică

Textele legilor vin de pe **Portalul Legislativ** al Ministerului Justiției, unde se publică forma oficială a actelor și formele lor consolidate. Aplicația citește pagina fiecărui act urmărit o dată pe zi, dimineața devreme, și compară cea mai nouă formă consolidată cu ce a văzut data trecută. O formă consolidată nouă devine o modificare pe secțiunea **Modificări**.

Sub titlul paginii vezi cum a mers ultima verificare:

- **Verificat pe …**: verificarea a rulat la timp, cu numărul de acte citite și, dacă au apărut, numărul modificărilor noi;
- **Verificarea rulează**: verificarea de azi nu s-a terminat încă;
- **Ultima verificare nu a reușit**: unele acte nu au putut fi citite, de obicei pentru că portalul nu a răspuns. Sub **Detalii** vezi actele și motivul. Modificările acestor acte apar după o verificare reușită;
- **Verificarea nu a mai rulat de peste două zile**: ce vezi pe pagină poate fi în urmă față de portal;
- **Verificarea nu a rulat încă**: actele nu au fost citite niciodată, cum se întâmplă doar înainte de prima verificare.

## Actele urmărite

Fiecare rând al listei este un act normativ citat de documente:

- **Act normativ**: numele scurt al actului, care deschide pagina lui pe Portalul Legislativ, cu titlul lui dedesubt, de exemplu „privind apărarea împotriva incendiilor”;
- **Domeniu**: SSM, SU sau amândouă, după documentele care citează actul. Contractul de prestări servicii acoperă ambele domenii, așa că nu schimbă domeniul unui act;
- **Stare**: **În verificare** când actul are o modificare încă deschisă (vezi mai jos), **Abrogat** când portalul arată actul abrogat, **Neverificat** când actul nu a fost citit încă pe portal și **În vigoare** în rest;
- **Ultima formă consolidată**: data celei mai noi forme consolidate găsite pe portal. **Forma de bază** înseamnă că actul nu a fost consolidat niciodată: portalul are doar textul publicat inițial. Cât timp o modificare e în verificare, dedesubt vezi forma pe care o urmează documentele, de exemplu „documentele: 25.08.2026”;
- **Citat în**: câte documente citează actul, cu numărul preluărilor dedesubt.

## Preluări și trimiteri

O **preluare** este un paragraf care copiază textul unui articol, de exemplu un articol din lege redat întreg în materialul de instruire. O **trimitere** este o propoziție care doar numește actul sau un articol al lui, de exemplu „conform art. 20 din Legea 319/2006”, fără să-i copieze textul.

Diferența contează când legea se schimbă: o preluare poate rămâne cu textul vechi tipărit în document, o trimitere rămâne corectă cât timp articolul spune în continuare același lucru. „Doar trimiteri” înseamnă că documentele numesc actul fără să preia nimic din el.

## Căutarea, filtrele și ordinea

Caută după numărul actului, după numele lui sau după cuvinte din titlu. Punctele, spațiile și diacriticele nu contează: „hg 1425” găsește „H.G. 1425/2006”, „aparare” găsește „apărarea”.

Din **Filtre** alegi domeniul și starea. Dacă nu găsești nimic, **Șterge filtrele** scoate filtrele și păstrează căutarea.

Lista pune întâi actele cu o modificare în verificare, apoi pe celelalte după nume. Poți ordona și după act, după ultima formă consolidată (cea mai nouă întâi) sau după numărul documentelor care citează actul (cele mai citate întâi).

## O modificare în verificare

O modificare rămâne **În verificare** până se încheie. Verificarea compară textul articolelor citate în forma pe care o urmează documentele cu textul lor în forma nouă și spune ce a găsit:

- **Modifică un text citat în documente**: textul unui articol pe care un document îl preia s-a schimbat. Pe secțiunea **Modificări** vezi textul vechi și cel nou al articolului și documentele care îl preiau;
- **Modifică un articol la care trimit documentele**: s-a schimbat un articol la care documentele doar trimit, sau modificarea trebuie citită de un om, de exemplu când un articol citat a fost abrogat ori actul a fost republicat și articolele lui pot avea alte numere.

Până la prima comparație, modificarea apare pe **Modificări** ca neanalizată încă, iar în lista actelor vezi doar eticheta „În verificare”. Rândul de sub etichetă te duce la modificare.

## Cum se încheie o modificare

O modificare se încheie în unul din două feluri:

- **Fără impact asupra documentelor**: articolele citate au rămas la fel. Verificarea închide singură modificarea, cu o notă despre articolele schimbate, sau o închidem noi după ce o citim;
- **Șablon actualizat**: textul documentelor trebuia schimbat. Actualizăm șabloanele documentelor atinse, iar versiunea nouă ajunge în aplicație odată cu o actualizare. Pe **Modificări** vezi nota versiunii și documentele pe care le-a schimbat.

## Documentele de actualizat

După ce un șablon se schimbă, documentele generate din versiunea veche apar pe secțiunea **Documente de actualizat**, grupate pe SSM și SU, cu clienții care le au. Aici e singurul lucru pe care îl ai de făcut: **regenerezi documentul pentru toți clienții** cu un singur buton.

- o ciornă se înlocuiește cu una nouă, făcută cu datele de acum ale clientului;
- un document emis primește o ciornă nouă și rămâne în vigoare până emiți ciorna de pe pagina clientului;
- o ciornă pe care ai editat-o de mână este sărită, ca să nu pierzi modificările; pe aceea o regenerezi de pe pagina clientului, când hotărăști tu.

O schimbare care mută doar aranjarea în pagină nu cere regenerarea și nu apare aici.

## Ce nu ai de făcut

- nu citești portalul și nu urmărești când apare o formă consolidată nouă: aplicația o face zilnic;
- nu compari textul legii cu cel din documente și nu corectezi textul preluat în șabloane: le actualizăm noi;
- nu închizi modificările: se închid singure când nu ating documentele, sau când apare șablonul actualizat.

Pagina nu trimite e-mailuri. Ce s-a schimbat vezi când o deschizi.
