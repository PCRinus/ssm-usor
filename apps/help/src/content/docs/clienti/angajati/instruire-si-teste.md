---
title: Instruirea și testele unui lucrător
description: Ce arată taburile Instruire SSM și Instruire SU ale unui lucrător, cum se calculează termenul, când îl așteaptă un test și cum se întocmește fișa individuală.
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
  - id: angajati.instruire-dupa-emitere
    heading: După emiterea instrucțiunilor proprii
  - id: angajati.instruire-de-pe-hartie
    heading: Instruirile de pe fișa pe hârtie
  - id: angajati.instructiuni-anterioare
    heading: Instrucțiunile proprii anterioare
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
  - supabase/migrations/20261112160000_paper_trainings_as_written.sql
  - docs/architecture/adr-006-job-positions.md
  - docs/architecture/adr-039-training-categories-from-job-positions.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - docs/architecture/adr-024-knowledge-tests.md
  - docs/architecture/adr-032-employees-imported-from-training-sheets.md
  - docs/architecture/adr-042-paper-history-as-written.md
  - supabase/migrations/20261116140000_supplementary_training_proposals.sql
  - supabase/migrations/20261116180000_earlier_own_instructions.sql
  - apps/api/src/modules/client-files/earlier-instructions.ts
  - apps/app/src/features/client-files/earlier-instructions-notice.tsx
  - apps/app/src/features/client-files/earlier-instructions-dialog.tsx
  - apps/app/src/features/client-files/earlier-instructions-group.tsx
  - apps/api/src/modules/trainings/supplementary-proposals.ts
  - apps/app/src/features/trainings/supplementary-training-proposals.tsx
  - apps/app/src/features/trainings/supplementary-proposals.ts
  - packages/contracts/src/trainings.ts
  - packages/contracts/src/tests.ts
  - packages/contracts/src/job-positions.ts
  - apps/api/src/modules/trainings/sheet.ts
  - apps/api/src/modules/documents/annual-report.ts
  - apps/app/src/features/trainings/employee-training-tab.tsx
  - apps/app/src/features/trainings/training-format.ts
  - apps/portal/src/features/training/training-records-list.tsx
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
  - supabase/migrations/20261101100100_hiring_test_after_app_training.sql
---

Pe pagina unui lucrător, **Instruire SSM** și **Instruire SU** adună tot ce ține de instruirea lui în acel domeniu: starea și termenul, testele, fiecare instruire la care a participat și fișa individuală.

## Taburile de instruire

Cele două taburi arată la fel. Sus ai **Descarcă fișa SSM** (sau **SU**), **Previzualizează** și **Înregistrează o instruire**; cât timp angajatul nu are nicio instruire în acel domeniu, **Înregistrează o instruire** e în lista goală de jos. Dedesubt:

- **Starea instruirii**: Neinstruit, La zi, Scadentă sau Depășită (vezi [Starea instruirii](/clienti/angajati/));
- **Următoarea instruire**: termenul, sau de ce nu există încă unul;
- **Intervalul de instruire**: la câte luni se repetă instruirea periodică și de unde vine intervalul;
- **Ultima instruire periodică**;
- **Testare**: starea testării, rezultatele și încercările din portal;
- lista instruirilor lucrătorului în acel domeniu.

## Termenul următoarei instruiri

Termenul e ultima zi până la care lucrătorul trebuie instruit din nou. Aplicația îl calculează așa: ia ziua ultimei instruiri periodice; dacă nu există, ziua instruirii la locul de muncă; dacă nici ea nu e înregistrată, data angajării. La ea adaugă intervalul de instruire.

De exemplu: un lucrător instruit la locul de muncă pe 10 martie 2026, cu un interval de 6 luni, are termenul pe 10 septembrie 2026. După periodica din 4 septembrie 2026, termenul devine 4 martie 2027.

Câteva cazuri:

- Până la prima instruire la angajare, lucrătorul nu are termen: vezi „După instruirea la angajare”.
- După instruirea introductiv-generală singură, termenul se socotește tot de la data angajării.
- O instruire periodică suplimentară nu mută termenul, pentru că se face în plus față de cea programată (HG 1425/2006, art. 98).
- Fără interval stabilit, nu există termen: vezi „Intervalul de instruire nu este stabilit”, iar starea rămâne La zi.

### Intervalul de instruire

Intervalul vine din locuri diferite în cele două domenii:

- **SSM**: intervalul propriu al postului, dacă postul are unul; altfel, intervalul din programul de instruire al clientului pentru categoria de personal a postului. Sub interval scrie „din postul …” sau „din programul de instruire al clientului”, cu link spre locul unde îl schimbi.
- **SU**: întotdeauna intervalul din datele de instruire SU ale clientului, pentru categoria de personal a postului. Un post nu își poate avea propriul interval SU.

În SSM, intervalul se stabilește prin programul de instruire-testare și nu poate depăși 6 luni; pentru personalul tehnico-administrativ, cel mult 12 luni (HG 1425/2006, art. 96 alin. (2), (2¹) și (3)).

**Nestabilit** înseamnă că programul clientului nu are încă un interval pentru categoria lucrătorului. **Stabilește intervalul** te duce în programul de instruire al clientului.

## Înregistrarea unei instruiri

**Înregistrează o instruire** deschide formularul cu acest lucrător ca singur participant. Tipul propus urmează ordinea legii: întâi introductiv-generală, apoi la locul de muncă, apoi periodică. O instruire la care au participat mai mulți lucrători o înregistrezi o singură dată, din tabul **Instruiri ținute** al clientului, și apare la fiecare participant.

Ziua instruirii nu poate fi în viitor: o instruire se înregistrează după ce a avut loc. Fiecare instruire păstrează denumirea postului pe care îl avea lucrătorul în ziua ei, chiar dacă trece apoi pe alt post.

Instruirea la locul de muncă cuprinde și „admis la lucru”: ziua, numele și funcția celui care l-a admis pe lucrător la lucru. Pe fișă, blocul apare sub această instruire.

Instruirile SU înregistrate trec și în raportul anual de evaluare din setul SU. Când clientul are cel puțin o instruire SU înregistrată în anul raportului, rândul „Instruirile efectuate și rezultatele testării” arată, pe fiecare tip de instruire, câte instruiri s-au ținut și câți lucrători au participat, cu lunile instruirilor periodice, apoi, din rezultatele consemnate, câți lucrători au promovat fiecare test SU în acel an. Un test picat nu se consemnează, așa că raportul nu spune câți l-au dat. O instruire fără niciun participant nu se numără. Fără nicio instruire SU înregistrată în acel an, rândul rămâne de completat, ca să nu arate mai puțin decât s-a făcut pe hârtie. După ce înregistrezi instruiri, generează din nou raportul ca să le cuprindă.

### Instruirea periodică suplimentară

Alegi tipul **Periodică suplimentară** și motivul, unul dintre cazurile din HG 1425/2006, art. 98:

- absență de peste 30 de zile lucrătoare;
- modificarea prevederilor de securitate și sănătate în muncă sau a instrucțiunilor proprii;
- reluarea activității după un accident de muncă;
- executarea unor lucrări speciale;
- introducerea unui echipament de muncă sau modificarea celui existent;
- modificarea tehnologiilor existente sau a procedurilor de lucru;
- introducerea unei noi tehnologii sau proceduri de lucru.

Pe fișa SSM, instruirile suplimentare au tabelul lor. Pe fișa SU apar în tabelul instruirilor periodice.

### După emiterea instrucțiunilor proprii

De fiecare dată când emiți instrucțiunile proprii ale unui client, IPSSM în **Documente SSM** sau IPSU în **Documente SU**, iar clientul are lucrători actuali cu cel puțin o instruire înregistrată în acel domeniu, aplicația îți propune o instruire periodică suplimentară. Prima emitere din aplicație contează și ea, pentru că instrucțiunile emise le înlocuiesc pe cele pe care clientul le avea până atunci.

Propunerea e o notă care apare imediat după **Emite**, deasupra cuprinsului documentației, și pe tabul **Instruiri ținute** al clientului. Pe **Instruiri ținute** pot sta amândouă notele, SSM deasupra și SU dedesubt. O notă rămâne până înregistrezi instruirile sau o închizi.

- **Posturile.** Nota arată fiecare post cu lucrători actuali și câți lucrători are. Fiecare post e o instruire, ca în fereastra de instruire, unde o instruire privește un singur post. La un client cu multe posturi vezi primele cinci, iar pe celelalte le deschizi cu **Arată toate**.
- **Înregistrează**, lângă un post, deschide fereastra de instruire completată pentru el: tipul _Periodică suplimentară_, motivul _Modificarea prevederilor de securitate și sănătate în muncă sau a instrucțiunilor proprii_, lucrătorii postului bifați și, la material, instrucțiunile emise, cu revizia și data lor. Sus scrie a câta instruire e și ce posturi urmează. Verifici, completezi ce lipsește și salvezi.
- **Înregistrată pe …** apare lângă post după ce salvezi, cu ziua în care ai înregistrat instruirea. Contează orice instruire periodică suplimentară din acel domeniu, cu motivul _Modificarea prevederilor de securitate și sănătate în muncă sau a instrucțiunilor proprii_, înregistrată după emitere și ținută în ziua emiterii sau după ea, la care a participat un lucrător actual al postului, chiar dacă ai înregistrat-o din altă parte. O instruire de pe hârtie ținută înainte de emitere nu contează, chiar dacă o transcrii după. Când toate posturile au instruirea lor, nota dispare.
- **Nu e nevoie de instruire** închide toată nota, pentru o revizie care n-a schimbat nimic important, de exemplu una care a corectat doar greșeli de scriere. Aplicația ține minte cine a închis-o și când.
- Când emiți din nou instrucțiunile, nota noii revizii o înlocuiește pe cea veche.

Nota e doar o propunere: aplicația nu înregistrează singură nicio instruire, iar o instruire suplimentară o poți înregistra oricând de mână. Aplicația nu compară încă revizia nouă cu cea dinainte, așa că propune instruirea la fiecare emitere și pentru toate posturile.

**SSM.** Instruirea periodică suplimentară se face și când se modifică instrucțiunile proprii (HG 1425/2006, art. 98 lit. b)).

**SU.** Ordinul MAI nr. 712/2005 nu cere o instruire când se modifică instrucțiunile proprii. Aplicația ți-o propune totuși, ca regula să fie aceeași în ambele domenii; hotărăști tu dacă e nevoie de ea.

### Instruirile de pe fișa pe hârtie

Pentru un lucrător a cărui instruire s-a ținut până acum pe hârtie, înregistrează instruirile trecute cu sursa **Preluată de pe fișa pe hârtie**: ziua, durata, materialul și cine a instruit, ca pe fișă. Ce nu e scris pe fișă lași necompletat: o instruire de pe hârtie se salvează și fără durată, material sau instructor, iar în aplicație și în portal vezi în locul lor „necompletată pe fișă”, „necompletat pe fișă” sau „nume neînscris pe fișă”. Pe fișa individuală din aplicație căsuța rămâne goală. O instruire ținută în aplicație are nevoie de toate. Semnăturile rămân pe hârtie, iar instruirea apare cu eticheta **Transcris de pe fișa pe hârtie** și rândul „Semnat pe hârtie: …” (vezi „Semnăturile unei instruiri”).

Ca termenele să fie corecte, sunt de ajuns instruirile la angajare și ultima instruire periodică. Fotografia sau scanul fișei pe hârtie îl încarci pe tabul **Documente** al lucrătorului.

Când ai fișele mai multor lucrători, nu le transcrie de mână: importul din fișe le citește din fotografii, cu toate instruirile lor. Vezi [Importul lucrătorilor din fișe](/clienti/import/#importul-lucrătorilor-din-fișe).

Testul la angajare care a încheiat o instruire de pe hârtie s-a dat tot pe hârtie, așa că aplicația nu i-l mai cere lucrătorului. Dacă pe fișă testul e consemnat ca promovat, înregistrează-l cu **Înregistrează un rezultat de pe hârtie**: vezi „Când îl așteaptă un test”.

Poți înregistra astfel și instruirile unui fost lucrător.

### Instrucțiunile proprii anterioare

O instruire de pe fișa pe hârtie are la material instrucțiunile proprii pe care clientul le avea atunci, de exemplu „IPSSM, art. 167–288”, iar aplicația nu are o copie a lor. Cât timp clientul are instruiri de pe hârtie într-un domeniu și pentru acel domeniu nu există nici o copie, nici răspunsul „Nu le am”, pe tabul **Instruiri ținute** apare nota **Instrucțiunile proprii anterioare, opțional**. Nota numește domeniile care lipsesc, IPSSM, IPSU sau amândouă. Când pe tab e și nota care propune o instruire după emiterea instrucțiunilor proprii, aceasta stă dedesubt.

- **Adaugă instrucțiunile** deschide o fereastră în care alegi domeniul, fișierul și **Valabile până la**, ziua din care se aplică instrucțiunile noi. Propunem ziua de azi. Poți adăuga mai multe fișiere deodată, de exemplu scanurile paginilor: PDF, imagini, Word sau Excel, de cel mult 25 MB fiecare.
- **Nu le am** spune că clientul nu le mai are. Când lipsesc amândouă, alegi pentru ce domeniu răspunzi, IPSSM, IPSU sau amândouă: fiecare domeniu are răspunsul lui.

Nota dispare când fiecare domeniu cu instruiri de pe hârtie are o copie sau răspunsul „Nu le am”. Instrucțiunile proprii pe care importul documentației clientului le-a păstrat deja printre fișierele lui țin loc de copie. Același lucru îl întreabă și importul lucrătorilor din fișe, în ultima lui secțiune; vezi [Instrucțiunile proprii anterioare](/clienti/import/#instrucțiunile-proprii-anterioare) la import.

Fișierele stau în **Alte documente**, în grupa **Instrucțiuni proprii anterioare**, fiecare cu domeniul lui și „valabile până la …”. Grupa are **Adaugă**, care deschide aceeași fereastră, iar ziua unui fișier o schimbi cu **Redenumește**, din meniul lui. Fișierele nu intră în documentele pe care le generezi și nu pot fi doar pentru admini: rămân vizibile pentru toată echipa, ca specialiștii să nu le ceară din nou. Un răspuns „Nu le am” nu mai contează după ce adaugi o copie pentru acel domeniu.

Nu e o obligație legală: nicio normă nu cere angajatorului să păstreze instrucțiunile proprii pe care le-a înlocuit. Copia e o dovadă: la un control sau la cercetarea unui accident, fișa se citește împreună cu ce s-a predat.

### Modificarea și ștergerea unei instruiri

**Modifică** și **Șterge** schimbă instruirea pentru toți participanții ei. Dacă a avut mai mulți, dialogul îți spune câți.

O instruire semnată electronic nu se mai poate modifica și nici șterge: sub butoane vezi de ce. Ca s-o corectezi, anulează întâi semnăturile, cu un motiv. O instruire care are orice semnătură, chiar anulată sau pe hârtie, nu se mai poate șterge, pentru că semnăturile rămân în evidență.

O instruire de pe fișa pe hârtie nu are semnături electronice de anulat. La prima semnătură electronică pe fișa SSM sau SU a unui lucrător, fișa lui tipărește ca text instruirile de pe hârtie ale domeniului, iar o fișă semnată nu se mai schimbă. De atunci, acele instruiri nu se mai pot nici modifica, nici șterge. Verifică deci instruirile preluate de pe hârtie înainte ca lucrătorul să semneze electronic prima instruire ținută în aplicație.

## Testarea

Cardul **Testare** arată starea testării, ce urmează, rezultatele și încercările din portal. Stările sunt explicate în [Starea testării](/clienti/angajati/).

### Când îl așteaptă un test

Un test nu se trimite. Îl așteaptă pe lucrător de la sine, din momentul în care e îndeplinită condiția:

- **Testul la angajare SSM** (TASSM), după ce înregistrezi instruirea introductiv-generală ținută în aplicație, pe care o încheie (HG 1425/2006, art. 89 alin. (1)).
- **Testul la angajare SU** (TASU), după ce înregistrezi instruirea la locul de muncă ținută în aplicație. OMAI 712/2005 cere câte o verificare pe bază de teste: la sfârșitul instructajului introductiv-general (art. 14) și înainte de admiterea definitivă la lucru, după instructajul la locul de muncă (art. 20). Aplicația le acoperă deocamdată cu un singur test, după instruirea la locul de muncă.
- **Testul anual SU** (TPSU). OMAI 712/2005 cere o verificare anuală pe bază de test, consemnată în fișa individuală (art. 30); aplicația o cere la 12 luni de la ultimul test SU promovat, până lucrătorul îl promovează.

În SSM nu există test periodic.

O instruire la angajare preluată de pe fișa pe hârtie s-a încheiat cu testul consemnat pe fișă (HG 1425/2006, art. 89 alin. (2)), așa că testul la angajare nu îl mai așteaptă pe lucrător. Dacă cea mai recentă instruire la angajare a domeniului e de pe hârtie și nu e înregistrat niciun test promovat, starea testării e **Neverificat pe fișă**: „Testul la angajare nu a putut fi verificat pe fișă: semnătura nu se vede clar sau lipsește.” Testul nu apare în portal, nu se numără pe **Dashboard** și nu apare niciun avertisment. Dacă originalul arată testul promovat, înregistrează-l ca rezultat de pe hârtie. Importul din fișe face asta singur acolo unde semnătura verificatorului se vede pe fotografie. Dacă după aceea ții în aplicație o nouă instruire la angajare, testul îl așteaptă din nou ca de obicei.

Testul anual SU nu depinde de unde vine instruirea: e cerut la 12 luni de la ultimul test promovat.

Cât timp testul la angajare nu e promovat, vezi un avertisment pe tab. Aplicația doar semnalează lipsa: nu blochează nimic. Admiterea la lucru rămâne decizia angajatorului.

### Testul în portal

Un lucrător cu acces la portal găsește testul acolo. Primește 10 întrebări alese la întâmplare din banca de întrebări a organizației și promovează cu 7 răspunsuri complet corecte din 10. Poate relua testul imediat, de câte ori e nevoie; întrebările se trag și se amestecă din nou la fiecare încercare.

La **Încercări în portal** vezi fiecare încercare cu scorul ei și dacă a fost promovată. **În curs** înseamnă o încercare începută și neterminată; lucrătorul o poate continua de unde a rămas.

### Rezultatul de pe hârtie

Pentru un lucrător fără portal, tipărește testul din documentele clientului. După ce l-a completat și l-a promovat, alege **Înregistrează un rezultat de pe hârtie** și completează testul, ziua în care l-a susținut, examinatorul și funcția lui. Pentru un test consemnat pe o fișă veche care nu scrie examinatorul, lasă goale numele și funcția examinatorului: rezultatul se înregistrează fără examinator și apare cu „nume neînscris pe fișă”. Dacă scrii unul dintre ele, îl completezi și pe celălalt.

Butonul apare cât timp testul la angajare e de susținut sau neverificat pe fișă și, în SU, pentru testul anual: oricând după primul test promovat, iar la un lucrător neverificat pe fișă și fără el, pentru testele anuale consemnate pe fișa pe hârtie. Ziua nu poate fi în viitor. Un test nepromovat nu se înregistrează: contează susținerea următoare.

### Examinatorul

Examinatorul apare pe fișa individuală, în rândul rezultatului. Aplicația îl propune:

- în SSM, pe cel care a ținut instruirea introductiv-generală a lucrătorului; la un rezultat de pe hârtie, pe specialistul SSM al organizației;
- în SU, pe cadrul tehnic PSI al organizației sau, dacă nu e numit, pe cel care a ținut instruirea introductiv-generală.

Dacă nu are pe cine propune, scrie „nenumit încă” și ai **Numește examinatorul**. Îl poți schimba cu **Modifică examinatorul** până când examinatorul semnează fișa de test.

### Fișa de test

Un test promovat în portal are fișa lui de test: un PDF cu întrebările, răspunsurile alese, scorul și calificativul, pe care îl semnează lucrătorul și examinatorul. Îl găsești sub rezultat. Un rezultat de pe hârtie nu are fișă de test, pentru că testul s-a semnat pe exemplarul tipărit.

Pe fișa individuală SSM, rezultatele apar în blocul „Rezultatele testărilor”. Pe fișa SU, fiecare test promovat apare ca rând în tabelul instruirilor periodice, de exemplu „Verificare anuală pe bază de test (TPSU): admis”.

## Fișa individuală de instruire

Fiecare lucrător are două fișe: fișa de instruire individuală SSM, după modelul din anexa nr. 11 la normele metodologice aprobate prin HG 1425/2006, și fișa individuală de instructaj în domeniul situațiilor de urgență, după modelul din anexa la dispozițiile generale aprobate prin OMAI 712/2005 (art. 46).

O fișă nu e un document din setul clientului. Se întocmește în momentul în care o descarci sau o previzualizezi, din datele lucrătorului și din instruirile lui de atunci, ca PDF. Nu are versiuni și nu se editează. Tipărește:

- datele de identificare ale lucrătorului;
- instruirile la angajare, fiecare cu ziua, durata, cine a instruit și materialul;
- blocul „admis la lucru”;
- un rând pentru fiecare instruire periodică și, pe fișa SSM, fiecare instruire suplimentară;
- rânduri goale până la capătul paginii, pentru semnăturile pe hârtie.

O instruire preluată de pe fișa pe hârtie apare pe fișă cu mențiunea „transcris; semnat pe hârtie” în locul semnăturilor, iar numele celor care au instruit și au verificat rămân dedesubt. Cât timp fișa are măcar un astfel de rând, sub titlu scrie: „Rândurile cu mențiunea „transcris” sunt copiate de pe fișa pe hârtie. Originalul, cu semnăturile, se păstrează la angajator.” Fișa din aplicație nu înlocuiește fișa pe hârtie: clientul o păstrează în continuare.

### Ce lipsește pentru fișă

O fișă se întocmește chiar dacă multe câmpuri sunt goale; ele se tipăresc goale. Doar două lipsuri o opresc:

- **Traseul de deplasare**, pentru fișa SSM;
- **Punctul de lucru**, pentru ambele fișe, când clientul are mai multe puncte de lucru active.

Atunci vezi pe tab „Fișa SSM nu se poate întocmi încă” și **Vezi ce lipsește**. Fiecare rând din listă te duce la câmpul de completat, iar după salvare te poți întoarce la fișă. Câmpurile sunt explicate în [Datele pentru fișa de instruire](/clienti/angajati/adaugare-si-editare/).

### Copia de citire și originalele

După prima semnătură electronică, fișa se păstrează semnată, rând cu rând. Când se umple, continuă pe o fișă nouă.

- **Descarcă fișa SSM (copie de citire)**, și la fel pentru SU, îți dă toate fișele lucrătorului într-un singur PDF, bun de citit și de tipărit. Copia nu are semnături valabile.
- **Originalele** îți dă fiecare fișă semnată, cu semnăturile ei verificabile: „Fișa 1”, apoi „Fișa 2 (continuare)” și așa mai departe. Pe acestea le arăți la un control.

## Semnăturile unei instruiri

Fiecare instruire înregistrată în aplicație are rubrici de semnătură: **Instruit**, **Instructor** și, unde fișa le are, **Verificator** și **Admite la lucru**. Fișa SU are doar rubricile celui instruit și ale celui care a instruit.

Lucrătorul își semnează rubrica din portal, cu un cod primit pe email sau prin SMS. O rubrică semnată de mână o marchezi cu **Marchează semnat pe hârtie**.

O instruire de pe fișa pe hârtie nu are rubrici de semnat și nu cere nicio semnătură, nici în aplicație, nici în portal: semnăturile ei sunt pe fișa pe hârtie. În locul rubricilor scrie „Semnat pe hârtie: instruit, instructor”, la care se adaugă verificatorul și cel care admite la lucru când instruirea îi are. Pe fișa individuală, rândul ei apare cu mențiunea „transcris; semnat pe hârtie”. O fișă semnată întocmită înainte ca fișele să scrie „transcris” rămâne cum era: rândurile adăugate pe ea mai târziu primesc tot mențiunea „semnat pe hârtie”.
