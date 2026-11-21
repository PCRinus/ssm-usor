---
title: Alte documente
description: Fișierele unui client și ale fiecărui lucrător, cum le încarci, cine le vede, cum le cauți și ce sunt dosarele importate.
topics:
  - id: fisiere.alte-documente
    heading: Alte documente
  - id: fisiere.cautare-filtre
    heading: Căutarea și filtrele
  - id: fisiere.dosare-importate
    heading: Dosarele importate
  - id: fisiere.documentele-lucratorului
    heading: Documentele lucrătorului
sources:
  - docs/architecture/adr-013-client-files.md
  - docs/architecture/adr-030-import-from-documents.md
  - docs/architecture/adr-032-employees-imported-from-training-sheets.md
  - packages/contracts/src/client-files.ts
  - apps/app/src/features/client-files/client-files-card.tsx
  - apps/app/src/features/client-files/client-file-list.ts
  - apps/app/src/features/client-files/client-file-row.tsx
  - apps/app/src/features/client-files/client-file-columns.tsx
  - apps/app/src/features/client-files/import-folder.tsx
  - apps/app/src/features/client-files/employee-files-card.tsx
---

Aici păstrezi fișierele pe care aplicația nu le scrie, dar pe care le ai de la client sau despre el, ca să nu le mai cauți prin email.

## Alte documente

Tabul **Alte documente** al unui client ține certificatul de înregistrare, procesele-verbale ITM, fișele de aptitudine, ofertele, fotografiile de la locurile de muncă și orice alt fișier despre client. Documentele pe care le generează aplicația sunt în **Documentație SSM** și **Documentație SU**, iar fișierele unui lucrător sunt pe pagina lui, la [Documentele lucrătorului](#documentele-lucrătorului).

Lista are, pentru fiecare fișier:

- **Nume**, cu un rând dedesubt pentru „Doar admini” și pentru notă. O notă lungă se oprește la capătul rândului; un clic pe ea o arată întreagă.
- **Tip**: PDF, Imagine, Word sau Excel, cu mărimea fișierului dedesubt.
- **Încărcat**: ziua, cu numele celui care l-a încărcat dedesubt.

Cele mai noi sunt primele. Un clic pe **Nume** sau pe **Încărcat** schimbă ordinea. Un clic pe nume sau pe rând deschide un PDF sau o imagine într-un tab nou; un fișier Word sau Excel se descarcă. Butonul cu săgeata în jos de la capătul rândului descarcă orice fișier.

### Încărcarea

Cu **Încarcă fișiere** alegi unul sau mai multe fișiere de pe dispozitiv, sau le tragi direct peste listă. Se încarcă PDF, JPEG, PNG, Word și Excel, de cel mult 25 MB fiecare. Fiecare fișier primește ca nume numele lui fără extensie, pe care îl poți schimba, și o notă, dacă vrei.

### Doar admini

Un admin poate marca un fișier **Doar pentru admini**, la încărcare sau mai târziu, din meniul cu trei puncte. Un specialist nu vede un astfel de fișier și nici numele lui. Fișierele unei oferte sunt doar pentru admini până când firma devine client; după aceea, un admin le poate deschide echipei.

### Modificarea și ștergerea

Meniul cu trei puncte al unui fișier are **Modifică numele și nota**, **Doar pentru admini**, pentru admini, și **Șterge**. Îl vezi la fișierele încărcate de tine; un admin îl vede la toate. Un fișier șters dispare definitiv, după ce confirmi.

La un client arhivat, fișierele se văd și se descarcă, dar nu se mai încarcă, nu se modifică și nu se șterg.

## Căutarea și filtrele

Căutarea găsește fișierele după nume și după notă, cu sau fără diacritice. **Filtre** are două grupuri:

- **Tip**: PDF, Imagine, Word sau Excel;
- **Mod de adăugare**: **Încărcate**, fișierele încărcate de voi unul câte unul, sau **Importate**, cele venite dintr-un import.

Cât timp cauți sau ai un filtru, lista arată fiecare fișier găsit, și pe cele din dosarele importate, cu dosarul și folderul lor sub nume. Numărul de lângă căutare spune câte ai găsit din total, de exemplu „4 din 47 de fișiere”. Când nimic nu se potrivește, **Șterge filtrele** scoate filtrele și păstrează căutarea.

## Dosarele importate

Un import din documente lasă aici, pe un singur rând, dosarul încărcat: „Dosar importat pe …”, cu câte fișiere și câte foldere are. Rândul stă printre celelalte fișiere, la ziua importului. Săgeata de la începutul rândului îl deschide, cu folderele în care au fost încărcate fișierele; dintr-un folder vezi primele cinci, iar **Arată toate** le arată pe toate.

Un import de lucrători din fișe lasă un rând „Fișe importate pe …”, cu fișele scanate întregi; fiecare lucrător primește pe pagina lui doar paginile lui.

Butonul de descărcare al unui dosar face o arhivă ZIP cu toate fișierele lui, în folderele lor. Meniul cu trei puncte al dosarului are **Vezi importul**, care deschide pagina importului.

Un fișier pe care importul nu l-a putut citi are dedesubt, cu galben, „Necitit la import” și motivul, de exemplu că fișierul este protejat cu parolă. Fișierul rămâne în dosar și se deschide ca oricare altul.

## Documentele lucrătorului

Pe pagina unui lucrător, tabul **Documente** ține fotografiile sau scanurile fișelor de instruire completate pe hârtie, actul adițional semnat de mână și orice alt fișier despre lucrător. Fișierele lui apar doar aici, nu și în **Alte documente** ale clientului. Scanul actului adițional semnat pe hârtie și cererea scrisă de revenire la semnarea de mână, încărcate din dialogurile tabului **Portal**, ajung tot aici.

Lista, căutarea și filtrele sunt aceleași ca la client. Un lucrător adus dintr-un import din fișe are aici un rând „Fișe importate pe …”, deschis de la început, cu fotografiile fișelor lui și, dintr-un PDF scanat cu fișele mai multor persoane, doar paginile lui.
