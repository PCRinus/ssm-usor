---
title: Sediul și punctele de lucru
description: Punctele de lucru ale unui client, sediul social, adresele lor și datele SU pe care le cer documentele, câmp cu câmp.
topics:
  - id: detalii.puncte-de-lucru
    heading: Lista punctelor de lucru
  - id: detalii.adaugare-punct
    heading: Adăugarea unui punct de lucru
  - id: detalii.denumire-punct
    heading: Denumirea
  - id: detalii.sediu-social
    heading: Este sediul social
  - id: detalii.sediu-fara-activitate
    heading: La sediul social se desfășoară activitate
  - id: detalii.adresa-punct
    heading: Adresa
  - id: detalii.adresa-diferita
    heading: Când adresa sediului diferă
  - id: detalii.arhivare-punct
    heading: Arhivarea unui punct de lucru
  - id: detalii.date-su
    heading: Datele SU
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
  - id: detalii.date-su-incomplete
    heading: Date SU incomplete
sources:
  - docs/architecture/adr-018-fire-safety-means.md
  - docs/architecture/adr-020-fire-safety-from-ten-employees.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-041-su-import-questions-and-suggestions.md
  - docs/architecture/adr-042-substances-from-safety-data-sheets.md
  - packages/contracts/src/fire-safety.ts
  - packages/contracts/src/documents.ts
  - apps/api/src/modules/documents/fire-safety.ts
  - apps/api/src/modules/documents/site-sheet.ts
  - apps/app/src/features/clients/workplaces-card.tsx
  - apps/app/src/features/clients/workplace-dialog.tsx
  - apps/app/src/features/clients/workplace-schema.ts
  - apps/app/src/features/fire-safety-means/fire-means-schema.ts
  - apps/app/src/features/fire-safety-means/fire-safety-means-page.tsx
  - apps/app/src/features/fire-safety-means/substance-dialog.tsx
  - apps/app/src/features/fire-safety-means/safety-sheet-reader.tsx
  - apps/app/src/features/missing-data/missing-rows.ts
---

Un punct de lucru e un loc în care lucrează lucrătorii clientului: sediul, un magazin, un birou, un atelier, un șantier. Fiecare lucrător are punctul lui de lucru (vezi [Punctul de lucru](/clienti/angajati/adaugare-si-editare/#punctul-de-lucru)), iar documentele SU tipăresc fiecare punct de lucru activ, cu activitatea, adresa și mijloacele lui de apărare împotriva incendiilor. Singura excepție e sediul social care e doar o adresă (vezi [La sediul social se desfășoară activitate](#la-sediul-social-se-desfășoară-activitate)).

## Lista punctelor de lucru

Punctele de lucru sunt pe tabul **Detalii**, în cardul **Sediu și puncte de lucru**. Fiecare rând arată denumirea și adresa. Sediul social are eticheta **Sediu social**, iar un punct de lucru căruia îi lipsesc date cerute de documentele SU are dedesubt **Date SU incomplete**. Sub sediul social la care nu se desfășoară activitate vezi **Fără activitate la sediu**.

Un clic pe rând deschide punctul de lucru ca să-l modifici. Din meniul de la capătul rândului ajungi la **Modifică** și **Arhivează**.

## Adăugarea unui punct de lucru

Alege **Adaugă** pe cardul **Sediu și puncte de lucru**. Același dialog se deschide și din formularul lucrătorului, cu **Adaugă un punct de lucru nou…**.

Doar denumirea e obligatorie. Poți salva și fără datele SU: ce lipsește îți cere aplicația când generezi documentele SU.

Începe cu sediul social, apoi adaugă celelalte locuri în care lucrează clientul.

### Denumirea

Cum îi spuneți locului, de exemplu „Sediu social” sau „Magazin Timișoara”. Între 2 și 160 de caractere. Documentele SU o tipăresc.

### Este sediul social

Bifează căsuța pentru punctul de lucru care e sediul social al firmei. Un client are un singur sediu social. Dacă bifezi căsuța la al doilea punct de lucru, vezi „Clientul are deja un sediu social. Modifică-l pe acela sau debifează opțiunea.”

Fișa obiectivului din setul SU tipărește celelalte puncte de lucru ca puncte de lucru ale firmei. Când adresa sediului lipsește din datele firmei, fișa folosește adresa acestui punct de lucru.

### La sediul social se desfășoară activitate

Căsuța apare doar la sediul social și e bifată de la început. Debifeaz-o când sediul e doar o adresă, la care clientul nu lucrează: un domiciliu sau un sediu găzduit de altă firmă.

Când e debifată:

- dialogul nu mai arată secțiunea **Apărare împotriva incendiilor**, iar documentele SU nu cer pentru sediu nici date SU, nici stingător;
- documentele SU lasă sediul deoparte peste tot unde enumeră locurile de muncă: lista mijloacelor de apărare, fișa și instrucțiunile afișate la locul de muncă, decizia pentru perioadele caniculare și sezonul rece, graficele de verificare, registrele, raportul anual și tematica;
- lista mijloacelor de apărare împotriva incendiilor spune într-un rând că la sediul social nu se desfășoară activitate, cu adresa sediului, ca să se vadă de ce acolo nu e niciun stingător;
- adresa sediului rămâne adresa firmei unde documentele o tipăresc ca atare, de exemplu pe fișa obiectivului;
- pe tabul **Mijloace de apărare** sediul nu mai are card. Ce ai completat înainte pentru el (datele SU, stingătoarele, instalațiile, verificările, clădirea) rămâne păstrat, dar nu se mai vede și nu se tipărește; revine dacă bifezi din nou căsuța;
- sediul nu mai poate fi ales ca punct de lucru al unui angajat, nici la importul angajaților din fișe;
- sediul nu mai poate fi ales ca loc de muncă al unei persoane responsabile. O persoană legată de sediu dinainte rămâne așa, iar documentele SU o trec ca pe una legată de toate locurile de muncă.

Nu poți debifa căsuța când:

- clientul nu are alt punct de lucru activ. Vezi „Clientul nu are alt punct de lucru activ. Adaugă întâi punctul de lucru în care se desfășoară activitatea.” Din același motiv nu poți arhiva ultimul punct de lucru cât timp la sediu nu se desfășoară activitate;
- la sediu lucrează angajați actuali. Mesajul spune câți; mută-i întâi, din fișa fiecăruia, la punctul de lucru unde lucrează.

Când imporți clientul din documente, importul îți poate propune că la sediul social nu se desfășoară activitate, dacă documentele numesc un punct de lucru separat și nu pun nimic la sediu; răspunsul e tot al tău (vezi [Importul unui client din documente](/clienti/import/#importul-unui-client-din-documente)).

Un punct de lucru în care nu se mai lucrează nu are această căsuță: îl arhivezi (vezi [Arhivarea unui punct de lucru](#arhivarea-unui-punct-de-lucru)).

Niciunul dintre actele următoare nu leagă un stingător sau o fișă afișată de adresa sediului social. Normele generale de apărare împotriva incendiilor stabilesc tipul și numărul stingătoarelor pe construcție, după reglementările tehnice sau normele specifice (OMAI 163/2007, art. 131). Pentru construcțiile fără astfel de prevederi, anexa 6 dă un număr orientativ, iar nota ei lasă alegerea proiectantului sau, la o construcție existentă, scenariului de incendiu ori persoanei cu atribuții, după riscul de incendiu și materialele din spațiu; la clădirile de locuit numărul e doar o recomandare. Legea 307/2006 dă obligațiile administratorului „în unitatea sa” (art. 19), iar celui care folosește un spațiu îi cere să respecte măsurile stabilite de proprietar sau de administrator (art. 21). Legea 265/2022 cere declarația privind activitatea pentru sediul social și pentru fiecare sediu secundar (art. 121 și 122), iar îndrumările Oficiului Național al Registrului Comerțului privesc și firma care nu desfășoară la sediul social activitatea declarată.

Nici Inspectoratul General pentru Situații de Urgență, nici vreun inspectorat județean nu a publicat o poziție despre un sediu social la care nu se desfășoară activitate. De aceea căsuța debifată rămâne răspunsul clientului, iar documentele SU arată de ce sediul lipsește din liste.

### Adresa

Alege **Județ**, apoi **Localitate** din localitățile acelui județ, și scrie **Adresă**, cel mult 240 de caractere. Când schimbi județul, localitatea se golește, ca să o alegi din noul județ. Toate trei sunt opționale.

### Când adresa sediului diferă

La sediul social, aplicația compară adresa punctului de lucru cu adresa sediului din datele firmei. Dacă diferă, sub adresă vezi „În datele clientului, sediul este: …” și **Folosește această adresă**, care copiază adresa din datele firmei la punctul de lucru.

Contează doar ce e completat în datele firmei: un câmp gol acolo nu e o diferență și nu golește adresa punctului de lucru. Dacă adresa bună e cea a punctului de lucru, corecteaz-o în datele firmei (vezi [Sediul social](/clienti/adaugare-si-modificare/#sediul-social)).

## Arhivarea unui punct de lucru

Arhivezi un punct de lucru în care clientul nu mai lucrează. Alege **Arhivează** din meniul rândului și confirmă. Punctul de lucru nu mai apare în listă și nici în documentele generate de acum înainte. Documentele deja emise rămân neschimbate.

Lucrătorii care îl aveau îl păstrează, marcat **Arhivat**, dar nu mai poate fi ales din nou.

## Datele SU

Secțiunea **Apărare împotriva incendiilor** din dialog ține ce cer documentele SU despre fiecare punct de lucru. Documentele SU cer toate câmpurile fără „(opțional)”:

- activitatea;
- la un spațiu fix, suprafața utilă și norma de dotare cu stingătoare;
- punctul de adunare;
- materialele combustibile, sursele de aprindere și echipamentele și mijloacele de lucru.

Setul SU se generează întreg, așa că un singur punct de lucru activ cu date lipsă oprește tot setul. Sediul social la care nu se desfășoară activitate nu e cerut. În lista datelor lipsă apare „Datele SU ale locurilor de muncă”; linkul deschide primul punct de lucru incomplet, la primul câmp lipsă.

### Activitatea

Ce se face în acel loc, de exemplu „Gelaterie”, „Birouri” sau „Atelier de sudură”. Între 2 și 160 de caractere. Documentele SU tipăresc activitatea fiecărui punct de lucru, iar fișa obiectivului o trece la domeniul de activitate al firmei.

### Felul locului de muncă

- **Spațiu fix**: un sediu, un birou, un magazin, o hală;
- **Șantier temporar sau mobil**: un loc în care se lucrează o perioadă, ca la o firmă de construcții.

Un șantier nu are suprafață utilă și nici normă de dotare cu stingătoare, așa că cele două câmpuri dispar când îl alegi, iar documentele tipăresc „—” în locul lor. Fișa obiectivului îl trece printre punctele de lucru cu mențiunea „(șantier temporar sau mobil)”.

### Suprafața utilă

În metri pătrați, un număr întreg între 1 și 1.000.000. Altfel vezi „Introdu suprafața în metri pătrați, un număr întreg de la 1 la 1.000.000.” Lista mijloacelor de apărare împotriva incendiilor o tipărește, iar tabul **Mijloace de apărare** o folosește ca să-ți arate câte stingătoare recomandă norma.

### Norma de dotare cu stingătoare

Categoria de construcție în care se încadrează spațiul, din anexa 6 a Normelor generale de apărare împotriva incendiilor (OMAI 163/2007, art. 131 alin. (2) și anexa 6). Anexa dă un număr orientativ de stingătoare portative pentru construcțiile pentru care reglementările tehnice nu prevăd altceva:

- clădiri administrative: 1 la 300 m²;
- clădiri comerciale: 1 la 200 m²;
- clădiri de locuit: 1 pe nivel/apartament, cu caracter de recomandare;
- clădiri civile cu funcțiuni mixte: 1 la 300 m²;
- alte amenajări: 1 la 150 m².

Sub listă vezi ce cuprinde categoria aleasă. Pentru un spațiu care nu se încadrează în nicio categorie, de exemplu un atelier, alege **Fără normă din anexa 6**.

Pe tabul **Mijloace de apărare**, lângă numărul de stingătoare al punctului de lucru, vezi minimul orientativ: suprafața împărțită la suprafața din normă, rotunjită în sus, cel puțin un stingător. La clădirile de locuit vezi „cel puțin unul pe nivel”, iar fără normă nu vezi niciun minim. Anexa socotește numărul după suprafața desfășurată; aplicația îl socotește din suprafața pe care o scrii aici.

Minimul e doar o indicație: nu se tipărește și nu oprește generarea. Anexa îl numește orientativ și spune că tipul și numărul de stingătoare le stabilește proiectantul sau, la construcțiile existente, scenariile de incendiu ori persoana cu atribuții, după riscul de incendiu și materialele din spațiu. Ce cere aplicația la generare e cel puțin un stingător la fiecare punct de lucru activ, în afară de sediul social la care nu se desfășoară activitate.

### Punctul de adunare

Locul în care se strâng oamenii după evacuare, de exemplu „parcarea din fața clădirii”. Între 2 și 240 de caractere. Documentele SU îl tipăresc pentru fiecare punct de lucru.

### Materialele, sursele de aprindere și echipamentele

Trei texte despre locul acela, pe care doar cine îl cunoaște le poate scrie. Documentul „Organizarea apărării împotriva incendiilor la locul de muncă” le tipărește în prima lui secțiune:

- **Materiale combustibile**: ce poate arde, de exemplu „produse finite din lemn, lacuri, solvenți”;
- **Surse de aprindere**: de unde poate porni un incendiu, de exemplu „de natură electrică, termică, autoaprindere”;
- **Echipamente și mijloace de lucru**: cu ce se lucrează acolo, de exemplu „motoare electrice, instalații de ventilație, scule”.

Fiecare are între 2 și 600 de caractere. Exemplele din câmpuri sunt doar sugestii; scrie ce e la acel punct de lucru.

### Măsurile specifice

Opționale, între 2 și 600 de caractere: ce măsuri cere doar acel loc, de exemplu „asigurarea funcționării sistemului de evacuare a gazelor”. Lăsate goale, documentul tipărește punctul lor gol, ca să fie completat de mână.

Măsurile generale, aceleași la orice punct de lucru, sunt deja în document. Printre ele: focul deschis numai cu permis de lucru, fumatul după regula clientului, deșeurile combustibile strânse zilnic și căile de acces și de evacuare ținute libere.

### Date SU incomplete

Eticheta din listă arată că punctului de lucru îi lipsește cel puțin unul dintre câmpurile cerute de documentele SU. Deschide-l și completează câmpurile fără „(opțional)” din secțiunea **Apărare împotriva incendiilor**.

## Substanțele periculoase

Pe tabul **Mijloace de apărare**, sub punctele de lucru, cardul **Substanțe periculoase** ține lista substanțelor periculoase ale clientului, pe care documentele SU o tipăresc în lista substanțelor periculoase. Pentru fiecare substanță scrii denumirea, clasificarea, cantitatea deținută și opt texte: proprietățile fizico-chimice, codurile de identificare, riscurile pentru sănătate și mediu, mijloacele de protecție, măsurile de intervenție și de prim ajutor, substanțele pentru stingere, locul de depozitare și modul de manipulare. Sub fiecare câmp scrie din ce secțiune a fișei cu date de securitate se copiază. Un text lăsat gol apare în listă ca loc de completat.

Fișa cu date de securitate o primește clientul de la furnizorul produsului. Regulamentul (CE) nr. 1907/2006 (REACH), art. 31 alin. (1), îi cere furnizorului unui produs periculos s-o dea, întocmită după anexa II, cu cele 16 secțiuni ale ei; alin. (5) cere ca fișa să fie într-o limbă oficială a statului în care se vinde produsul, iar alin. (8), s-o dea gratuit, pe hârtie sau electronic, cel târziu la prima livrare. Clasificarea din secțiunea 2 este cea după Regulamentul (CE) nr. 1272/2008 (CLP).

### Completarea din fișa cu date de securitate

În fereastra unei substanțe, nouă sau deja în listă, inclusiv una preluată din import cu eticheta „Incompletă”, alegi **Alege fișa (PDF)** și PDF-ul fișei produsului. O fișă înseamnă o substanță. Citirea folosește 3 credite, iar fereastra îți arată, înainte să alegi fișierul, câte îți mai rămân. Dacă nu-ți ajung, butonul nu se poate apăsa.

Citirea durează de obicei sub un minut. Între timp poți completa cantitatea și locul de depozitare. După citire:

- **Câmpurile goale** se completează din fișă și sunt marcate „Din fișă” până le modifici. Textele sunt în română, și când fișa e în altă limbă, și sunt scurtate la ce contează pentru apărarea împotriva incendiilor și pentru prima intervenție. O secțiune pe care fișa n-o completează lasă câmpul gol.
- **Un câmp completat deja** rămâne cum l-ai scris. Dacă fișa spune altceva, vezi sub el „Păstrăm textul tău. În fișă: …”; cu **Folosește textul din fișă** îl iei pe cel din fișă.
- **Cantitatea și locul de depozitare** nu se completează niciodată: sunt ale clientului, nu ale produsului.
- **Nimic nu se salvează** până nu apeși **Salvează**. Fișierul nu se păstrează; dacă vrei să-l ai la client, îl încarci la **Alte documente**.

Fiecare frază de pericol (H sau EUH), număr CAS, CE sau ONU trecut în ce am completat trebuie să apară în fișă. Unul pe care nu-l găsim în fișă îl lăsăm deoparte, iar fereastra îți spune câte am lăsat, ca să verifici în fișă clasificarea și codurile de identificare.

Citim deocamdată doar fișe în PDF cu text, cum le trimit furnizorii, de cel mult 10 MB și 40 de pagini. O fișă scanată sau fotografiată, un fișier deteriorat sau protejat cu parolă și un document care nu e o fișă cu date de securitate, de exemplu o fișă tehnică sau o etichetă, nu se citesc, iar creditele îți sunt returnate. La fel când citirea nu reușește din motive care nu țin de fișier.
