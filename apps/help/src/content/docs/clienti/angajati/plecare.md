---
title: Plecarea unui angajat
description: Cum marchezi plecarea unui angajat, ce rămâne din evidența lui și cum corectezi o plecare marcată din greșeală.
topics:
  - id: angajati.plecare
    heading: Marcarea plecării
  - id: angajati.data-plecarii
    heading: Data plecării
  - id: angajati.dupa-plecare
    heading: Ce rămâne după plecare
  - id: angajati.reactivare
    heading: Reactivarea
  - id: angajati.reangajare
    heading: Reangajarea
  - id: angajati.stergere
    heading: Un angajat nu se șterge
sources:
  - docs/architecture/adr-006-job-positions.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-022-participants-and-the-portal.md
  - packages/contracts/src/employees.ts
  - apps/api/src/modules/employees/handlers.ts
  - apps/app/src/features/employees/employee-status-dialog.tsx
  - apps/app/src/features/employees/employee-layout.tsx
  - apps/app/src/features/employees/employee-page.tsx
  - supabase/migrations/20260918100000_employees.sql
  - supabase/migrations/20260918120000_employees_drop_suspended.sql
---

Un angajat care pleacă nu dispare din aplicație. Trece la foștii angajați ai clientului, cu instruirile, fișele și fișierele lui, pentru că acestea sunt dovezi care se păstrează și după încetarea contractului.

## Marcarea plecării

Alege **Marchează plecarea…** din capul paginii angajatului sau din meniul rândului său din listă. În dialog alegi data plecării și confirmi cu **Confirmă plecarea**.

Concediile, șomajul tehnic sau suspendarea contractului nu sunt plecări: angajatul rămâne angajat actual. Revenirea după o absență de peste 30 de zile lucrătoare se înregistrează ca instruire periodică suplimentară (vezi [Instruirea și testele unui angajat](/clienti/angajati/instruire-si-teste/)).

### Data plecării

Ziua în care a încetat contractul. Dialogul propune ziua de azi și îți arată data angajării. Data plecării nu poate fi înaintea datei angajării; altfel vezi „Data plecării nu poate fi înaintea datei angajării.”

## Ce rămâne după plecare

Din ziua în care marchezi plecarea:

- angajatul apare la **Foști angajați**, cu „până la” și data plecării sub data angajării, și în capul paginii lui scrie **Fost angajat**;
- nu mai are stare a instruirii sau a testării: pe pagina lui scrie „Fără termen: nu mai lucrează la client”, iar testele nu-l mai așteaptă;
- nu mai intră în numărul de angajați al clientului, după care se decide ce documente îi trebuie (vezi [Angajați](/clienti/angajati/));
- nu mai ocupă postul: un post ocupat doar de foști angajați poate fi arhivat.

Rămân neschimbate instruirile înregistrate, rezultatele testelor, fișierele și cele două fișe individuale de instruire, pe care le poți descărca oricând de la **Foști angajați**, cât timp clientul există. Poți corecta în continuare datele lui și poți înregistra o instruire de pe o fișă pe hârtie mai veche.

Accesul la portal rămâne: angajatul își poate vedea în continuare instruirile și fișele. Dacă angajatorul cere, revocă-l din **Acces la portal**, pe pagina angajatului (vezi [Portalul și actul adițional](/clienti/angajati/portal-si-act-aditional/)).

## Reactivarea

**Reactivează…** îl readuce printre angajații actuali și șterge data plecării. Folosește-o doar ca să corectezi o plecare marcată din greșeală sau cu o dată greșită: reactivează, apoi marchează din nou plecarea, cu data bună.

## Reangajarea

Cineva care revine după o pauză se adaugă ca angajat nou, cu data noii angajări. Instruirea lui începe din nou cu instruirile la angajare, iar rândul vechi rămâne la **Foști angajați**, cu evidența de atunci.

CNP-ul și marca sunt unice la client și față de foștii angajați. Dacă fostul rând are CNP-ul sau marca completate, noul rând nu le poate primi și vezi „Există deja un angajat cu acest CNP la client.” Deocamdată, scrie CNP-ul și marca doar pe unul dintre rânduri.

## Un angajat nu se șterge

Aplicația nu șterge angajați, nici pe cei plecați, și nu mută un angajat la alt client. Plecarea e singura schimbare de situație: evidența unui angajat rămâne la clientul la care l-ai adăugat.
