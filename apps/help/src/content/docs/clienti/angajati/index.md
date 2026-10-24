---
title: Angajați
description: Lista angajaților unui client, filtrele ei, stările instruirii și ale testării, și pagina fiecărui angajat.
topics:
  - id: angajati.lista
    heading: Lista angajaților
  - id: angajati.actuali-si-fosti
    heading: Angajați actuali și foști angajați
  - id: angajati.cautare
    heading: Căutarea
  - id: angajati.filtre-stari
    heading: Filtrele după stare
  - id: angajati.toti-angajatii
    heading: Angajații tuturor clienților
  - id: angajati.stare-instruire
    heading: Starea instruirii
  - id: angajati.stare-neinstruit
    heading: Neinstruit
  - id: angajati.stare-la-zi
    heading: La zi
  - id: angajati.stare-scadenta
    heading: Scadentă
  - id: angajati.stare-depasita
    heading: Depășită
  - id: angajati.stare-testare
    heading: Starea testării
  - id: angajati.test-fara-test
    heading: Fără test
  - id: angajati.test-de-sustinut
    heading: De susținut
  - id: angajati.test-promovat
    heading: Promovat
  - id: angajati.test-anual-scadent
    heading: Anual scadent
  - id: angajati.numar-angajati
    heading: De ce contează numărul de angajați
  - id: angajati.pagina-angajatului
    heading: Pagina unui angajat
  - id: angajati.fisiere
    heading: Fișierele angajatului
  - id: angajati.client-arhivat
    heading: Angajații unui client arhivat
sources:
  - docs/architecture/adr-006-job-positions.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-013-client-files.md
  - docs/architecture/adr-020-fire-safety-from-ten-employees.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-024-knowledge-tests.md
  - docs/architecture/adr-027-dashboard.md
  - packages/contracts/src/employees.ts
  - packages/contracts/src/organization-employees.ts
  - packages/contracts/src/trainings.ts
  - packages/contracts/src/tests.ts
  - apps/api/src/modules/employees/handlers.ts
  - apps/app/src/features/employees/employees-page.tsx
  - apps/app/src/features/employees/organization-employees-page.tsx
  - apps/app/src/features/employees/employee-columns.tsx
  - apps/app/src/features/employees/employee-layout.tsx
  - apps/app/src/features/employees/employee-page.tsx
  - apps/app/src/features/trainings/training-state-filter.tsx
  - apps/app/src/features/trainings/training-state-badge.tsx
  - apps/app/src/features/knowledge-tests/test-state-filter.tsx
  - apps/app/src/features/knowledge-tests/test-state-badge.tsx
  - apps/app/src/features/client-files/client-files-card.tsx
  - supabase/migrations/20261016210000_training_records.sql
  - supabase/migrations/20261017100000_training_interval_source.sql
  - supabase/migrations/20261020100000_knowledge_tests.sql
  - supabase/migrations/20260923110000_client_current_employee_count.sql
---

Aici ții evidența oamenilor fiecărui client: cine lucrează acolo, pe ce post, și dacă instruirea și testarea lor sunt la zi. De la angajați pornesc fișele individuale de instruire, testele din portal și semnăturile.

## Lista angajaților

Lista unui client e în tabul **Angajați** al clientului. Fiecare rând arată:

- **Angajat**: numele, cu marca dedesubt când există;
- **Post de lucru**: postul pe care îl ocupă; funcția din contract e pe pagina lui;
- **Instruire SSM** și **Instruire PSI**: starea instruirii în fiecare domeniu, cu termenul sub ea;
- **Testare**: starea testării, pe rânduri separate pentru SSM și PSI;
- **Contact**: emailul și telefonul;
- **Angajat din**: data angajării și, la un fost angajat, data plecării.

Poți ordona lista după nume, post sau data angajării. Din meniul de la capătul rândului ajungi la **Modifică** și **Marchează plecarea…**. Un clic pe rând deschide pagina angajatului.

Adaugi un angajat cu **Adaugă angajat**. Ce cere formularul găsești în [Adăugarea și modificarea unui angajat](/clienti/angajati/adaugare-si-editare/).

### Angajați actuali și foști angajați

Lista arată implicit **Angajați actuali**. Cine a plecat trece la **Foști angajați**, cu toate instruirile, fișele și fișierele lui. Un fost angajat nu mai are stare a instruirii sau a testării, așa că pe acest tab filtrele după stare nu apar. Vezi [Plecarea unui angajat](/clienti/angajati/plecare/).

### Căutarea

Caută după nume sau după marcă. Fiecare cuvânt scris trebuie să se regăsească undeva în nume sau în marcă, iar diacriticele și literele mari nu contează: „stefan tar” îl găsește pe „Țăranu Ștefan”. Poți scrie și doar o parte dintr-un nume.

### Filtrele după stare

**Instruire:** și **Testare:** restrâng lista la o stare. Un filtru citește ambele domenii:

- **La zi** înseamnă la zi și în SSM, și în PSI;
- celelalte stări (**Scadente**, **Depășite**, **Neinstruiți**; **De susținut**, **Anual scadent**, **Fără test**) îi arată pe cei care sunt în acea stare în cel puțin un domeniu.

Așa, filtrul îți arată pe oricine are ceva de rezolvat, indiferent de domeniu. Când niciun angajat nu e în starea aleasă, lista spune asta și îți oferă **Arată toți angajații**.

### Angajații tuturor clienților

**Angajați** din meniul lateral strânge într-o singură listă angajații tuturor clienților tăi activi, cu aceleași taburi și filtre. Are în plus coloana clientului și un filtru după client, iar căutarea găsește și după numele clientului. Clienții potențiali și clienții arhivați nu apar aici. Angajații se adaugă tot din pagina fiecărui client.

Când ajungi aici din **Dashboard**, de la cifrele unui domeniu, filtrul citește doar acel domeniu: „La zi” din rândul SSM înseamnă la zi în SSM, oricum ar fi în PSI. Dacă alegi sau ștergi un filtru pe pagină, lista revine la ambele domenii.

## Starea instruirii

Fiecare angajat actual are o stare pentru SSM și una pentru PSI. Aplicația o calculează din instruirile înregistrate și din termenul următoarei instruiri; nu o alegi tu și nu se salvează nicăieri, așa că e mereu cea de azi. Zilele sunt ale calendarului din România. Cum se calculează termenul vezi în [Termenul următoarei instruiri](/clienti/angajati/instruire-si-teste/).

### Neinstruit

Angajatul nu are încă nicio instruire la angajare în acel domeniu: nici introductiv-generală, nici la locul de muncă. Nu are termen. Trece în altă stare imediat ce înregistrezi una dintre cele două.

### La zi

Angajatul are instruirea la angajare, iar termenul următoarei instruiri e la mai mult de 30 de zile.

Tot **La zi** apare când intervalul de instruire al angajatului nu este stabilit, pentru că atunci nu există un termen. Pe pagina angajatului vezi „Intervalul de instruire nu este stabilit” și linkul **Stabilește intervalul**.

### Scadentă

Termenul cade în următoarele 30 de zile, cu ziua de azi inclusiv. Sub stare vezi „până la” și data. E timpul să programezi instruirea periodică.

### Depășită

Termenul a trecut. Sub stare vezi „din” și data de la care e depășită. Angajatul revine **La zi** când înregistrezi instruirea periodică.

## Starea testării

Fiecare angajat actual are o stare a testării pentru SSM și una pentru PSI, calculată la fel ca starea instruirii. Ce teste există și când apar vezi în [Testarea](/clienti/angajati/instruire-si-teste/).

### Fără test

Încă nu e înregistrată instruirea pe care o încheie testul la angajare: cea introductiv-generală pentru SSM, cea la locul de muncă pentru PSI.

### De susținut

Instruirea e înregistrată, iar testul la angajare nu e promovat încă. Testul îl așteaptă pe angajat în portal sau, dacă nu folosește portalul, pe hârtie.

### Promovat

Angajatul a promovat testul. În PSI, starea ține 12 luni de la ultimul test promovat. Filtrul **La zi** de la **Testare:** îi arată pe cei promovați în ambele domenii.

### Anual scadent

Doar în PSI: au trecut 12 luni de la ultimul test promovat, iar testul anual îl așteaptă pe angajat până îl promovează.

## De ce contează numărul de angajați

Aplicația numără angajații actuali ai clientului; foștii angajați nu intră în număr. După acest număr se decide ce documente îi trebuie clientului:

- de la 10 angajați, setul SSM cere decizia privind reprezentanții lucrătorilor: cel puțin unul de la 10 angajați și doi de la 50 (HG 1425/2006, art. 53 alin. (1));
- de la 10 angajați, setul PSI cuprinde și documentele pe care OMAI 163/2007 le cere doar operatorilor cu cel puțin numărul de salariați al unei întreprinderi mici (art. 20 alin. (1)), prag pe care aplicația îl socotește la 10 angajați.

Un document generat când clientul avea 10 angajați rămâne în set și dacă numărul scade sub 10. Ține deci lista la zi: un angajat care a plecat și nu e marcat ca atare schimbă ce documente îi cere aplicația clientului.

## Pagina unui angajat

În capul paginii vezi postul, clientul și dacă e **Angajat actual** sau **Fost angajat**, cu **Modifică** și **Marchează plecarea…** (sau **Reactivează…**). Dedesubt sunt trei taburi:

- **Date**: identificarea, angajarea, contactul, datele pentru fișa de instruire, accesul la portal, actul adițional privind semnarea electronică și fișierele angajatului;
- **Instruire SSM** și **Instruire PSI**: starea și termenul, testarea, instruirile înregistrate și fișa individuală. Vezi [Instruirea și testele unui angajat](/clienti/angajati/instruire-si-teste/).

CNP-ul apare ascuns, cu ultimele patru cifre. **Arată** îl afișează întreg până pleci de pe pagină. **Vechime** se calculează din data angajării până azi, iar la un fost angajat până la data plecării.

Accesul la portal și actul adițional sunt explicate în [Portalul și actul adițional](/clienti/angajati/portal-si-act-aditional/).

### Fișierele angajatului

În **Fișiere** încarci fotografiile sau scanurile fișelor de instruire completate pe hârtie, actul adițional semnat de mână și orice alt fișier despre angajat. Fișierele unui angajat apar doar pe pagina lui, nu și în **Alte documente** ale clientului, unde rămân fișierele clientului.

## Angajații unui client arhivat

La un client arhivat, angajații și toată evidența lor rămân de citit, dar nimic nu se mai schimbă: nu poți adăuga sau modifica angajați, marca plecări, înregistra instruiri sau trimite invitații în portal. Butoanele acestor acțiuni nu mai apar.
