---
title: Plecarea unui lucrător
description: Cum marchezi plecarea unui lucrător, ce rămâne din evidența lui și cum corectezi o plecare marcată din greșeală.
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
    heading: Un lucrător nu se șterge
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
  - supabase/migrations/20261101191000_employee_identifiers_per_employment.sql
---

Un lucrător care pleacă nu dispare din aplicație. Trece la foștii lucrători ai clientului, cu instruirile, fișele și fișierele lui, pentru că acestea sunt dovezi care se păstrează și după încetarea contractului.

## Marcarea plecării

Alege **Marchează plecarea…** din capul paginii lucrătorului sau din meniul rândului său din listă. În dialog alegi data plecării și confirmi cu **Confirmă plecarea**.

Concediile, șomajul tehnic sau suspendarea contractului nu sunt plecări: lucrătorul rămâne lucrător actual. Revenirea după o absență de peste 30 de zile lucrătoare se înregistrează ca instruire periodică suplimentară (vezi [Instruirea și testele unui lucrător](/clienti/angajati/instruire-si-teste/)).

### Data plecării

Ziua în care a încetat contractul. Dialogul propune ziua de azi și îți arată data angajării. Data plecării nu poate fi înaintea datei angajării; altfel vezi „Data plecării nu poate fi înaintea datei angajării.”

## Ce rămâne după plecare

Din ziua în care marchezi plecarea:

- lucrătorul apare la **Foști lucrători**, cu „până la” și data plecării sub data angajării, și în capul paginii lui scrie **Fost lucrător**;
- nu mai are stare a instruirii sau a testării: pe pagina lui scrie „Fără termen: nu mai lucrează la client”, iar testele nu-l mai așteaptă;
- nu mai intră în numărul de lucrători al clientului, după care se decide ce documente îi trebuie (vezi [Lucrători](/clienti/angajati/));
- nu mai ocupă postul: un post ocupat doar de foști lucrători poate fi arhivat.

Rămân neschimbate instruirile înregistrate, rezultatele testelor, fișierele și cele două fișe individuale de instruire, pe care le poți descărca oricând de la **Foști lucrători**, cât timp clientul există. Poți corecta în continuare datele lui și poți înregistra o instruire de pe o fișă pe hârtie mai veche.

Accesul la portal rămâne: lucrătorul își poate vedea în continuare instruirile și fișele. Dacă angajatorul cere, revocă-l din **Acces la portal**, pe pagina lucrătorului (vezi [Portalul și actul adițional](/clienti/angajati/portal-si-act-aditional/)).

## Reactivarea

**Reactivează…** îl readuce printre lucrătorii actuali și șterge data plecării. Folosește-o doar ca să corectezi o plecare marcată din greșeală sau cu o dată greșită: reactivează, apoi marchează din nou plecarea, cu data bună.

Un fost lucrător nu poate fi reactivat cât timp un lucrător actual al clientului are același CNP sau aceeași marcă, de obicei rândul adăugat când persoana a fost reangajată. Atunci vezi „Nu poate fi reactivat: un lucrător actual al clientului are același CNP, de obicei rândul adăugat la reangajare.” Evidența de acum a persoanei e pe rândul acela.

## Reangajarea

Cineva care revine după o pauză se adaugă ca lucrător nou, cu data noii angajări. Instruirea lui începe din nou cu instruirile la angajare, iar rândul vechi rămâne la **Foști lucrători**, cu evidența de atunci.

Rândul nou primește același CNP și, dacă clientul i-a păstrat-o, aceeași marcă: CNP-ul și marca sunt unice doar printre lucrătorii actuali, iar fostul rând nu le mai ține ocupate.

Dacă fostul rând are încă acces la portal, revocă-l din **Acces la portal**, pe pagina fostului rând, înainte să inviți rândul nou la aceeași adresă (vezi [Portalul și actul adițional](/clienti/angajati/portal-si-act-aditional/)).

## Un lucrător nu se șterge

Aplicația nu șterge lucrători, nici pe cei plecați, și nu mută un lucrător la alt client. Plecarea e singura schimbare de situație: evidența unui lucrător rămâne la clientul la care l-ai adăugat.
