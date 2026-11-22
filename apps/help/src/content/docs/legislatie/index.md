---
title: Legislație
description: Ce acte normative urmărește aplicația și de unde le citește, cât de des le verifică, ce înseamnă coloanele listei de acte, ce înseamnă o modificare „În analiză”, cum se încheie și cum regenerezi documentele rămase în urmă.
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
  - id: legislatie.in-analiza
    heading: O modificare în analiză
  - id: legislatie.incheiere
    heading: Cum se încheie o modificare
  - id: legislatie.aplicate
    heading: Modificările aplicate în documente
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
  - apps/app/src/features/legislation/legal-change-copy.ts
  - apps/app/src/features/legislation/legal-change-page.tsx
  - apps/app/src/features/legislation/legal-change-details.tsx
  - apps/app/src/features/legislation/documents-behind.tsx
  - apps/app/src/features/legislation/behind-cells.tsx
  - apps/app/src/features/legislation/regeneration-copy.ts
  - apps/app/src/features/legislation/regenerations.tsx
  - apps/api/src/modules/documents/regeneration.ts
---

Documentele pe care le generează aplicația citează legislația: unele paragrafe preiau cuvânt cu cuvânt articole din lege, altele trimit la un act sau la un articol. Pagina **Legislație** îți arată ce acte citează documentele, ce s-a schimbat în ele și ce documente trebuie generate din nou după ce un șablon se schimbă.

## Ce urmărește pagina Legislație

Pagina are patru secțiuni, fiecare într-un tab:

- **Documente SSM de actualizat** și **Documente SU de actualizat**: documentele clienților tăi generate dintr-o versiune mai veche a șablonului, de dinaintea unei modificări legislative sau a unei corecturi, și instrucțiunile proprii (3.1 în SSM, 2.1 în SU) și tematicile (4.1 în SSM, 3.1 în SU) generate din instrucțiuni schimbate între timp în bibliotecă sau la posturile de lucru. Numărul de pe tab spune câte documente ai de actualizat; un tab fără număr e la zi;
- **Modificări**: formele consolidate noi ale actelor urmărite. Sus, cât timp există, cele **În analiză**; dedesubt, cele **aplicate în documente**, cele mai recente primele. Fiecare rând deschide pagina modificării;
- **Acte urmărite**: actele normative pe care le citează documentele aplicației.

Pagina se deschide mereu pe **Documente SSM de actualizat**. Același număr de documente apare în meniu, lângă **Legislație** (și lângă secțiunile ei, când meniul le arată), și pe Dashboard, în **Ce ai de făcut**, cu drum direct spre tabul care are documente.

Actele sunt aceleași pentru toate organizațiile, pentru că documentele pornesc din aceleași șabloane. Instrucțiunile proprii ale organizației tale nu fac parte din ele: textul lor îl scrii tu.

## Verificarea zilnică

Textele legilor vin de pe **Portalul Legislativ** al Ministerului Justiției, unde se publică textele actelor și formele lor consolidate, cu caracter informativ. Aplicația citește pagina fiecărui act urmărit o dată pe zi, dimineața devreme, și compară cea mai nouă formă consolidată cu ce a văzut data trecută. O formă consolidată nouă devine o modificare pe secțiunea **Modificări**.

Sub titlul paginii, un rând spune cum a mers ultima verificare. Primul lucru din rând e starea ei:

- **Verificat azi la …** (sau ieri, sau la o dată), cu o bifă verde: verificarea a rulat la timp;
- **Verificarea rulează din …**: verificarea de azi nu s-a terminat încă;
- **Verificarea de azi nu a reușit**, în roșu: unele acte nu au putut fi citite, de exemplu pentru că portalul nu a răspuns, sau verificarea s-a oprit înainte de final. **Detalii**, la capătul rândului, deschide dedesubt actele necitite, grupate după motiv. Modificările acestor acte apar după o verificare reușită;
- **Ultima verificare: …, acum … zile**, în chihlimbar: verificarea nu a mai rulat de peste două zile, iar ce vezi pe pagină poate fi în urmă față de portal;
- **Verificarea nu a rulat încă**, în chihlimbar: actele nu au fost citite niciodată, cum se întâmplă doar înainte de prima verificare.

După stare urmează **Acte citite** (cât timp verificarea rulează sau după ce n-a reușit, câte din totalul actelor urmărite) și **În analiză**, câte modificări sunt încă în analiză, cu legătură spre **Modificări**. După o verificare reușită apare și **Modificări noi**, câte forme consolidate noi a găsit ea, tot cu legătură spre **Modificări**.

## Actele urmărite

Fiecare rând al listei este un act normativ urmărit:

- **Act normativ**: numele scurt al actului, care deschide pagina lui pe Portalul Legislativ, cu titlul lui dedesubt, de exemplu „privind apărarea împotriva incendiilor”;
- **Domeniu**: SSM, SU sau amândouă, după documentele care citează actul. Contractul de prestări servicii acoperă ambele domenii, așa că nu schimbă domeniul unui act;
- **Stare**: **În analiză** când actul are o modificare încă deschisă (vezi mai jos), **Abrogat** când portalul arată actul abrogat, **Neverificat** când actul nu a fost citit încă pe portal și **În vigoare** în rest;
- **Ultima formă consolidată**: data celei mai noi forme consolidate găsite pe portal. **Forma de bază** înseamnă că actul nu a fost consolidat niciodată: portalul are doar textul publicat inițial. Cât timp o modificare e în analiză, dedesubt vezi forma pe care o urmează documentele, de exemplu „documentele: 25.08.2026”;
- **Citat în**: câte documente citează actul, cu numărul preluărilor dedesubt.

O liniuță („—”) la **Domeniu** și la **Citat în** înseamnă că niciun document nu mai citează actul; la **Ultima formă consolidată**, că actul nu a fost citit încă pe portal.

## Preluări și trimiteri

O **preluare** este un paragraf care copiază textul unui articol, de exemplu un articol din lege redat întreg în materialul de instruire introductiv-generală (2.1). O **trimitere** este o propoziție care doar numește actul sau un articol al lui, de exemplu „conform art. 20 din Legea 319/2006”, fără să-i copieze textul.

Diferența contează când legea se schimbă: o preluare poate rămâne cu textul vechi tipărit în document, o trimitere rămâne corectă cât timp articolul spune în continuare același lucru. „Doar trimiteri” înseamnă că documentele numesc actul fără să preia nimic din el.

## Căutarea, filtrele și ordinea

Caută după numărul actului, după numele lui sau după cuvinte din titlu. Punctele, spațiile și diacriticele nu contează: „hg 1425” găsește „H.G. 1425/2006”, „aparare” găsește „apărarea”.

Din **Filtre** alegi domeniul și starea. Dacă nu găsești nimic, **Șterge filtrele** scoate filtrele și păstrează căutarea.

Lista pune întâi actele cu o modificare în analiză, apoi pe celelalte după nume. Poți ordona și după act, după ultima formă consolidată (cea mai nouă întâi) sau după numărul documentelor care citează actul (cele mai citate întâi).

## O modificare în analiză

O modificare rămâne **În analiză** până se încheie. Verificarea compară textul articolelor citate în forma pe care o urmează documentele cu textul lor în forma nouă și spune ce a găsit:

- **Modifică un text citat în documente**: textul unui articol pe care un document îl preia s-a schimbat. Pe pagina modificării vezi textul vechi și cel nou al articolului și documentele care îl preiau;
- **Modifică un articol la care trimit documentele**: s-a schimbat un articol la care documentele doar trimit, sau modificarea trebuie citită de un om, de exemplu când un articol citat a fost abrogat ori actul a fost republicat și articolele lui pot avea alte numere.

Până la prima comparație, sub eticheta „În analiză” scrie „Modificarea nu a fost încă analizată”. Rândul de sub etichetă deschide pagina modificării.

Pe **Modificări**, panoul **În analiză** apare doar cât timp există o modificare deschisă. Fiecare rând are data formei consolidate, actul cu titlul lui, ce a găsit comparația („Nu a fost încă analizată.” până la prima comparație), cu articolele atinse, și, dedesubt:

- **Atinge**: documentele care preiau sau numesc articolele schimbate;
- **Poate atinge**: cât timp modificarea nu a fost comparată, documentele care citează actul. Când sunt mai mult de trei, rândul spune câte sunt, pe seturi.

## Cum se încheie o modificare

O modificare se încheie în unul din două feluri:

- **Fără impact asupra documentelor**: articolele citate au rămas la fel. Când comparația arată asta, verificarea zilnică închide singură modificarea, cu o notă despre articolele schimbate. Pe celelalte le citește echipa SSM Ușor și le închide așa dacă nu ating documentele;
- **Șablon actualizat**: textul documentelor trebuia schimbat. Echipa SSM Ușor actualizează șabloanele documentelor atinse, iar modificarea se închide odată cu versiunea nouă, care ajunge în aplicație cu o actualizare. Modificarea trece atunci la **Aplicate în documente**.

Modificările fără impact nu apar pe **Modificări**, pentru că nu ai nimic de făcut pentru ele. Ultima formă consolidată a fiecărui act rămâne în lista **Acte urmărite**.

## Modificările aplicate în documente

Sub **În analiză**, lista **Aplicate în documente** arată modificările pe care un șablon nou le-a preluat, după data formei consolidate, cele mai noi primele, câte 20 pe pagină. Fiecare rând are:

- actul și titlul lui;
- ce s-a schimbat, în cuvinte, din nota versiunii noi a șablonului;
- **A actualizat**: documentele al căror șablon s-a schimbat;
- în chihlimbar, **… documente de actualizat**, când documente ale clienților tăi sunt încă generate dintr-o versiune de dinaintea modificării. Linkul duce la tabul cu documentele de actualizat (la cel SSM, când sunt în ambele seturi). Un rând fără acest link nu mai cere nimic de la tine.

## Pagina unei modificări

Un clic pe rând deschide pagina modificării. Săgeata de lângă titlu te întoarce de unde ai venit. Sub numele actului, **Stare** spune dacă modificarea e **În analiză** sau **Aplicată în documente**, și de când, iar **Forma**, data formei consolidate.

Primul panou spune pe scurt ce s-a schimbat:

- pentru o modificare aplicată, ce a schimbat versiunea nouă a șablonului și, la **A actualizat**, documentele și versiunea șablonului care o preia. În chihlimbar vezi câte documente ale clienților tăi sunt încă în urmă și la câți clienți, iar **Regenerează documentele** le reface pe toate pe versiunea nouă. Înainte să pornească, aceeași fereastră de confirmare ca pe tabul documentelor spune câte se refac și ce se întâmplă cu fiecare; numărul ei poate fi diferit de cel în chihlimbar: mai mare, pentru că regenerarea aduce documentul la cea mai nouă versiune a șablonului, nu doar la cea care preia modificarea, sau mai mic, pentru că ciornele editate de mână, numărate în chihlimbar, nu se refac. Ciornele editate de mână rămân neatinse; când doar ele sunt în urmă, butonul lipsește;
- pentru o modificare în analiză, ce a găsit comparația și ce documente atinge sau poate atinge. Nu ai nimic de pornit.

Dedesubt:

- **Ce s-a schimbat în lege**: articolele pe care forma nouă le-a modificat, completat, introdus sau abrogat, așa cum le arată portalul;
- **În documente**: pentru fiecare articol preluat sau numit în documente, unde apare și, alăturat, textul legii **Înainte** și **Acum**. În **Înainte** cuvintele eliminate sunt tăiate, în **Acum** cele adăugate sunt evidențiate. Pe telefon, cele două texte stau unul sub altul. Un text lung se deschide din **Ce s-a schimbat**;
- **Despre forma consolidată**: data formei, actul care a modificat legea, cu pagina lui pe portal, ziua în care a găsit-o verificarea zilnică, ziua în care șablonul a fost actualizat și legătura spre act pe Portalul Legislativ.

## Documentele de actualizat

După ce un șablon se schimbă, documentele generate din versiunea veche apar pe **Documente SSM de actualizat** sau pe **Documente SU de actualizat**, după setul din care fac parte. Aici e singurul lucru pe care îl ai de făcut: le **regenerezi**, adică le refaci pe versiunea nouă, cu datele de azi ale clienților.

Sus scrie câte documente sunt în urmă și la câți clienți. Tabelul are un rând pe document:

- **Document**: numele documentului și, dedesubt, versiunea nouă a șablonului și felul ei: **Modificare legislativă**, când o lege s-a schimbat, sau **Corectură**, când textul șablonului a fost îmbunătățit fără ca legea să se schimbe. **Instrucțiuni schimbate** înseamnă că documentul citează instrucțiuni care s-au schimbat între timp în bibliotecă sau la posturile de lucru;
- **Ce s-a schimbat**: în cuvinte, ce aduce versiunea nouă. Când ea răspunde unei modificări a legii, **Vezi modificarea …** deschide pagina acelei modificări;
- **Clienți**: câți clienți au documentul în urmă. Apasă pe număr ca să vezi clienții: fiecare duce la documentul lui, cu versiunea din care a fost generat și ce se întâmplă cu el la regenerare.

La regenerare:

- un document **emis** rămâne în vigoare și primește o ciornă nouă, pe care o emiți tu de pe pagina clientului;
- o **ciornă** se înlocuiește cu una nouă;
- o **ciornă editată de mână** rămâne neatinsă, ca să nu pierzi ce ai scris în ea. Pe aceea o regenerezi de pe pagina clientului, când hotărăști tu. Un document care are doar astfel de ciorne nu are buton de regenerare aici.

Cu **Regenerează toate** refaci deodată toate documentele tabului; cu **Regenerează**, de pe rândul unui document, doar documentul acela, la toți clienții lui. Înainte să pornească, fereastra de confirmare spune câte documente se refac, la câți clienți, câte sunt emise, câte sunt ciorne și ce ciorne editate de mână rămân neatinse.

Cât timp regenerarea lucrează, sus vezi câte documente sunt gata, iar fiecare rând spune unde a ajuns: **În așteptare**, **Se regenerează** sau **Gata**. Regenerarea continuă și dacă închizi pagina. Dacă se termină cât timp ești pe altă pagină a aplicației, apare o notificare jos, cu câte documente s-au regenerat, câte ciorne noi ai de emis și, în chihlimbar, câte nu s-au putut regenera; dacă ești chiar pe tabul documentelor, vezi rezultatul direct acolo. **Vezi rezultatul** te duce înapoi pe tab, unde rezultatul arată ciornele noi grupate pe client, cu **Deschide documentele** spre documentele fiecăruia, și, în chihlimbar, documentele care nu s-au putut regenera, cu datele care lipsesc. Le completezi de acolo, apoi regenerezi documentul. Dacă un document nu a putut porni deloc, sus apare, în chihlimbar, ce nu a pornit; îl regenerezi din nou.

Când nu ai nimic de actualizat într-un set, tabul lui spune că documentele sunt la zi. O schimbare care mută doar aranjarea în pagină nu cere regenerarea și nu apare aici.

## Ce nu ai de făcut

- nu citești portalul și nu urmărești când apare o formă consolidată nouă: aplicația o face zilnic;
- nu compari textul legii cu cel din documente și nu corectezi textul preluat în șabloane: le actualizăm noi;
- nu închizi modificările: pe cele fără impact le închide verificarea zilnică, iar pe celelalte echipa SSM Ușor, după ce le citește sau când publică șablonul actualizat.

Pagina nu trimite e-mailuri. Ce s-a schimbat vezi când o deschizi.
