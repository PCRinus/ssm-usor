---
title: Sediul și punctele de lucru
description: Punctele de lucru ale unui client, sediul social, adresele lor și datele PSI pe care le cer documentele, câmp cu câmp.
topics:
  - id: detalii.puncte-de-lucru
    heading: Lista punctelor de lucru
  - id: detalii.adaugare-punct
    heading: Adăugarea unui punct de lucru
  - id: detalii.denumire-punct
    heading: Denumirea
  - id: detalii.sediu-social
    heading: Este sediul social
  - id: detalii.adresa-punct
    heading: Adresa
  - id: detalii.adresa-diferita
    heading: Când adresa sediului diferă
  - id: detalii.arhivare-punct
    heading: Arhivarea unui punct de lucru
  - id: detalii.date-psi
    heading: Datele PSI
  - id: detalii.activitate
    heading: Activitatea
  - id: detalii.fel-loc-de-munca
    heading: Felul locului de muncă
  - id: detalii.suprafata-utila
    heading: Suprafața utilă
  - id: detalii.norma-stingatoare
    heading: Norma de dotare cu stingătoare
  - id: detalii.punct-de-adunare
    heading: Punctul de adunare
  - id: detalii.fisa-loc-de-munca
    heading: Materialele, sursele de aprindere și echipamentele
  - id: detalii.masuri-specifice
    heading: Măsurile specifice
  - id: detalii.date-psi-incomplete
    heading: Date PSI incomplete
sources:
  - docs/architecture/adr-018-fire-safety-means.md
  - docs/architecture/adr-020-fire-safety-from-ten-employees.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - packages/contracts/src/fire-safety.ts
  - packages/contracts/src/documents.ts
  - apps/api/src/modules/documents/fire-safety.ts
  - apps/api/src/modules/documents/site-sheet.ts
  - apps/app/src/features/clients/workplaces-card.tsx
  - apps/app/src/features/clients/workplace-dialog.tsx
  - apps/app/src/features/clients/workplace-schema.ts
  - apps/app/src/features/fire-safety-means/fire-means-schema.ts
  - apps/app/src/features/missing-data/missing-rows.ts
---

Un punct de lucru e un loc în care lucrează angajații clientului: sediul, un magazin, un birou, un atelier, un șantier. Fiecare angajat are punctul lui de lucru (vezi [Punctul de lucru](/clienti/angajati/adaugare-si-editare/#punctul-de-lucru)), iar documentele PSI tipăresc fiecare punct de lucru activ, cu activitatea, adresa și mijloacele lui de apărare împotriva incendiilor.

## Lista punctelor de lucru

Punctele de lucru sunt pe tabul **Detalii**, în cardul **Sediu și puncte de lucru**. Fiecare rând arată denumirea și adresa. Sediul social are eticheta **Sediu social**, iar un punct de lucru căruia îi lipsesc date cerute de documentele PSI are dedesubt **Date PSI incomplete**.

Un clic pe rând deschide punctul de lucru ca să-l modifici. Din meniul de la capătul rândului ajungi la **Modifică** și **Arhivează**.

## Adăugarea unui punct de lucru

Alege **Adaugă** pe cardul **Sediu și puncte de lucru**. Același dialog se deschide și din formularul angajatului, cu **Adaugă un punct de lucru nou…**.

Doar denumirea e obligatorie. Poți salva și fără datele PSI: ce lipsește îți cere aplicația când generezi documentele PSI.

Începe cu sediul social, apoi adaugă celelalte locuri în care lucrează clientul.

### Denumirea

Cum îi spuneți locului, de exemplu „Sediu social” sau „Magazin Timișoara”. Între 2 și 160 de caractere. Documentele PSI o tipăresc.

### Este sediul social

Bifează căsuța pentru punctul de lucru care e sediul social al firmei. Un client are un singur sediu social. Dacă bifezi căsuța la al doilea punct de lucru, vezi „Clientul are deja un sediu social. Modifică-l pe acela sau debifează opțiunea.”

Fișa obiectivului din setul PSI tipărește celelalte puncte de lucru ca puncte de lucru ale firmei. Când adresa sediului lipsește din datele firmei, fișa folosește adresa acestui punct de lucru.

### Adresa

Alege **Județ**, apoi **Localitate** din localitățile acelui județ, și scrie **Adresă**, cel mult 240 de caractere. Când schimbi județul, localitatea se golește, ca să o alegi din noul județ. Toate trei sunt opționale.

### Când adresa sediului diferă

La sediul social, aplicația compară adresa punctului de lucru cu adresa sediului din datele firmei. Dacă diferă, sub adresă vezi „În datele clientului, sediul este: …” și **Folosește această adresă**, care copiază adresa din datele firmei la punctul de lucru.

Contează doar ce e completat în datele firmei: un câmp gol acolo nu e o diferență și nu golește adresa punctului de lucru. Dacă adresa bună e cea a punctului de lucru, corecteaz-o în datele firmei (vezi [Sediul social](/clienti/adaugare-si-modificare/#sediul-social)).

## Arhivarea unui punct de lucru

Arhivezi un punct de lucru în care clientul nu mai lucrează. Alege **Arhivează** din meniul rândului și confirmă. Punctul de lucru nu mai apare în listă și nici în documentele generate de acum înainte. Documentele deja emise rămân neschimbate.

Angajații care îl aveau îl păstrează, marcat **Arhivat**, dar nu mai poate fi ales din nou.

## Datele PSI

Secțiunea **Apărare împotriva incendiilor** din dialog ține ce cer documentele PSI despre fiecare punct de lucru. Documentele PSI cer toate câmpurile fără „(opțional)”:

- activitatea;
- la un spațiu fix, suprafața utilă și norma de dotare cu stingătoare;
- punctul de adunare;
- materialele combustibile, sursele de aprindere și echipamentele și mijloacele de lucru.

Setul PSI se generează întreg, așa că un singur punct de lucru activ cu date lipsă oprește tot setul. În lista datelor lipsă apare „Datele PSI ale locurilor de muncă”; linkul deschide primul punct de lucru incomplet, la primul câmp lipsă.

### Activitatea

Ce se face în acel loc, de exemplu „Gelaterie”, „Birouri” sau „Atelier de sudură”. Între 2 și 160 de caractere. Documentele PSI tipăresc activitatea fiecărui punct de lucru, iar fișa obiectivului o trece la domeniul de activitate al firmei.

### Felul locului de muncă

- **Spațiu fix**: un sediu, un birou, un magazin, o hală;
- **Șantier temporar sau mobil**: un loc în care se lucrează o perioadă, ca la o firmă de construcții.

Un șantier nu are suprafață utilă și nici normă de dotare cu stingătoare, așa că cele două câmpuri dispar când îl alegi, iar documentele tipăresc „—” în locul lor. Fișa obiectivului îl trece printre punctele de lucru cu mențiunea „(șantier temporar sau mobil)”.

### Suprafața utilă

În metri pătrați, un număr întreg între 1 și 1.000.000. Altfel vezi „Introdu suprafața în metri pătrați, un număr întreg de la 1 la 1.000.000.” Lista mijloacelor de apărare împotriva incendiilor o tipărește, iar tabul **Mijloace PSI** o folosește ca să-ți arate câte stingătoare recomandă norma.

### Norma de dotare cu stingătoare

Categoria de construcție în care se încadrează spațiul, din anexa 6 a Normelor generale de apărare împotriva incendiilor (OMAI 163/2007, art. 131 alin. (2) și anexa 6). Anexa dă un număr orientativ de stingătoare portative pentru construcțiile pentru care reglementările tehnice nu prevăd altceva:

- clădiri administrative: 1 la 300 m²;
- clădiri comerciale: 1 la 200 m²;
- clădiri de locuit: 1 pe nivel/apartament, cu caracter de recomandare;
- clădiri civile cu funcțiuni mixte: 1 la 300 m²;
- alte amenajări: 1 la 150 m².

Sub listă vezi ce cuprinde categoria aleasă. Pentru un spațiu care nu se încadrează în nicio categorie, de exemplu un atelier, alege **Fără normă din anexa 6**.

Pe tabul **Mijloace PSI**, lângă numărul de stingătoare al punctului de lucru, vezi minimul orientativ: suprafața împărțită la suprafața din normă, rotunjită în sus, cel puțin un stingător. La clădirile de locuit vezi „cel puțin unul pe nivel”, iar fără normă nu vezi niciun minim. Anexa socotește numărul după suprafața desfășurată; aplicația îl socotește din suprafața pe care o scrii aici.

Minimul e doar o indicație: nu se tipărește și nu oprește generarea. Anexa îl numește orientativ și spune că tipul și numărul de stingătoare le stabilește proiectantul sau, la construcțiile existente, scenariile de incendiu ori persoana cu atribuții, după riscul de incendiu și materialele din spațiu. Ce cere aplicația la generare e cel puțin un stingător la fiecare punct de lucru activ.

### Punctul de adunare

Locul în care se strâng oamenii după evacuare, de exemplu „parcarea din fața clădirii”. Între 2 și 240 de caractere. Documentele PSI îl tipăresc pentru fiecare punct de lucru.

### Materialele, sursele de aprindere și echipamentele

Trei texte despre locul acela, pe care doar cine îl cunoaște le poate scrie. Documentul „Organizarea apărării împotriva incendiilor la locul de muncă” le tipărește în prima lui secțiune:

- **Materiale combustibile**: ce poate arde, de exemplu „produse finite din lemn, lacuri, solvenți”;
- **Surse de aprindere**: de unde poate porni un incendiu, de exemplu „de natură electrică, termică, autoaprindere”;
- **Echipamente și mijloace de lucru**: cu ce se lucrează acolo, de exemplu „motoare electrice, instalații de ventilație, scule”.

Fiecare are între 2 și 600 de caractere. Exemplele din câmpuri sunt doar sugestii; scrie ce e la acel punct de lucru.

### Măsurile specifice

Opționale, între 2 și 600 de caractere: ce măsuri cere doar acel loc, de exemplu „asigurarea funcționării sistemului de evacuare a gazelor”. Lăsate goale, documentul tipărește punctul lor gol, ca să fie completat de mână.

Măsurile generale, aceleași la orice punct de lucru, sunt deja în document. Printre ele: focul deschis numai cu permis de lucru, fumatul după regula clientului, deșeurile combustibile strânse zilnic și căile de acces și de evacuare ținute libere.

### Date PSI incomplete

Eticheta din listă arată că punctului de lucru îi lipsește cel puțin unul dintre câmpurile cerute de documentele PSI. Deschide-l și completează câmpurile fără „(opțional)” din secțiunea **Apărare împotriva incendiilor**.
