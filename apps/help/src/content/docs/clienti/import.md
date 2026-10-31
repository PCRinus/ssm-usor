---
title: Importul din documente și din fișe
description: Cum aduci în aplicație un client din documentația lui SSM și PSI și angajații lui din fotografiile fișelor individuale de instruire.
topics:
  - id: import.client
    heading: Importul unui client din documente
  - id: import.angajati
    heading: Importul angajaților din fișe
  - id: import.pornire
    heading: De unde pornești
  - id: import.fise-gasite
    heading: Fișele găsite în documentație
  - id: import.ce-fotografiezi
    heading: Ce fotografiezi
  - id: import.limite
    heading: Cât intră într-un import
  - id: import.citire
    heading: Citirea fișelor
  - id: import.persoane
    heading: Lista persoanelor
  - id: import.fotografii-neatribuite
    heading: Fotografiile neatribuite
  - id: import.pagina-persoanei
    heading: Pagina unei persoane
  - id: import.post
    heading: Postul de lucru
  - id: import.loc-de-munca
    heading: Locul de muncă
  - id: import.cnp
    heading: CNP-ul de pe fișă
  - id: import.angajat-existent
    heading: Un angajat pe care clientul îl are deja
  - id: import.fost-angajat
    heading: Cine a plecat din firmă
  - id: import.randuri
    heading: Rândurile de instruire
  - id: import.test-verificat-pe-fisa
    heading: Testul la angajare verificat pe fișă
  - id: import.salvare
    heading: Salvarea și cele 14 zile
  - id: import.confirmare
    heading: Crearea angajaților
  - id: import.dupa-import
    heading: După import
  - id: import.originale
    heading: Originalele rămân la client
  - id: import.fara-reinstruire
    heading: Nicio instruire și niciun test de refăcut
  - id: import.portal
    heading: Portalul și actul adițional după import
sources:
  - docs/architecture/adr-030-import-from-documents.md
  - docs/architecture/adr-032-employees-imported-from-training-sheets.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - packages/contracts/src/imports.ts
  - apps/api/src/modules/imports/handlers.ts
  - apps/api/src/modules/imports/employees.ts
  - apps/api/src/modules/imports/cleanup.ts
  - apps/app/src/features/imports/start-ways.tsx
  - apps/app/src/features/imports/import-upload-dialog.tsx
  - apps/app/src/features/imports/review-hub.tsx
  - apps/app/src/features/imports/confirm-import-dialog.tsx
  - apps/app/src/features/imports/abandon-import-dialog.tsx
  - apps/app/src/features/imports/employees/employee-import-entry.tsx
  - apps/app/src/features/imports/employees/employee-upload-dialog.tsx
  - apps/app/src/features/imports/employees/employee-processing.tsx
  - apps/app/src/features/imports/employees/employee-hub.tsx
  - apps/app/src/features/imports/employees/review-groups.tsx
  - apps/app/src/features/imports/employees/people-list.tsx
  - apps/app/src/features/imports/employees/unplaced-pages.tsx
  - apps/app/src/features/imports/employees/person-page.tsx
  - apps/app/src/features/imports/employees/person-decisions.tsx
  - apps/app/src/features/imports/employees/person-fields.tsx
  - apps/app/src/features/imports/employees/person-trainings.tsx
  - apps/app/src/features/imports/employees/employee-review-model.ts
  - apps/app/src/features/imports/employees/employee-confirm-dialog.tsx
  - apps/app/src/features/client-files/import-folder.tsx
  - supabase/migrations/20261101100100_hiring_test_after_app_training.sql
  - supabase/migrations/20261101100200_import_caps_per_kind.sql
  - supabase/migrations/20261101120000_apply_employee_import.sql
  - supabase/migrations/20261101140000_import_found_sheets.sql
---

Un client pe care îl preiei vine cu un dosar: documentația SSM și PSI scrisă de-a lungul anilor și fișele individuale de instruire completate de mână. Aplicația le citește și îți face o propunere. Nu se salvează nimic până nu verifici propunerea și o confirmi.

Sunt două importuri, în această ordine: întâi clientul, din documentația lui, apoi angajații, din fișele lor.

## Importul unui client din documente

Pornești din **Clienți**, cu **Importă din documente**, pentru un client nou, sau de pe pagina unui client existent, cu **Completează din documentație**. Încarci documentația unei singure firme: fișiere, un folder sau o arhivă ZIP, în PDF, DOC, DOCX, JPG, PNG sau HEIC, cel mult 150 de fișiere și 100 MB în total.

Aplicația pune deoparte ce nu poartă date despre client (coperți, formulare goale, texte de lege, instrucțiunile proprii), citește restul și îți propune datele firmei, punctele de lucru, posturile, persoanele cu atribuții, programul de instruire, datele PSI și echipamentul de protecție. Le verifici pe secțiuni, cu sursa fiecărei valori la un clic, apoi confirmi. La un client existent, o valoare pe care o ai deja în aplicație nu se schimbă decât dacă alegi tu valoarea din documente.

Documentele încărcate rămân la client, în **Alte documente**, într-un folder „Dosar importat pe …”. Fotografiile fișelor de instruire găsite printre ele sunt păstrate pentru importul angajaților.

## Importul angajaților din fișe

Documentația nu are lista angajaților. Oamenii, cu CNP-ul, data angajării și toate instruirile lor, sunt pe fișele individuale de instruire. Importul angajaților le citește din fotografii și îți propune angajații clientului, cu instruirile și testele de pe fișe.

### De unde pornești

Importul angajaților pornește doar din tabul **Angajați** al unui client. Ai trei căi:

- **Adaugă angajat**: completezi tu datele unei persoane, fără import;
- **Importă din fișele găsite în documentație**, cu numărul de fotografii: deschide încărcarea cu fotografiile de fișe găsite la importul documentației deja adăugate;
- **Importă din fotografii noi**: încarci tu fotografiile. Când nu există fișe găsite în documentație, butonul se numește **Importă din fișele de instruire**.

La un client fără angajați, cele trei căi apar ca trei carduri în locul listei. La un client cu angajați, sunt butoane deasupra listei.

Dacă clientul nu are încă posturi de lucru, încărcarea îți recomandă să imporți întâi documentația: ea aduce posturile, iar angajații intră direct pe ele. Poți merge și mai departe, cu **Continuă fără posturi**, și adaugi posturile pe parcurs.

### Fișele găsite în documentație

Când documentația importată a unui client conține fotografii de fișe de instruire, aplicația ți le oferă cât timp niciun import de angajați nu le-a folosit: pe tabul **Angajați**, ca a doua cale, și în fereastra de încărcare, „Din documentația importată pe …”, cu **Adaugă-le**. Astfel le găsești și dacă ai pornit de la fotografii noi.

O fotografie găsită se citește și se păstrează la fel ca una încărcată de tine. Dacă importul care a luat-o e abandonat sau se oprește, ți se oferă din nou.

### Ce fotografiezi

Fotografiezi fișele individuale de instruire pe hârtie ale fiecărui angajat:

- fișa SSM și fișa PSI, fiecare cu fața și verso-ul;
- fiecare pagină de continuare a tabelului instruirilor periodice;
- declarația privind traseul de deplasare, dacă e pe o pagină separată.

O pagină pe fotografie, întreagă, dreaptă și clară, cu rubricile de semnătură vizibile. Ordinea nu contează: după citire, aplicația grupează paginile pe persoane. Ține însă toate paginile unei persoane în același import.

Poți încărca fotografii JPG, PNG și HEIC, PDF-uri scanate, un folder sau o arhivă ZIP. Arhiva o deschide aplicația înainte de încărcare, așa că vezi ce intră; o arhivă 7z sau RAR o dezarhivezi întâi și tragi folderul. Ce nu e fotografie sau PDF e pus deoparte și nu se încarcă. Fotografiile le micșorăm înainte de încărcare, ca să urce mai repede.

### Cât intră într-un import

Într-un import de angajați intră cel mult 500 de fotografii sau pagini PDF, cel mult 25 MB un fișier și 1 GB în total. Sub fereastra de încărcare vezi cât ai folosit din fiecare.

Un client mai mare îl imporți în mai multe importuri, cu fișele fiecărei persoane în același import. Un import făcut mai târziu completează angajații creați de cel dinainte, ca pe orice angajat pe care clientul îl are deja.

### Citirea fișelor

După **Încarcă și citește**, aplicația pregătește fotografiile, citește fiecare pagină, le grupează pe persoane și verifică datele. Durează câteva secunde pe pagină. Poți închide pagina: importul rămâne pe tabul **Angajați** al clientului, cu pasul la care a ajuns, și îl deschizi de acolo când persoanele sunt gata de verificat.

O pagină ajunge la o persoană după CNP; fără CNP, după nume, chiar dacă e scris puțin diferit pe pagini; fără niciun nume, o pagină de continuare merge după pagina dinaintea ei, în ordinea încărcării.

## Lista persoanelor

**Verifică angajații propuși** arată câte persoane au fost găsite și câte ai verificat. Fiecare persoană e:

- **De verificat**: încă nu ai trecut prin ea sau are ceva de hotărât;
- **Verificat**: o persoană fără nimic de hotărât devine verificată când treci de pe pagina ei la următoarea; una cu ceva de hotărât, după ce ai hotărât;
- **Lăsat deoparte**: nu se creează. O iei înapoi oricând, de pe pagina ei.

Lista se filtrează după aceste stări. Persoanele de verificat sunt împărțite în **Cu ceva de hotărât** și **Încă nedeschise**. **Continuă cu …** te duce la următoarea persoană de verificat.

Deasupra listei apar posturile scrise pe fișe care nu se potrivesc exact cu un post al clientului și locurile de muncă de ales. Ce hotărăști acolo se aplică tuturor celor care au același text pe fișă.

### Fotografiile neatribuite

O pagină pe care aplicația nu o poate lega de nicio persoană apare sub listă, cu ce s-a citit pe ea. **Atribuie…** o dă unei persoane de pe fișe sau o lasă deoparte. O pagină lăsată deoparte nu ajunge la fișierele nimănui.

## Pagina unei persoane

Pe pagina unei persoane vezi, alături, fotografiile fișelor ei; un clic pe una o mărește. Sus sunt lucrurile de hotărât, apoi datele citite, pe grupuri, și instruirile, pe domenii. O valoare citită greșit o corectezi cu **Modifică**. Cu butoanele de jos treci la persoana anterioară sau la următoarea.

Ca să fie creat, un angajat are nevoie de nume, prenume, funcția din contract, data angajării și un post. Emailul și telefonul nu sunt obligatorii: când lipsesc, vezi „Fără email sau telefon. Îl adaugi când îl inviți în portal.” Când fișele aceleiași persoane scriu valori diferite, de exemplu două date ale angajării, alegi una.

### Postul de lucru

Funcția scrisă pe fișă e potrivită cu posturile clientului:

- când se potrivește exact cu un post, angajatul îl primește fără să te întrebe;
- când seamănă cu un post, ți-l propune, iar tu îl confirmi sau alegi altul;
- când nu seamănă cu niciunul, alegi un post existent sau **Adaugă un post nou**, care deschide aceeași fereastră ca în tabul **Posturi de lucru**.

Aceeași funcție scrisă pe fișele mai multor persoane o hotărăști o singură dată, pentru toate. Funcția de pe fișă rămâne funcția din contract a angajatului. Importul nu creează niciodată un post fără să-l alegi tu.

### Locul de muncă

Locul de muncă scris pe fișă e tratat ca postul: dacă se potrivește cu un loc de muncă al clientului, angajatul îl primește; dacă nu se potrivește sau fișa nu scrie niciunul, alegi tu, o singură dată pentru toți cei cu același text. La un client cu un singur loc de muncă nu te întreabă nimic.

Poți alege și **Fără loc de muncă deocamdată**. Angajatul se creează, iar locul îl completezi după; până atunci, fișa lui individuală îl arată ca lipsă, când clientul are mai multe puncte de lucru.

### CNP-ul de pe fișă

CNP-ul citit e verificat după cifra de control și după data nașterii. Când o cifră nu se citește și data nașterii o lămurește, aplicația îți propune CNP-ul corectat. Altfel îl scrii tu sau alegi **Lasă fără CNP** și îl completezi mai târziu, pe pagina angajatului.

### Un angajat pe care clientul îl are deja

O persoană cu același CNP ca un angajat al clientului, sau cu același nume și aceeași dată a nașterii, nu se dublează: importul îl completează. Câmpurile goale se umplu de pe fișă, iar o valoare care diferă de cea din aplicație apare la **Diferă de aplicație**, unde valoarea din aplicație rămâne dacă nu alegi **Folosește valoarea de pe fișă**.

O instruire de pe fișă care e deja în aplicație, același domeniu, același fel și aceeași zi, nu se adaugă a doua oară. Vezi câte sunt și le poți afișa.

### Cine a plecat din firmă

O fișă cu data plecării e propusă nebifată. Bifează **Preia-l ca fost angajat, cu instruirile lui** dacă vrei să-l ai în evidență: apare la **Foști angajați**.

### Rândurile de instruire

Se preiau toate instruirile de pe fișă, nu doar cele de care depinde termenul: introductiv-generală, la locul de muncă, periodice și suplimentare, cu ziua, durata, cine a instruit, funcția lui și materialul. „Admis la lucru”, cu ziua și cine l-a admis, merge la instruirea la locul de muncă. Un rând îl corectezi cu **Modifică** sau îl scoți debifându-l.

Unele rânduri poartă o etichetă:

- **Doar luna pe fișă**: fișa scrie doar luna și anul; ziua devine prima zi a lunii;
- **Din tematica clientului**: instructorul, funcția lui sau materialul lipseau de pe fișă și au fost luate din tematica și instructorul clientului;
- **Nesemnat pe fișă**: rândul e completat, dar rubrica de semnătură e goală; e propus nebifat și se preia doar dacă îl bifezi;
- **Semnătura nu se vede clar**: verifică pe fotografie.

O durată a instruirii periodice alta decât 60, 90 sau 120 de minute și o dată dinaintea angajării sunt semnalate, dar nu opresc nimic: se preiau așa dacă nu le schimbi. O instruire cu data în viitor sau fără o valoare obligatorie trebuie corectată.

Testul anual PSI consemnat în tabelul instruirilor periodice devine un rezultat de test, nu o instruire.

**După import** îți arată cum va arăta instruirea angajatului în aplicație cu alegerile de acum: starea, ultima instruire periodică și testul la angajare. Rândurile mai multor persoane cu același domeniu, același fel, aceeași zi, același instructor, aceeași durată și același material devin o singură instruire în **Instruiri ținute**, cu toți participanții ei. Altfel devin instruiri separate în aceeași zi.

### Testul la angajare verificat pe fișă

Instruirea la angajare se încheie cu testul, iar rezultatul se consemnează în fișă (HG 1425/2006, art. 89 alin. (1) și (2)): pe fișă, cel care a verificat cunoștințele semnează în rubrica „Verificat”. Când semnătura lui se vede, importul înregistrează testul la angajare ca promovat pe hârtie, în ziua instruirii, cu el ca examinator: testul SSM din blocul fișei SSM, testul PSI din blocul fișei PSI.

Când semnătura nu se vede, vezi „Testul la angajare nu a putut fi verificat pe fișă: semnătura nu se vede clar sau lipsește.” Dacă semnătura e pe original, bifează **Testul la angajare: verificat pe fișă** și completează examinatorul, dacă nu s-a citit. Altfel, angajatul ajunge cu testarea în starea **Neverificat pe fișă** (vezi [Starea testării](/clienti/angajati/)), iar rezultatul îl poți înregistra și mai târziu, pe pagina lui.

## Salvarea și cele 14 zile

Tot ce verifici și schimbi se salvează pe loc. Poți închide pagina și continua mai târziu: importul deschis apare pe tabul **Angajați** al clientului, cu câte persoane ai verificat și **Continuă**.

Un import la care nu mai lucrezi se păstrează 14 zile de la ultima schimbare; data o vezi pe card, „Se păstrează până pe …”. După aceea se oprește, iar fotografiile încărcate se șterg după încă 14 zile. La fel se întâmplă când alegi **Renunță la import**: nu se creează și nu se modifică niciun angajat.

## Crearea angajaților

Angajații se creează o singură dată, la final, cu **Creează angajații…**. Fereastra îți arată ce se adaugă: angajații noi, cei existenți care se completează, foștii angajați preluați, instruirile ținute, testele la angajare verificate pe fișă și fotografiile. Arată și ce rămâne de făcut după: emailurile și telefoanele lipsă, testele neverificate pe fișă, traseele de deplasare lipsă și valorile neobișnuite.

Poți crea angajații și înainte să-i verifici pe toți. Fereastra îi numește pe cei încă de verificat: ei și cei lăsați deoparte rămân în afara acestui import, iar un import nou îi poate aduce mai târziu. Nu poți crea doar o parte acum și restul din același import.

## După import

Angajații apar în lista clientului, cu instruirile, testele și starea lor calculată ca la orice angajat. Pe tabul **Angajați** vezi câți au fost creați și ce urmează.

Fiecare angajat are la **Fișiere**, pe tabul **Date**, un folder „Fișe importate pe …” cu fotografiile fișelor lui. Dintr-un PDF scanat cu fișele mai multor persoane, fiecare angajat primește doar paginile lui, ca imagini, iar PDF-ul întreg rămâne o singură dată la fișierele clientului, în **Alte documente**.

Instruirile importate poartă eticheta **Transcris de pe fișa pe hârtie** și rândul „Semnat pe hârtie: …”, cu rubricile semnate pe fișă. Pentru ele nu se cere nicio semnătură, nici în aplicație, nici în portal, iar pe fișa individuală din aplicație apar cu mențiunea „semnat pe hârtie”. Instruirile ținute de acum înainte se semnează ca de obicei.

### Originalele rămân la client

Ce ai în aplicație e o transcriere a fișei, nu un înlocuitor al ei. Fișa de instruire individuală pe hârtie rămâne originalul semnat: o păstrează conducătorul locului de muncă, la client, de la angajare până la încetarea raporturilor de muncă (HG 1425/2006, art. 81 alin. (4) și (5)). Nicio prevedere nu permite distrugerea ei după ce a fost transcrisă.

### Nicio instruire și niciun test de refăcut

Angajații importați lucrează deja la client, așa că nu li se cere din nou instruirea la angajare. Instruirea introductiv-generală se face la angajare, la detașarea sau delegarea unui lucrător de la altă firmă și pentru lucrătorul pus la dispoziție de un agent de muncă temporară (HG 1425/2006, art. 83). Schimbarea prestatorului SSM sau transcrierea fișelor nu e niciunul dintre aceste cazuri.

Nici testul la angajare nu li se mai cere: testul care a încheiat o instruire la angajare de pe hârtie s-a dat pe hârtie (HG 1425/2006, art. 89). Nu apare în portal și nu se numără pe **Dashboard**, iar starea testării e **Promovat** sau **Neverificat pe fișă**.

Termenul următoarei instruiri periodice se socotește de la datele de pe fișe. Testul anual PSI se cere la 12 luni de la ultimul test promovat (OMAI 712/2005, art. 30); dacă fișa nu consemnează niciun test anual, angajatul poate apărea cu testarea PSI **Anual scadent** imediat după import. E o obligație pe care clientul o are cu adevărat.

### Portalul și actul adițional după import

Importul nu invită pe nimeni în portal: invitația rămâne o acțiune a ta. Emailurile și telefoanele pe care fișele nu le au le adaugi când îi inviți.

Angajații importați sunt angajați existenți, cu contractul de muncă încheiat înainte. Ca să semneze instruirile în portal, semnează întâi actul adițional privind semnarea electronică. Instruirile de pe fișe rămân semnate pe hârtie: în portal apar ca transcrise de pe fișa pe hârtie, fără nimic de semnat. Vezi [Portalul și actul adițional](/clienti/angajati/portal-si-act-aditional/).
