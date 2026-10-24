---
title: Instruirea și testele unui angajat
description: Ce arată taburile Instruire SSM și Instruire PSI ale unui angajat, cum se calculează termenul, când îl așteaptă un test și cum se întocmește fișa individuală.
topics:
  - id: angajati.instruire
    heading: Taburile de instruire
  - id: angajati.termen-instruire
    heading: Termenul următoarei instruiri
  - id: angajati.interval-instruire
    heading: Intervalul de instruire
  - id: angajati.inregistrare-instruire
    heading: Înregistrarea unei instruiri
  - id: angajati.instruire-suplimentara
    heading: Instruirea periodică suplimentară
  - id: angajati.instruire-de-pe-hartie
    heading: Instruirile de pe fișa de hârtie
  - id: angajati.modificare-instruire
    heading: Modificarea și ștergerea unei instruiri
  - id: angajati.testare
    heading: Testarea
  - id: angajati.test-la-angajare
    heading: Când îl așteaptă un test
  - id: angajati.test-in-portal
    heading: Testul în portal
  - id: angajati.rezultat-de-pe-hartie
    heading: Rezultatul de pe hârtie
  - id: angajati.examinator
    heading: Examinatorul
  - id: angajati.fisa-de-test
    heading: Fișa de test
  - id: angajati.fisa-individuala
    heading: Fișa individuală de instruire
  - id: angajati.fisa-date-lipsa
    heading: Ce lipsește pentru fișă
  - id: angajati.fisa-originale
    heading: Copia de citire și originalele
  - id: angajati.semnaturi-instruire
    heading: Semnăturile unei instruiri
sources:
  - docs/architecture/adr-006-job-positions.md
  - docs/architecture/adr-008-applicable-training-categories.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - docs/architecture/adr-024-knowledge-tests.md
  - packages/contracts/src/trainings.ts
  - packages/contracts/src/tests.ts
  - packages/contracts/src/job-positions.ts
  - apps/api/src/modules/trainings/sheet.ts
  - apps/app/src/features/trainings/employee-training-tab.tsx
  - apps/app/src/features/trainings/delete-training-dialog.tsx
  - apps/app/src/features/knowledge-tests/employee-tests-card.tsx
  - apps/app/src/features/knowledge-tests/test-result-dialog.tsx
  - apps/app/src/features/training-sheets/training-sheet-readiness.tsx
  - apps/app/src/features/training-sheets/training-sheet-download.tsx
  - apps/app/src/features/signatures/use-record-signatures.ts
  - apps/app/src/features/missing-data/missing-rows.ts
  - supabase/migrations/20261016210000_training_records.sql
  - supabase/migrations/20261017100000_training_interval_source.sql
  - supabase/migrations/20261020100000_knowledge_tests.sql
---

Pe pagina unui angajat, **Instruire SSM** și **Instruire PSI** adună tot ce ține de instruirea lui în acel domeniu: starea și termenul, testele, fiecare instruire la care a participat și fișa individuală.

## Taburile de instruire

Cele două taburi arată la fel. Sus ai **Descarcă fișa**, **Previzualizează** și **Înregistrează o instruire**. Dedesubt:

- **Starea instruirii**: Neinstruit, La zi, Scadentă sau Depășită (vezi [Starea instruirii](/clienti/angajati/));
- **Următoarea instruire**: termenul, sau de ce nu există încă unul;
- **Intervalul de instruire**: la câte luni se repetă instruirea periodică și de unde vine intervalul;
- **Ultima instruire periodică**;
- **Testare**: starea testării, rezultatele și încercările din portal;
- lista instruirilor angajatului în acel domeniu.

## Termenul următoarei instruiri

Termenul e ziua de la care angajatul trebuie instruit din nou. Aplicația îl calculează așa: ia ziua ultimei instruiri periodice; dacă nu există, ziua instruirii la locul de muncă; dacă nici ea nu e înregistrată, data angajării. La ea adaugă intervalul de instruire.

De exemplu: un angajat instruit la locul de muncă pe 10 martie 2026, cu un interval de 6 luni, are termenul pe 10 septembrie 2026. După periodica din 4 septembrie 2026, termenul devine 4 martie 2027.

Câteva cazuri:

- Până la prima instruire la angajare, angajatul nu are termen: vezi „După instruirea la angajare”.
- După instruirea introductiv-generală singură, termenul se socotește tot de la data angajării.
- O instruire periodică suplimentară nu mută termenul, pentru că se face în plus față de cea programată (HG 1425/2006, art. 98).
- Fără interval stabilit, nu există termen: vezi „Intervalul de instruire nu este stabilit”, iar starea rămâne La zi.

### Intervalul de instruire

Intervalul vine din locuri diferite în cele două domenii:

- **SSM**: intervalul propriu al postului, dacă postul are unul; altfel, intervalul din programul de instruire al clientului pentru categoria de personal a postului. Sub interval scrie „din postul …” sau „din programul de instruire al clientului”, cu link spre locul unde îl schimbi.
- **PSI**: întotdeauna intervalul din datele de instruire PSI ale clientului, pentru categoria de personal a postului. Un post nu își poate avea propriul interval PSI.

În SSM, intervalul e de cel mult 6 luni pentru personalul de execuție și de cel mult 12 luni pentru personalul tehnico-administrativ (HG 1425/2006, art. 96).

**Nestabilit** înseamnă că programul clientului nu are încă un interval pentru categoria angajatului, sau că specialistul a ales „Nu se aplică” pentru ea. **Stabilește intervalul** te duce în programul de instruire al clientului.

## Înregistrarea unei instruiri

**Înregistrează o instruire** deschide formularul cu acest angajat ca singur participant. Tipul propus urmează ordinea legii: întâi introductiv-generală, apoi la locul de muncă, apoi periodică. O instruire la care au participat mai mulți angajați o înregistrezi o singură dată, din tabul **Instruiri ținute** al clientului, și apare la fiecare participant.

Ziua instruirii nu poate fi în viitor: o instruire se înregistrează după ce a avut loc. Fiecare instruire păstrează denumirea postului pe care îl avea angajatul în ziua ei, chiar dacă trece apoi pe alt post.

Instruirea la locul de muncă cuprinde și „admis la lucru”: ziua, numele și funcția celui care l-a admis pe angajat la lucru. Pe fișă, blocul apare sub această instruire.

### Instruirea periodică suplimentară

Alegi tipul **Periodică suplimentară** și motivul, unul dintre cazurile din HG 1425/2006, art. 98:

- absență de peste 30 de zile lucrătoare;
- modificarea prevederilor de securitate și sănătate în muncă sau a instrucțiunilor proprii;
- reluarea activității după un accident de muncă;
- executarea unor lucrări speciale;
- introducerea unui echipament de muncă sau modificarea celui existent;
- modificarea tehnologiilor existente sau a procedurilor de lucru;
- introducerea unei noi tehnologii sau proceduri de lucru.

Pe fișa SSM, instruirile suplimentare au tabelul lor. Pe fișa PSI apar în tabelul instruirilor periodice.

### Instruirile de pe fișa de hârtie

Pentru un angajat a cărui instruire s-a ținut până acum pe hârtie, înregistrează instruirile trecute cu sursa **De pe fișa de hârtie**: ziua, durata și materialul ca pe fișă. Semnăturile rămân pe hârtie, iar instruirea apare cu eticheta **De pe fișa de hârtie**.

Ca termenele să fie corecte, ajung instruirile la angajare și ultima instruire periodică. Fotografia sau scanul fișei de hârtie îl încarci în **Fișiere**, pe tabul **Date**.

Poți înregistra astfel și instruirile unui fost angajat.

### Modificarea și ștergerea unei instruiri

**Modifică** și **Șterge** schimbă instruirea pentru toți participanții ei. Dacă a avut mai mulți, dialogul îți spune câți.

O instruire semnată electronic nu se mai poate modifica și nici șterge: sub butoane vezi de ce. Ca s-o corectezi, anulează întâi semnăturile, cu un motiv. O instruire care are orice semnătură, chiar anulată sau pe hârtie, nu se mai poate șterge, pentru că semnăturile rămân în evidență.

## Testarea

Cardul **Testare** arată starea testării, ce urmează, rezultatele și încercările din portal. Stările sunt explicate în [Starea testării](/clienti/angajati/).

### Când îl așteaptă un test

Un test nu se trimite. Îl așteaptă pe angajat de la sine, din momentul în care e îndeplinită condiția:

- **Testul la angajare SSM** (TASSM), după ce înregistrezi instruirea introductiv-generală, pe care o încheie (HG 1425/2006, art. 89).
- **Testul la angajare PSI** (TASU), după ce înregistrezi instruirea la locul de muncă; un singur test le încheie pe amândouă instruirile la angajare (OMAI 712/2005, art. 14 și 20).
- **Testul anual PSI** (TPSU), la 12 luni de la ultimul test PSI promovat, până îl promovează (OMAI 712/2005, art. 30).

În SSM nu există test periodic.

Cât timp testul la angajare nu e promovat, vezi un avertisment pe tab. Aplicația doar semnalează lipsa: nu blochează nimic. Admiterea la lucru rămâne decizia angajatorului.

### Testul în portal

Un angajat cu acces la portal găsește testul acolo. Primește 10 întrebări alese la întâmplare din banca de întrebări a organizației și promovează cu 7 răspunsuri complet corecte din 10. Poate relua testul imediat, de câte ori e nevoie, cu alte întrebări.

La **Încercări în portal** vezi fiecare încercare cu scorul ei și dacă a fost promovată. **În curs** înseamnă o încercare începută și neterminată; angajatul o poate continua de unde a rămas.

### Rezultatul de pe hârtie

Pentru un angajat fără portal, tipărește testul din documentele clientului. După ce l-a completat și l-a promovat, alege **Înregistrează un rezultat de pe hârtie** și completează testul, ziua în care l-a susținut, examinatorul și funcția lui.

Butonul apare cât timp testul la angajare e de susținut și, în PSI, oricând după primul test promovat, pentru testul anual. Ziua nu poate fi în viitor. Un test nepromovat nu se înregistrează: contează susținerea următoare.

### Examinatorul

Examinatorul apare pe fișa individuală, în rândul rezultatului. Aplicația îl propune:

- în SSM, pe cel care a ținut instruirea introductiv-generală a angajatului;
- în PSI, pe cadrul tehnic PSI al organizației.

Dacă nu are pe cine propune, scrie „nenumit încă” și ai **Numește examinatorul**. Îl poți schimba cu **Modifică examinatorul** până când examinatorul semnează fișa de test.

### Fișa de test

Un test promovat în portal are fișa lui de test: un PDF cu întrebările, răspunsurile alese, scorul și calificativul, pe care îl semnează angajatul și examinatorul. Îl găsești sub rezultat. Un rezultat de pe hârtie nu are fișă de test, pentru că testul s-a semnat pe exemplarul tipărit.

Pe fișa individuală SSM, rezultatele apar în blocul „Rezultatele testărilor”. Pe fișa PSI, fiecare test promovat apare ca rând în tabelul instruirilor periodice, de exemplu „Verificare anuală pe bază de test (TPSU): admis”.

## Fișa individuală de instruire

Fiecare angajat are două fișe: fișa individuală de instruire SSM, după modelul din anexa 11 la HG 1425/2006, și fișa individuală de instructaj PSI, după modelul din anexa la OMAI 712/2005.

O fișă nu e un document din setul clientului. Se întocmește în momentul în care o descarci sau o previzualizezi, din datele angajatului și din instruirile lui de atunci, ca PDF. Nu are versiuni și nu se editează. Tipărește:

- datele de identificare ale angajatului;
- instruirile la angajare, fiecare cu ziua, durata, cine a instruit și materialul;
- blocul „admis la lucru”;
- un rând pentru fiecare instruire periodică și, pe fișa SSM, fiecare instruire suplimentară;
- rânduri goale până la capătul paginii, pentru semnăturile pe hârtie.

### Ce lipsește pentru fișă

O fișă se întocmește chiar dacă multe câmpuri sunt goale; ele se tipăresc goale. Doar două lipsuri o opresc:

- **Traseul de deplasare**, pentru fișa SSM;
- **Punctul de lucru**, pentru ambele fișe, când clientul are mai multe puncte de lucru active.

Atunci vezi pe tab „Fișa SSM nu se poate întocmi încă” și **Vezi ce lipsește**. Fiecare rând din listă te duce la câmpul de completat, iar după salvare te poți întoarce la fișă. Câmpurile sunt explicate în [Datele pentru fișa de instruire](/clienti/angajati/adaugare-si-editare/).

### Copia de citire și originalele

După prima semnătură electronică, fișa se păstrează semnată, rând cu rând. Când se umple, continuă pe o fișă nouă.

- **Descarcă fișa (copie de citire)** îți dă toate fișele angajatului într-un singur PDF, bun de citit și de tipărit. Copia nu are semnături valabile.
- **Originalele** îți dă fiecare fișă semnată, cu semnăturile ei verificabile: „Fișa 1”, apoi „Fișa 2 (continuare)” și așa mai departe. Pe acestea le arăți la un control.

## Semnăturile unei instruiri

Fiecare instruire înregistrată în aplicație are rubrici de semnătură: **Instruit**, **Instructor** și, unde fișa le are, **Verificator** și **Admite la lucru**. Fișa PSI are doar rubricile celui instruit și ale celui care a instruit.

Angajatul își semnează rubrica din portal, cu un cod primit pe email sau prin SMS. O rubrică semnată de mână o marchezi cu **Marchează semnat pe hârtie**. O instruire de pe fișa de hârtie nu are rubrici în aplicație: semnăturile ei sunt pe hârtie.
