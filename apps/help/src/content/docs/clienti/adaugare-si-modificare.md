---
title: Adăugarea și modificarea unui client
description: Ce cere formularul clientului, câmp cu câmp, cum preiei datele de la ANAF, ce reguli verifică aplicația și ce faci când refuză să salveze.
topics:
  - id: clienti.adaugare
    heading: Adăugarea unui client
  - id: clienti.identificare
    heading: Identificare
  - id: clienti.cui
    heading: CUI-ul
  - id: clienti.cui-invalid
    heading: CUI invalid
  - id: clienti.cautare-anaf
    heading: Căutarea la ANAF
  - id: clienti.firma-inactiva
    heading: Firmă inactivă
  - id: clienti.denumire
    heading: Denumirea
  - id: clienti.tva
    heading: Plătitor de TVA
  - id: clienti.cui-folosit
    heading: CUI folosit deja
  - id: clienti.inregistrare
    heading: Înregistrare
  - id: clienti.caen
    heading: Codul CAEN
  - id: clienti.registrul-comertului
    heading: Numărul din Registrul Comerțului
  - id: clienti.sediu-social
    heading: Sediul social
  - id: clienti.modificare
    heading: Modificarea datelor
  - id: clienti.salvare-refuzata
    heading: Când nu se salvează
sources:
  - docs/architecture/adr-005-document-generation.md
  - docs/architecture/adr-007-leads-and-service-contracts.md
  - packages/contracts/src/clients.ts
  - packages/contracts/src/cui.ts
  - packages/contracts/src/caen.ts
  - apps/api/src/modules/clients/handlers.ts
  - apps/api/src/modules/companies/anaf.ts
  - apps/api/src/modules/documents/site-sheet.ts
  - apps/api/src/modules/service-contracts/context.ts
  - apps/app/src/features/clients/client-form.tsx
  - apps/app/src/features/clients/client-fields.tsx
  - apps/app/src/features/clients/client-form-schema.ts
  - apps/app/src/features/clients/client-save-error.ts
  - apps/app/src/features/clients/use-client-form.ts
  - apps/app/src/features/clients/use-company-lookup.ts
  - apps/app/src/features/clients/company-card.tsx
  - apps/app/src/features/missing-data/missing-rows.ts
---

Formularul clientului cere doar CUI-ul și denumirea. Restul îl completezi când îl afli, aici sau mai târziu, pe tabul **Detalii** al clientului. Cel mai repede scrii CUI-ul și alegi **Caută la ANAF**: aplicația completează singură datele publice ale firmei.

## Adăugarea unui client

Din **Clienți**, alege **Adaugă client**. Orice membru al organizației poate adăuga un client. Obligatorii sunt:

- **CUI**;
- **Denumire**.

Formularul are cinci secțiuni: **Identificare**, **Înregistrare**, **Sediu social**, **Alte informații**, cu reprezentantul legal, și **Persoană de contact**.

După salvare revii la listă și vezi un mesaj cu numele clientului adăugat. Lista e ordonată și împărțită pe pagini, așa că rândul nou poate fi pe altă pagină.

## Identificare

### CUI-ul

Codul unic de înregistrare al firmei. Îl poți scrie cu sau fără prefixul RO, și cu spații, puncte sau cratime: aplicația păstrează doar cifrele.

Prefixul RO înseamnă că firma e înregistrată în scopuri de TVA. Un CUI scris cu RO o salvează ca plătitoare de TVA, chiar dacă nu ai bifat căsuța **Plătitor de TVA**.

### CUI invalid

„CUI invalid. Verifică cifrele și cifra de control.” apare când:

- după prefixul RO nu urmează doar cifre;
- CUI-ul are mai puțin de 2 sau mai mult de 10 cifre, ori prima cifră e 0;
- ultima cifră, cifra de control, nu se potrivește cu celelalte.

Cifra de control se calculează din celelalte cifre, așa că o cifră greșită sau două cifre inversate o strică aproape mereu. Verifică CUI-ul pe certificatul de înregistrare al firmei sau pe o factură de la ea.

### Căutarea la ANAF

**Caută la ANAF** preia datele publice ale firmei de la ANAF și completează cu ele:

- **Denumire** și **Plătitor de TVA**;
- **Cod CAEN** și **Nr. Registrul Comerțului**;
- **Județ**, **Localitate** și **Adresă**.

Datele de la ANAF înlocuiesc ce era scris în aceste câmpuri, chiar și cu un câmp gol, când ANAF nu are acea informație. Diacriticele cu sedilă din datele ANAF (ş, ţ) devin cele corecte, cu virgulă (ș, ț).

Nimic nu se salvează până nu alegi tu să salvezi. Vezi „Date preluate de la ANAF pentru… Verifică-le înainte de salvare.” și poți corecta orice câmp.

Când căutarea nu reușește, vezi unul dintre mesajele:

- „Introdu un CUI valid înainte de căutare.”: CUI-ul scris nu e valid (vezi [CUI invalid](#cui-invalid));
- „Nu am găsit nicio companie cu acest CUI la ANAF. Completează datele manual.”: ANAF nu are nicio firmă cu acest CUI. Verifică cifrele;
- „Serviciul ANAF nu este disponibil momentan. Completează datele manual.”: serviciul ANAF nu a răspuns. Încearcă mai târziu sau scrie datele de mână.

### Firmă inactivă

„Atenție: compania figurează ca inactivă.” înseamnă că firma e declarată inactivă în evidența ANAF. Aplicația te lasă s-o salvezi: mesajul doar te avertizează. Verifică situația firmei cu clientul înainte să lucrezi pentru ea.

### Denumirea

Numele firmei, așa cum e înregistrat, de exemplu „Exemplu Construct SRL”. Între 2 și 200 de caractere. Denumirea apare în toate documentele clientului.

### Plătitor de TVA

Bifează căsuța dacă firma e înregistrată în scopuri de TVA. Căutarea la ANAF o bifează singură. În aplicație, CUI-ul unei firme plătitoare de TVA apare cu prefixul RO.

### CUI folosit deja

Într-o organizație, un CUI aparține unei singure firme. Dacă îl folosești din nou, vezi sub câmp unul dintre mesajele:

- „Există deja un client cu acest CUI în organizația ta.”: firma e deja în lista clienților. Caut-o acolo;
- „Un client arhivat are deja acest CUI. Îl găsești în lista „Arhivați”, de unde un administrator îl poate restaura.”: firma a fost client și a fost arhivată. Restaureaz-o în loc s-o adaugi din nou (vezi [Restaurarea unui client](/clienti/#restaurarea-unui-client));
- „Firma cu acest CUI este deja printre clienții potențiali ai organizației. Un administrator o poate transforma în client.”: firma e un client potențial. Un administrator o transformă în client din **Clienți potențiali**, cu tot ce s-a scris deja despre ea.

## Înregistrare

### Codul CAEN

Activitatea principală a firmei, ca un cod de patru cifre. Caută după cod sau după cuvinte din denumirea activității, de exemplu „4711” sau „magazin”, și alege din listă. Lista cuprinde clasele CAEN Rev. 3.

Codul CAEN e opțional. Fișa obiectivului din setul PSI îl tipărește la domeniul de activitate, după activitățile punctelor de lucru, iar contractul de prestări servicii îl tipărește cu denumirea activității.

### Numărul din Registrul Comerțului

Numărul de ordine din Registrul Comerțului, de exemplu „J40/1234/2020”. Cel mult 40 de caractere. Fișa obiectivului îl tipărește lângă CUI.

E opțional în formular, dar contractul de prestări servicii îl cere: fără el, nu poți genera contractul.

## Sediul social

Adresa sediului social: **Județ**, din listă, **Localitate**, cel mult 120 de caractere, și **Adresă**, cel mult 240 de caractere. Sunt opționale în formular.

Contractul de prestări servicii cere adresa sediului: județul, localitatea și adresa. Fișa obiectivului o tipărește ca adresă a firmei. Dacă adresa lipsește, fișa folosește adresa punctului de lucru marcat ca sediu social.

Sediul social e și un punct de lucru, pe care îl adaugi separat, pe tabul **Detalii**. Aplicația te anunță când cele două adrese diferă (vezi [Când adresa sediului diferă](/clienti/detalii/puncte-de-lucru/#când-adresa-sediului-diferă)).

## Reprezentantul legal și persoana de contact

Numele reprezentantului legal îl poți scrie de la început, în **Alte informații**. Funcția lui și legătura cu angajații clientului le completezi apoi pe tabul **Detalii**. Vezi [Reprezentantul legal](/clienti/detalii/#reprezentantul-legal) și [Persoana de contact](/clienti/detalii/#persoana-de-contact).

## Modificarea datelor

Un client îl modifici pe tabul **Detalii**, card cu card. **Modifică** de pe cardul **Date firmă** deschide pe loc câmpurile din **Identificare**, **Înregistrare** și **Sediu social**, inclusiv **Caută la ANAF**. **Salvează** devine activ după ce schimbi ceva.

Documentele deja generate nu se schimbă când modifici datele clientului: fiecare păstrează datele din ziua generării. Ca să apară datele noi, generează documentul din nou.

## Când nu se salvează

Când un câmp nu e bun, mesajul apare sub el și pagina te duce la primul câmp greșit. Celelalte mesaje apar sub formular:

- „Clientul este arhivat; datele lui nu mai pot fi modificate.”: clientul a fost arhivat între timp;
- „Clientul nu mai există în organizația ta.”: reîncarcă lista clienților;
- „Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.”;
- „Nu am putut salva clientul. Verifică conexiunea și încearcă din nou.”: salvarea nu a ajuns la aplicație. Ce ai scris rămâne în formular, așa că încearcă din nou.
