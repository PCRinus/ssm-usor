---
title: Detalii
description: Tabul Detalii al clientului, parte cu parte, cu datele firmei, reprezentantul legal, persoana de contact, notițele și importurile AI, și documentele care le folosesc.
topics:
  - id: detalii.date-firma
    heading: Datele firmei
  - id: detalii.reprezentant-legal
    heading: Reprezentantul legal
  - id: detalii.nume-reprezentant
    heading: Numele și prenumele
  - id: detalii.functia-reprezentantului
    heading: Funcția
  - id: detalii.reprezentant-angajat
    heading: Administratorul este și lucrător al firmei
  - id: detalii.persoana-de-contact
    heading: Persoana de contact
  - id: detalii.contact-email
    heading: Emailul
  - id: detalii.contact-telefon
    heading: Telefonul
  - id: detalii.notite
    heading: Notițele
  - id: detalii.importuri
    heading: Importurile AI
  - id: detalii.date-lipsa
    heading: Când documentele cer date de aici
sources:
  - docs/architecture/adr-005-document-generation.md
  - docs/architecture/adr-007-leads-and-service-contracts.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - packages/contracts/src/clients.ts
  - packages/contracts/src/document-data.ts
  - packages/contracts/src/documents.ts
  - packages/contracts/src/signatures.ts
  - apps/api/src/modules/document-data/handlers.ts
  - apps/api/src/modules/documents/site-sheet.ts
  - apps/api/src/modules/service-contracts/context.ts
  - apps/app/src/routes/_authenticated/clienti/$clientId/detalii.tsx
  - apps/app/src/features/clients/company-card.tsx
  - apps/app/src/features/clients/legal-representative-form.tsx
  - apps/app/src/features/clients/contact-card.tsx
  - apps/app/src/features/clients/owner-notes-card.tsx
  - apps/app/src/features/clients/details/company-people-panel.tsx
  - apps/app/src/features/clients/details/notes-panel.tsx
  - apps/app/src/features/imports/library/client-imports-card.tsx
  - apps/app/src/features/imports/library/waiting-import-panel.tsx
  - apps/app/src/features/clients/client-form-schema.ts
  - apps/app/src/features/clients/document-details/document-details-schema.ts
  - apps/app/src/features/missing-data/missing-rows.ts
  - supabase/migrations/20261022100000_legal_representative_employee.sql
---

**Detalii** e primul tab al clientului și ține ce știi despre firmă: datele ei, reprezentantul legal și persoana de contact, sediul și punctele de lucru și, pentru admini, notițele. Fiecare parte se modifică separat: **Modifică** deschide pe loc câmpurile ei, iar unde nu e încă nimic completat butonul se numește **Adaugă**.

Pe un client arhivat tabul se poate doar citi (vezi [Un client arhivat](/clienti/#un-client-arhivat)).

## Datele firmei

Panoul **Date firmă și persoane** arată, rând cu rând:

- **Nr. Reg. Com.**, numărul din Registrul Comerțului;
- **Cod CAEN**, cu denumirea activității dedesubt;
- **Sediul social**, adresa, localitatea și județul, pe un singur rând;
- **Plătitor de TVA**, „Da” sau „Nu”;
- **Client din**, ziua în care clientul a fost adăugat sau, pentru o ofertă transformată în client, ziua transformării;
- **Reprezentant legal** și **Persoană de contact**, fiecare cu butonul lui (vezi mai jos).

Denumirea și CUI-ul sunt deasupra tabului, în capul paginii clientului, așa că panoul nu le mai repetă. Le modifici tot de aici: **Modifică datele firmei** deschide pe loc câmpurile firmei, cu denumirea și CUI-ul, numărul din Registrul Comerțului, codul CAEN și sediul social, inclusiv **Caută la ANAF**. Pe telefon butonul se numește doar **Modifică**. Câmpurile, căutarea la ANAF și regulile lor sunt explicate în [Adăugarea și modificarea unui client](/clienti/adaugare-si-modificare/#identificare).

## Reprezentantul legal

Persoana care reprezintă legal firma, de obicei administratorul. Pe rândul **Reprezentant legal** vezi numele, iar dedesubt funcția și, când e legat de un lucrător, „și lucrător al firmei” cu numele lucrătorului, care îi deschide pagina. **Modifică** de pe rând deschide câmpurile lui; cât timp nu are nici nume, nici funcție, butonul se numește **Adaugă**.

Numele și funcția lui se tipăresc în deciziile generate, în alte documente din seturile SSM și SU, cum e fișa obiectivului (7.1), și în actul adițional privind semnarea electronică.

Cât timp lipsește numele sau funcția, seturile de documente SSM și SU nu se pot genera, iar lucrătorii nu pot primi actul adițional în portal. Contractul de prestări servicii le cere și el.

### Numele și prenumele

Așa cum vrei să apară în documente, de exemplu „Ion Popescu”: documentele îl tipăresc exact cum îl scrii. Între 2 și 160 de caractere.

### Funcția

Funcția lui în firmă, de exemplu „Administrator” sau „Director general”. Între 2 și 80 de caractere.

### Administratorul este și lucrător al firmei

Bifează căsuța când reprezentantul legal e și pe lista de lucrători a clientului, ca la o firmă cu un singur om, unde administratorul e și lucrător. Apoi alege-l din listă la **Lucrătorul**.

Cu legătura făcută, documentele îl numesc o singură dată, nu o dată ca administrator și încă o dată ca lucrător. Tot după ea aplicația îl deosebește pe administrator de lucrători, de exemplu când verifică dacă reprezentantul lucrătorilor nu e chiar reprezentantul legal.

Fără legătură, aplicația compară numele, fără să țină cont de litere mari, diacritice sau ordinea cuvintelor. Comparația poate să încurce doi oameni cu același nume, așa că fă legătura când reprezentantul e și lucrător.

Ca să-ți fie mai ușor:

- când bifezi căsuța și un singur lucrător are numele scris la **Nume și prenume**, aplicația îl alege singură;
- când alegi lucrătorul și numele e încă gol, aplicația îl completează din numele lucrătorului.

„Alege lucrătorul din listă sau debifează căsuța.” apare când ai bifat căsuța, dar nu ai ales niciun lucrător.

## Persoana de contact

Omul cu care vorbești la client. Poate fi altcineva decât reprezentantul legal. Pe rândul **Persoană de contact** vezi numele, iar dedesubt emailul și telefonul, pe care le poți folosi direct. **Modifică** de pe rând, sau **Adaugă** cât timp rândul e gol, deschide câmpurile ei. Toate câmpurile sunt opționale: **Nume**, între 2 și 160 de caractere, **Email** și **Telefon**.

Fișa obiectivului din setul SU tipărește telefonul și emailul ca date de contact ale firmei. Dacă persoana de contact e chiar reprezentantul legal, cu același nume, fișa tipărește telefonul și ca telefon de serviciu al administratorului. Contractul de prestări servicii tipărește telefonul.

Persoana de contact nu are acces în portal. Lucrătorii intră în portal cu emailul și telefonul lor, din pagina fiecăruia.

### Emailul

O adresă de email validă, cel mult 254 de caractere. Altfel vezi „Introdu o adresă de email validă.”

### Telefonul

Scrie-l cum vrei să apară pe documente, de exemplu „0721 000 000”. Aplicația nu verifică numărul, doar îi cere între 5 și 20 de caractere; altfel vezi „Telefonul are cel puțin 5 caractere.”

## Notițele

Notițele le văd doar adminii organizației. Aici ții discuțiile, prețurile și pașii următori cu clientul, în cel mult 5000 de caractere. Notițele nu apar în niciun document și nici în portal.

Pe tabul **Detalii** notițele se citesc ca text. **Modifică**, sau **Adaugă** cât timp nu ai scris nimic, deschide câmpul. **Salvează** le păstrează și închide câmpul, iar **Renunță** îl închide fără să schimbe nimic.

Pe pagina unei oferte câmpul notițelor e mereu deschis: scrii direct în el și salvezi cu **Salvează notițele**. Până atunci vezi „Modificări nesalvate”. Un client care a fost întâi ofertă își păstrează notițele de atunci.

## Importurile AI

Cât timp un import al clientului are instrucțiuni proprii sau evaluări de risc pe care nu le-ai confirmat, tabul începe cu ele. Titlul spune câte părți mai ai de verificat și până când, de exemplu „2 părți de verificat până pe 26 noiembrie”: le poți confirma în cele 14 zile de după crearea sau completarea clientului, iar ziua din titlu e prima la care expiră una dintre ele. O parte care încă se citește sau a cărei citire s-a oprit nu intră în număr, fiindcă nu e încă gata de verificat; cât timp nicio parte nu e gata, titlul e „Ce mai ai de făcut până pe …”. Dedesubt vezi importul, cu ziua, cine l-a pornit și câte fișiere a avut, apoi părțile, de exemplu **IPSSM**, **IPSU** sau **Evaluări de risc**, fiecare cu starea ei. **Verifică importul** deschide pagina importului, de unde ajungi la fiecare parte. După ce le confirmi pe toate sau trece termenul, panoul dispare.

Celelalte importuri confirmate sunt la sfârșitul tabului, sub **Importuri AI**, cel mai nou primul: ziua, cine l-a pornit, dacă a creat sau a completat clientul, câte fișiere a avut și cum s-a încheiat, **Încheiat** sau, când a trecut termenul, „Instrucțiunile au expirat” ori „Evaluările au expirat”. Un import cu părți de verificat nu apare și aici, ca să nu-l vezi de două ori. Rândul deschide pagina importului, cu fișierele lui și cu instrucțiunile și evaluările de risc din pachet. Totul despre import e în [După crearea clientului](/clienti/import/#după-crearea-clientului).

## Când documentele cer date de aici

Când generezi documentele, lista datelor lipsă te trimite aici pentru:

- „Numele reprezentantului legal” și „Funcția reprezentantului legal”, la documentele SSM și SU;
- „Datele SU ale locurilor de muncă”, la documentele SU (vezi [Datele SU](/clienti/detalii/puncte-de-lucru/#datele-su));
- numărul din Registrul Comerțului, adresa sediului și reprezentantul legal, la contractul de prestări servicii.

Linkul deschide pe loc câmpurile de completat, cu cursorul în câmpul care lipsește. După salvare, mesajul de confirmare îți oferă **Înapoi la generare** sau **Înapoi la contract**, ca să revii de unde ai plecat.

Despre sediu și punctele de lucru, vezi [Sediul și punctele de lucru](/clienti/detalii/puncte-de-lucru/).
