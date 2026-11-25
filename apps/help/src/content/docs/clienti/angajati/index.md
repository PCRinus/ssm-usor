---
title: Lucrători
description: Lista lucrătorilor unui client, căutarea și filtrele ei, stările instruirii și ale testării, și pagina fiecărui lucrător.
topics:
  - id: angajati.lista
    heading: Lista lucrătorilor
  - id: angajati.actuali-si-fosti
    heading: Actuali și foști
  - id: angajati.cautare
    heading: Căutarea
  - id: angajati.filtre-stari
    heading: Filtrele
  - id: angajati.toti-angajatii
    heading: Lucrătorii tuturor clienților
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
    heading: De ce contează numărul de lucrători
  - id: angajati.pagina-angajatului
    heading: Pagina unui lucrător
  - id: angajati.fisiere
    heading: Documentele lucrătorului
  - id: angajati.client-arhivat
    heading: Lucrătorii unui client arhivat
sources:
  - docs/architecture/adr-006-job-positions.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-013-client-files.md
  - docs/architecture/adr-020-fire-safety-from-ten-employees.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-024-knowledge-tests.md
  - docs/architecture/adr-027-dashboard.md
  - docs/architecture/adr-032-employees-imported-from-training-sheets.md
  - packages/contracts/src/employees.ts
  - packages/contracts/src/organization-employees.ts
  - packages/contracts/src/trainings.ts
  - packages/contracts/src/tests.ts
  - apps/api/src/modules/employees/handlers.ts
  - apps/app/src/features/employees/employees-page.tsx
  - apps/app/src/features/imports/employees/employee-import-entry.tsx
  - apps/app/src/features/employees/organization-employees-page.tsx
  - apps/app/src/features/employees/employee-columns.tsx
  - apps/app/src/features/employees/worker-columns.tsx
  - apps/app/src/features/employees/worker-filters.tsx
  - apps/app/src/features/duties-acknowledgements/duties-format.ts
  - docs/architecture/adr-046-ssm-duties-for-job-descriptions.md
  - apps/app/src/features/employees/employee-layout.tsx
  - apps/app/src/features/employees/employee-page.tsx
  - apps/app/src/features/employees/employee-sections.ts
  - apps/app/src/features/client-files/employee-files-card.tsx
  - apps/app/src/features/trainings/training-state-badge.tsx
  - apps/app/src/features/knowledge-tests/test-state-badge.tsx
  - apps/app/src/features/client-files/client-files-card.tsx
  - supabase/migrations/20261016210000_training_records.sql
  - supabase/migrations/20261017100000_training_interval_source.sql
  - supabase/migrations/20261020100000_knowledge_tests.sql
  - supabase/migrations/20260923110000_client_current_employee_count.sql
  - supabase/migrations/20261118120000_employee_list.sql
---

Aici ții evidența oamenilor fiecărui client: cine lucrează acolo, pe ce post, și dacă instruirea și testarea lor sunt la zi. De la lucrători pornesc fișele individuale de instruire, testele din portal și semnăturile.

## Lista lucrătorilor

Lista unui client e în tabul **Lucrători** al clientului. Fiecare rând arată:

- **Lucrător**: numele, cu marca dedesubt când există;
- **Post de lucru**: postul pe care îl ocupă; funcția din contract e pe pagina lui. Sub post apare, cu galben, un rând despre fișa de luare la cunoștință a atribuțiilor SSM, doar când e ceva de făcut: „Atribuții SSM nesemnate”, „Atribuții SSM noi, nesemnate”, când fișa semnată nu mai corespunde, sau „Postul lipsește din doc. 13”, când ultimul document 13 emis nu are anexă pentru post. Vezi [Fișa de luare la cunoștință a atribuțiilor SSM](/clienti/angajati/instruire-si-teste/#fișa-de-luare-la-cunoștință-a-atribuțiilor-ssm);
- **Instruire SSM** și **Instruire SU**: starea instruirii în fiecare domeniu, cu termenul sub ea;
- **Testare**: doar ce cere o acțiune, pe un singur rând, de exemplu „De susținut”, „Neverificat pe fișă” sau „SU: anual scadent”, pentru oricare dintre domenii. Când nu e nimic de făcut, vezi **La zi** dacă lucrătorul a promovat testele din ambele domenii, ca la filtrul **La zi**; dacă a promovat într-un domeniu și în celălalt nu are încă test, vezi de exemplu „SU: fără test”; altfel o liniuță;
- **De semnat**: câte semnături electronice îi mai cer lucrătorului instruirile și testele lui, de exemplu „2 în așteptare”;
- **Angajat din**: data angajării.

Poți ordona lista după nume, post, instruirea SSM, instruirea SU sau data angajării. Ordonată după instruire, lista arată întâi lucrătorii cu instruirea depășită, apoi pe cei neinstruiți, pe cei cu instruirea scadentă și la sfârșit pe cei la zi; în fiecare grupă, după termen. Din meniul de la capătul rândului ajungi la **Modifică** și **Trece la foști lucrători…** (la **Foști**, **Anulează trecerea la foști…**). Un clic pe rând deschide pagina lucrătorului. Pe un ecran îngust, tabelul se derulează în lateral.

Deasupra listei vezi câți lucrători are. Când cauți sau filtrezi, vezi câți se potrivesc din total, de exemplu „5 din 25 de lucrători”.

Adaugi un lucrător cu **Adaugă manual** (la un client fără lucrători, cardul **Adaugă manual**, în locul listei). Ce cere formularul găsești în [Adăugarea și modificarea unui lucrător](/clienti/angajati/adaugare-si-editare/). Lucrătorii unui client pe care îl preiei îi poți aduce și cu **Adaugă cu AI**, din fotografiile fișelor lor de instruire, pe care AI-ul le citește și îți propune lucrătorii: vezi [Importul lucrătorilor din fișe](/clienti/import/#importul-lucrătorilor-din-fișe).

Cât timp un import din fișe al clientului nu e încheiat, deasupra listei vezi un rând despre el, de exemplu „Un import din fișe așteaptă verificarea: 9 persoane, până pe 2 dec.”, cu butonul care te duce la import: **Continuă importul** sau, cât se citește ori dacă s-a oprit, **Vezi importul**. La import renunți din pagina lui, cu **Renunță la import** (cât se citește, **Oprește importul**). Rândul dispare după ce creezi lucrătorii sau renunți; după creare, în locul lui apare pasul următor, invitarea lucrătorilor în portal.

### Actuali și foști

Lista arată implicit tabul **Actuali**. Cine a plecat trece la **Foști**, cu toate instruirile, fișele și fișierele lui, iar lista lor are în plus coloana **Data încetării**, ziua în care i-a încetat contractul; o poți ordona și după ea. Un fost lucrător nu mai are stare a instruirii, a testării sau a atribuțiilor SSM, așa că pe acest tab filtrele după instruire, testare și atribuții SSM nu apar. Vezi [Plecarea unui lucrător](/clienti/angajati/plecare/).

Când treci de pe un tab pe altul, căutarea și filtrele după post, punct de lucru sau client rămân.

### Căutarea

Caută după nume sau după marcă. Fiecare cuvânt scris trebuie să se regăsească undeva în nume sau în marcă, iar diacriticele și literele mari nu contează: „stefan tar” îl găsește pe „Țăranu Ștefan”. Poți scrie și doar o parte dintr-un nume. Căutarea nu citește CNP-ul și nici numele clientului; pentru client folosești filtrul **Client**.

### Filtrele

Butonul **Filtre** deschide filtrele listei. Le poți combina; un lucrător apare dacă se potrivește cu cel puțin o valoare aleasă din fiecare filtru:

- **Instruire SSM** și **Instruire SU**, fiecare citind doar domeniul lui: **De instruit (neinstruiți sau depășiți)**, **Neinstruiți**, **Depășită**, **Scadentă în 30 de zile** sau **La zi**;
- **Testare**: **De susținut**, **Anual scadent**, **Neverificat pe fișă** și **Fără test** îi arată pe cei care sunt în acea stare în cel puțin un domeniu; **La zi** îi arată pe cei care au promovat în ambele domenii;
- **Necesită atenție**: **Semnături în așteptare**, lucrătorii care au de semnat electronic o instruire sau un test; **Fără telefon** și **Fără email**, lucrătorii cărora le lipsește un mijloc de contact, de care au nevoie pentru portal și semnătură;
- **Atribuții SSM**: starea fișei de luare la cunoștință a atribuțiilor SSM: **Semnate**, **Nesemnate**, **Noi, nesemnate** (fișa semnată nu mai corespunde anexei postului sau rolurilor lucrătorului) și **Postul lipsește din doc. 13**. Cât timp clientul nu are documentul 13 emis, niciun lucrător nu se potrivește;
- **Post de lucru**: posturile clientului; poți alege mai multe, căutându-le după nume;
- **Punct de lucru**: punctele de lucru ale clientului, când are mai multe, și **Fără punct de lucru**, când unii lucrători nu au unul; la acesta ajungi și din numărul de pe rândul **Fără punct de lucru** de la tabul **Detalii**.

Filtrele alese apar sub câmpul de căutare; scoți unul cu semnul x de lângă el, sau pe toate cu **Șterge filtrele**, care lasă căutarea neatinsă. Pe telefon, filtrele se deschid într-un panou de jos: un filtru se desface la apăsare, iar posturile și clienții au lista lor, cu căutare; le aplici cu butonul care arată câți lucrători se potrivesc. Căutarea și filtrele rămân în adresa paginii, așa că le regăsești când revii sau dai înapoi.

Când niciun lucrător nu se potrivește, lista spune asta, filtrele rămân vizibile și **Șterge filtrele** pornește din nou de la toți lucrătorii.

Când ajungi din lista clienților, de la coloana **Instruire**, lista se deschide filtrată pe aceiași lucrători pe care îi numără coloana, în ambele domenii: la **Necesită atenție** vezi **De instruit, SSM sau SU** sau **Instruire scadentă în 30 de zile, SSM sau SU**; de la **La zi**, filtrele **Instruire SSM** și **Instruire SU** sunt amândouă pe **La zi**.

### Lucrătorii tuturor clienților

**Lucrători** din meniul lateral strânge într-o singură listă lucrătorii tuturor clienților tăi activi, cu aceleași taburi, căutare și filtre. Are în plus coloana **Client**, un link spre pagina clientului, și filtrul **Client**, din care alegi unul sau mai mulți clienți, căutându-i după nume; filtrele **Post de lucru** și **Punct de lucru** nu apar aici, pentru că fiecare client are posturile și punctele lui. Ofertele și clienții arhivați nu apar aici. Lucrătorii se adaugă tot din pagina fiecărui client.

Când ajungi aici din **Dashboard**, de la cifrele unui domeniu, lista se deschide cu filtrul acelui domeniu: de la **Depășite** din rândul SSM, **Instruire SSM** e pe **Depășită**, oricum ar fi în SU.

## Starea instruirii

Fiecare lucrător actual are o stare pentru SSM și una pentru SU. Aplicația o calculează din instruirile înregistrate și din termenul următoarei instruiri; nu o alegi tu și nu se salvează nicăieri, așa că e mereu cea de azi. Zilele sunt ale calendarului din România. Cum se calculează termenul vezi în [Termenul următoarei instruiri](/clienti/angajati/instruire-si-teste/).

### Neinstruit

Lucrătorul nu are încă nicio instruire la angajare în acel domeniu: nici introductiv-generală, nici la locul de muncă. Nu are termen. Trece în altă stare imediat ce înregistrezi una dintre cele două.

### La zi

Lucrătorul are instruirea la angajare, iar termenul următoarei instruiri e la mai mult de 30 de zile.

Tot **La zi** apare când intervalul de instruire al lucrătorului nu este stabilit, pentru că atunci nu există un termen. Pe pagina lucrătorului vezi „Intervalul de instruire nu este stabilit” și linkul **Stabilește intervalul**.

### Scadentă

Termenul cade în următoarele 30 de zile, cu ziua de azi inclusiv. Sub stare vezi „până la” și data. E timpul să programezi instruirea periodică.

### Depășită

Termenul a trecut. Sub stare vezi „din” și termenul care a trecut. Lucrătorul revine **La zi** când înregistrezi instruirea periodică.

## Starea testării

Fiecare lucrător actual are o stare a testării pentru SSM și una pentru SU, calculată la fel ca starea instruirii. Ce teste există și când apar vezi în [Testarea](/clienti/angajati/instruire-si-teste/).

### Fără test

Încă nu e înregistrată instruirea pe care o încheie testul la angajare: cea introductiv-generală pentru SSM, cea la locul de muncă pentru SU.

### De susținut

Instruirea e înregistrată, iar testul la angajare nu e promovat încă. Testul îl așteaptă pe lucrător în portal sau, dacă nu folosește portalul, pe hârtie.

### Neverificat pe fișă

Instruirea la angajare e transcrisă de pe fișa pe hârtie, iar testul care a încheiat-o nu e înregistrat, de obicei pentru că semnătura celui care a verificat cunoștințele nu se vede clar pe fișă sau lipsește. Testul s-a dat pe hârtie, odată cu instruirea, așa că nu îl mai așteaptă pe lucrător: nu apare în portal și nu se numără pe **Dashboard**. Dacă originalul arată testul promovat, îl înregistrezi ca rezultat de pe hârtie. Vezi [Când îl așteaptă un test](/clienti/angajati/instruire-si-teste/).

### Promovat

Lucrătorul a promovat testul. În SU, starea ține 12 luni de la ultimul test promovat. Filtrul **La zi** de la **Testare:** îi arată pe cei promovați în ambele domenii.

### Anual scadent

Doar în SU: au trecut 12 luni de la ultimul test promovat, iar testul anual îl așteaptă pe lucrător până îl promovează.

## De ce contează numărul de lucrători

Aplicația numără lucrătorii actuali ai clientului; foștii lucrători nu intră în număr. După acest număr se decide ce documente îi trebuie clientului:

- de la 10 lucrători, setul SSM cere decizia privind reprezentanții lucrătorilor (1.5): unul între 10 și 49 de lucrători, doi între 50 și 100, iar peste 100 numărul din art. 60 alin. (3) (HG 1425/2006, art. 53 alin. (2));
- de la 10 lucrători, setul SU cuprinde și documentele pe care OMAI 163/2007 le cere doar operatorilor cu cel puțin numărul de salariați al unei întreprinderi mici (art. 20 alin. (1)), adică cel puțin 10 salariați; legea se uită la numărul mediu anual de salariați, iar aplicația numără lucrătorii actuali.

Un document generat când clientul avea 10 lucrători rămâne în set și dacă numărul scade sub 10. Ține deci lista la zi: un lucrător care a plecat și nu e trecut la foști schimbă ce documente îi cere aplicația clientului.

## Pagina unui lucrător

În capul paginii vezi postul și clientul, fiecare cu legătură spre pagina lui, și dacă e **Lucrător actual** sau **Fost lucrător**. Alături e **Trece la foști lucrători…** (la un fost lucrător, **Anulează trecerea la foști…**; vezi [Plecarea unui lucrător](/clienti/angajati/plecare/)). Cât timp actul adițional al unui lucrător care intră în portal nu e semnat, tot aici apare **Act adițional nesemnat**, care te duce la tabul **Portal**, iar tabul are un triunghi galben. Dedesubt sunt cinci taburi:

- **Date**: angajarea, identitatea, contactul și adresele, datele pentru fișele de instruire și observațiile, fiecare în panoul ei, cu **Modifică** lângă titlu. Vezi [Modificarea datelor](/clienti/angajati/adaugare-si-editare/#modificarea-datelor);
- **Instruire SSM** și **Instruire SU**: starea și termenul, testarea, instruirile înregistrate și fișa individuală. Vezi [Instruirea și testele unui lucrător](/clienti/angajati/instruire-si-teste/);
- **Documente**: fișierele încărcate despre lucrător, cu fișele aduse dintr-un import. Vezi [Documentele lucrătorului](#documentele-lucrătorului);
- **Portal**: accesul la portal și actul adițional privind semnarea electronică.

CNP-ul apare ascuns, cu ultimele patru cifre. Ochiul de după el îl afișează întreg până îl ascunzi din nou sau pleci de pe pagină. Vechimea, sub data angajării, se calculează până azi, iar la un fost lucrător până la data încetării.

Accesul la portal și actul adițional sunt explicate în [Portalul și actul adițional](/clienti/angajati/portal-si-act-aditional/).

### Documentele lucrătorului

Pe tabul **Documente** încarci fotografiile sau scanurile fișelor de instruire completate pe hârtie, actul adițional semnat de mână și orice alt fișier despre lucrător. Fișierele unui lucrător apar doar pe pagina lui, nu și în **Alte documente** ale clientului. Lista, căutarea, filtrele și fișele aduse dintr-un import sunt explicate în [Documentele lucrătorului](/clienti/fisiere/#documentele-lucrătorului).

## Lucrătorii unui client arhivat

La un client arhivat, lucrătorii și toată evidența lor rămân de citit, dar nimic nu se mai schimbă: nu poți adăuga sau modifica lucrători, trece lucrători la foști, înregistra instruiri sau trimite invitații în portal. Butoanele acestor acțiuni nu mai apar, iar pagina fiecărui lucrător începe cu mențiunea **Client arhivat**.
