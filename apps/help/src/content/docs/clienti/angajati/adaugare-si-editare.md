---
title: Adăugarea și modificarea unui angajat
description: Ce cere formularul angajatului, câmp cu câmp, ce reguli verifică aplicația și ce faci când refuză să salveze.
topics:
  - id: angajati.adaugare
    heading: Adăugarea unui angajat
  - id: angajati.nume
    heading: Numele și prenumele
  - id: angajati.cnp
    heading: CNP-ul
  - id: angajati.cnp-invalid
    heading: CNP invalid
  - id: angajati.duplicat
    heading: CNP sau marcă folosite deja
  - id: angajati.marca
    heading: Marca
  - id: angajati.post-de-lucru
    heading: Postul de lucru
  - id: angajati.functia-din-contract
    heading: Funcția din contract
  - id: angajati.numar-contract
    heading: Numărul contractului
  - id: angajati.data-angajarii
    heading: Data angajării
  - id: angajati.contact
    heading: Contactul
  - id: angajati.email
    heading: Emailul
  - id: angajati.telefon
    heading: Telefonul
  - id: angajati.date-fisa
    heading: Datele pentru fișa de instruire
  - id: angajati.punct-de-lucru
    heading: Punctul de lucru
  - id: angajati.data-nasterii
    heading: Data nașterii
  - id: angajati.domiciliu
    heading: Locul nașterii și domiciliul
  - id: angajati.grupa-sanguina
    heading: Grupa sanguină și Rh
  - id: angajati.calificare
    heading: Calificarea și studiile
  - id: angajati.autorizatii
    heading: Autorizațiile
  - id: angajati.traseu
    heading: Traseul de deplasare
  - id: angajati.durata-deplasarii
    heading: Durata deplasării
  - id: angajati.observatii
    heading: Observațiile
  - id: angajati.modificare
    heading: Modificarea datelor
  - id: angajati.schimbare-post
    heading: Schimbarea postului
  - id: angajati.salvare-refuzata
    heading: Când nu se salvează
sources:
  - docs/architecture/adr-006-job-positions.md
  - docs/architecture/adr-008-applicable-training-categories.md
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-022-participants-and-the-portal.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - packages/contracts/src/employees.ts
  - packages/contracts/src/cnp.ts
  - packages/contracts/src/phone.ts
  - apps/api/src/modules/employees/handlers.ts
  - apps/api/src/modules/trainings/sheet.ts
  - apps/app/src/features/employees/employee-form.tsx
  - apps/app/src/features/employees/employee-form-schema.ts
  - apps/app/src/features/employees/use-employee-form.ts
  - apps/app/src/features/employees/employee-job-position-dialog.tsx
  - apps/app/src/features/employees/employee-workplace-combobox.tsx
  - apps/app/src/lib/phone.ts
  - supabase/migrations/20260918100000_employees.sql
  - supabase/migrations/20261016200000_employee_sheet_fields.sql
  - supabase/migrations/20261018160000_employee_contract_number.sql
---

Formularul angajatului e același când adaugi pe cineva și când corectezi ce ai scris despre el. Doar cinci câmpuri sunt obligatorii; restul le completezi când le afli. Ce lipsește îți cere aplicația abia acolo unde e nevoie de el, de obicei la fișa de instruire.

## Adăugarea unui angajat

Din tabul **Angajați** al clientului alege **Adaugă angajat**. Angajatorul e clientul din care ai pornit și nu se poate schimba; pentru alt angajator, revino la lista de clienți.

Obligatorii sunt:

- **Nume** și **Prenume**;
- **Post de lucru**;
- **Funcția din contract**;
- **Data angajării**.

După salvare revii la listă și vezi un mesaj cu numele celui adăugat. Lista e ordonată și împărțită pe pagini, așa că rândul nou poate fi pe altă pagină.

## Identificare

### Numele și prenumele

Scrie-le ca în actul de identitate, fiecare în câmpul lui, cel mult 100 de caractere fiecare. Fișele tipăresc numele de familie cu majuscule, urmat de prenume.

### CNP-ul

CNP-ul e opțional. Are 13 cifre; poți lipi și un CNP scris cu spații, puncte sau cratime, aplicația păstrează doar cifrele.

Când ieși din câmp, un CNP valid completează **Data nașterii**, dacă e încă goală. Pentru cetățenii români, CNP-ul cuprinde data nașterii, așa că cele două trebuie să se potrivească (vezi [Data nașterii](#data-nașterii)).

CNP-ul nu apare în listele de angajați, în portal, pe fișele de instruire sau pe actul adițional. Pe pagina angajatului îl vezi ascuns, cu ultimele patru cifre, până alegi **Arată**.

### CNP invalid

„CNP invalid. Verifică cele 13 cifre, data nașterii și cifra de control.” apare când:

- nu sunt exact 13 cifre sau prima cifră e 0;
- luna sau ziua din CNP nu există (de exemplu, 31 aprilie);
- ultima cifră, cifra de control, nu se potrivește cu celelalte 12.

Cel mai des e o cifră greșită sau două cifre inversate. Verifică CNP-ul pe actul de identitate. Dacă nu îl ai la îndemână, lasă câmpul gol și completează-l mai târziu.

### CNP sau marcă folosite deja

La același client, doi angajați nu pot avea același CNP sau aceeași marcă. Dacă încerci, vezi sub câmp „Există deja un angajat cu acest CNP la client.” sau „Există deja un angajat cu această marcă la client.”

Regula îi include și pe foștii angajați. De obicei înseamnă că persoana e deja în listă: caut-o, inclusiv la **Foști angajați**, înainte s-o adaugi din nou. Despre reangajare vezi [Plecarea unui angajat](/clienti/angajati/plecare/).

### Marca

Numărul intern al angajatului la client, cel din evidența de personal, dacă clientul folosește așa ceva. Cel mult 40 de caractere. Marca apare sub nume în listă, pe fișele de instruire, și poți căuta după ea.

## Angajare

### Postul de lucru

Postul spune ce muncă face angajatul, deci ce riscuri are, ce echipament primește și cât de des se instruiește. De post depind categoria de personal și intervalul instruirii periodice.

Alegi postul din posturile clientului. Lângă fiecare vezi categoria de personal și câți angajați îl ocupă. Dacă postul nu e în listă, alege **Adaugă un post nou…**: îl creezi pe loc și formularul îl alege.

Dacă postul ales a fost arhivat între timp, vezi sub câmp „Postul ales nu mai există la acest client. Alege altul.”

Un angajat ocupă un singur post. Cine face muncă mixtă ocupă un post care spune asta, de exemplu „Administrator – vânzător”.

Pentru documentele SSM, programul de instruire al clientului trebuie să aibă un interval pentru fiecare categorie de personal în care are angajați actuali. Un angajat pus pe un post dintr-o categorie fără interval nu schimbă singur programul; aplicația îți cere intervalul când generezi documentele.

### Funcția din contract

Titlul din contractul individual de muncă. Când alegi postul, câmpul se completează cu numele postului; schimbă-l dacă în contract scrie altfel. Cât timp nu l-ai schimbat, urmează postul: dacă alegi alt post, se schimbă și funcția.

Funcția și postul sunt lucruri diferite. Doi oameni cu aceeași funcție pot ocupa posturi diferite. Documentele despre persoană tipăresc funcția din contract; cele despre muncă tipăresc postul. Între 2 și 160 de caractere.

### Numărul contractului

Numărul contractului individual de muncă, opțional, cel mult 50 de caractere. Se tipărește pe actul adițional privind semnarea electronică, lângă data angajării, care e data contractului.

### Data angajării

Ziua din contract. Până se înregistrează o instruire la locul de muncă, de la data angajării se socotește termenul următoarei instruiri.

La un fost angajat, data angajării nu poate fi după data plecării; altfel vezi sub câmp „Data angajării nu poate fi după data plecării.” Dacă te-ai înșelat la data plecării, corecteaz-o întâi: reactivează angajatul și marchează din nou plecarea, cu data bună.

## Contactul

Emailul și telefonul sunt opționale. Le folosești pentru invitația în portal și pentru codurile de semnare: angajatul intră în portal și semnează cu un cod primit la una dintre aceste adrese. Fără niciuna, nu-l poți invita în portal și nu-i poți descărca actul adițional.

### Emailul

O adresă de email validă, cel mult 254 de caractere. Aplicația o păstrează cu litere mici.

### Telefonul

Alegi țara din listă, România fiind prima, și scrii numărul. Merge și „0721 000 000”, și „+40 721 000 000”; un număr scris cu „+” sau „00” își păstrează țara. Sunt acceptate și numerele de fix.

„Numărul de telefon nu este valid pentru țara aleasă.” înseamnă că numărul are prea multe sau prea puține cifre pentru acea țară, sau că ai ales altă țară decât a numărului.

## Datele pentru fișa de instruire

Câmpurile din această secțiune sunt opționale în formular și apar pe fișele individuale de instruire. Un câmp gol se tipărește gol, ca pe formularul pe hârtie, cu două excepții: traseul de deplasare pentru fișa SSM și punctul de lucru la un client cu mai multe puncte. Fără ele, fișa nu se poate întocmi (vezi [Ce lipsește pentru fișă](/clienti/angajati/instruire-si-teste/)).

### Punctul de lucru

Unde lucrează angajatul, dintre punctele de lucru ale clientului. Când adaugi un angajat la un client cu un singur punct de lucru activ, acesta e ales automat; îl poți șterge dacă nu e cel bun.

La un client cu mai multe puncte de lucru active, fișele cer punctul de lucru, pentru că „Locul de muncă” de pe fișă tipărește punctul de lucru împreună cu zona de lucru a postului, de exemplu „Str. Fabricii 3 – Atelier”.

Dacă punctul de lucru lipsește, alege **Adaugă un punct de lucru nou…**: îl adaugi pe loc și formularul îl alege. Un punct de lucru arhivat rămâne la angajații care îl aveau, marcat **Arhivat**, dar nu mai poate fi ales din nou. Dacă punctul ales a fost arhivat între timp, vezi sub câmp „Punctul de lucru ales nu mai este activ la acest client. Alege altul.”

### Data nașterii

Data nașterii trebuie:

- să fie înaintea datei angajării; altfel vezi „Data nașterii trebuie să fie înaintea datei angajării.”;
- să se potrivească cu CNP-ul, când CNP-ul o cuprinde; altfel vezi „Data nașterii nu corespunde cu CNP-ul.”

La al doilea mesaj, una dintre cele două e greșită. Verifică-le pe actul de identitate. Dacă ștergi data, CNP-ul o completează din nou când ieși din câmpul lui.

CNP-urile care încep cu 7, 8 sau 9, atribuite străinilor, nu spun secolul nașterii, așa că la ele aplicația nu compară data cu CNP-ul.

### Locul nașterii și domiciliul

Așa cum vrei să apară pe fișă: localitatea și județul pentru locul nașterii, adresa completă pentru domiciliu. Cel mult 160 și, respectiv, 240 de caractere.

### Grupa sanguină și Rh

Le alegi din listă sau lași „Necunoscută” și „Necunoscut”. Se tipăresc pe fișa SSM, de exemplu „A(II) Rh+”.

### Calificarea și studiile

Text liber, cel mult 160 de caractere fiecare, de exemplu „electrician” și „medii”. Calificarea apare pe ambele fișe, studiile pe fișa PSI.

### Autorizațiile

Autorizațiile cerute de munca lui, de exemplu ISCIR sau electrician autorizat ANRE. Cel mult 500 de caractere. Se tipăresc pe fișa SSM.

### Traseul de deplasare

Drumul obișnuit de acasă la locul de muncă și înapoi, cu mijlocul de transport, de exemplu „Str. Florilor 5 – Str. Fabricii 3, cu autobuzul 12”. Cel mult 1000 de caractere.

Fișa SSM îl cere: fără traseu, nu se poate întocmi. Contează pentru că un accident petrecut în timpul și pe traseul normal de la domiciliu la locul de muncă și înapoi, fără abateri nejustificate, e accident de muncă (Legea 319/2006, art. 30 alin. (1) lit. g) și alin. (2)), iar traseul declarat e cel cu care se compară o cercetare.

Nu e obligatoriu în formular, pentru că rar îl știi când introduci un angajat nou. Completează-l înainte de prima instruire: angajatul semnează fișa pe pagina care tipărește traseul.

### Durata deplasării

Cât durează drumul obișnuit, în minute: un număr întreg între 1 și 600. Se tipărește lângă traseu, de exemplu „(25 de minute)”.

### Observațiile

Notițele tale despre angajat, cel mult 2000 de caractere. Nu apar pe fișe și nici în portal.

## Modificarea datelor

**Modifică** din pagina angajatului sau din meniul rândului deschide același formular, completat. După salvare revii pe pagina angajatului.

Formularul corectează ce ai scris despre angajat. Plecarea nu se marchează de aici: are acțiunea ei, **Marchează plecarea…**.

Instruirile înregistrate nu se schimbă când modifici datele angajatului: fiecare păstrează postul pe care îl avea angajatul în ziua ei. Fișa nesemnată se reface din datele de azi de fiecare dată când o deschizi.

## Schimbarea postului

Pentru un angajat mutat pe alt post, folosește **Schimbă…** de lângă post, pe pagina lui. Noul post aduce alte riscuri, alt echipament și, poate, alt interval de instruire.

Funcția din contract se schimbă odată cu postul doar dacă avea aceeași denumire ca postul vechi: o mutare nu înseamnă neapărat un contract nou. Dacă s-a schimbat și contractul, scrie noua funcție în același dialog.

„Postul ales nu mai există la acest client. Alege altul.” apare când postul a fost arhivat între timp.

## Când nu se salvează

Când un câmp nu e bun, mesajul apare sub el și pagina te duce la primul câmp greșit. Celelalte mesaje apar sub formular:

- „Clientul este arhivat; nu mai pot fi adăugați angajați.”: clientul a fost arhivat între timp.
- „Datele intră în conflict cu alt angajat al clientului.”: un alt angajat are deja CNP-ul sau marca acestuia; verifică CNP-ul și marca.
- „Angajatul nu mai există la acest client.” sau „Clientul nu mai există în organizația ta.”: reîncarcă lista.
- „Nu am putut salva angajatul. Verifică conexiunea și încearcă din nou.”: salvarea nu a ajuns la aplicație; ce ai scris rămâne în formular, încearcă din nou.
