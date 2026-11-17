---
title: Clienți
description: Lista clienților, ce arată coloanele ei, pagina unui client, arhivarea și reactivarea unui client, și ofertele.
topics:
  - id: clienti.lista
    heading: Lista clienților
  - id: clienti.activi-si-arhivati
    heading: Clienți activi și clienți arhivați
  - id: clienti.documentatie
    heading: Documentația SSM și SU
  - id: clienti.pagina-clientului
    heading: Pagina unui client
  - id: clienti.arhivare
    heading: Arhivarea unui client
  - id: clienti.client-arhivat
    heading: Un client arhivat
  - id: clienti.reactivare
    heading: Reactivarea unui client
sources:
  - docs/architecture/adr-005-document-generation.md
  - docs/architecture/adr-007-leads-and-service-contracts.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-020-fire-safety-from-ten-employees.md
  - packages/contracts/src/clients.ts
  - apps/api/src/modules/clients/handlers.ts
  - apps/api/src/modules/documents/context.ts
  - apps/app/src/routes/_authenticated/clienti/index.tsx
  - apps/app/src/features/clients/client-columns.tsx
  - apps/app/src/features/clients/training-cell.tsx
  - apps/app/src/components/list-filters/list-filters.tsx
  - supabase/migrations/20261118100000_client_list_filters.sql
  - apps/app/src/features/clients/documentation-badge.tsx
  - apps/app/src/features/clients/client-layout.tsx
  - apps/app/src/features/clients/client-archive-dialog.tsx
  - supabase/migrations/20260921110000_archived_client_freeze.sql
  - supabase/migrations/20261010150000_client_list_fire_safety.sql
  - docs/architecture/adr-029-billing-plans-and-trials.md
  - supabase/migrations/20261116200000_offers_on_profesional.sql
  - apps/app/src/features/clients/offers-plan.ts
  - apps/app/src/features/clients/offers-plan-notice.tsx
  - apps/app/src/features/clients/leads-page.tsx
  - apps/app/src/features/clients/lead-columns.tsx
  - packages/contracts/src/legal-forms.ts
---

Un client e o firmă pentru care lucrezi. Pe pagina lui ții tot ce îi privește: datele firmei, lucrătorii, posturile, mijloacele de apărare împotriva incendiilor, instruirile și documentele SSM și SU. Adaugi un client din **Clienți**, cu **Adaugă cu AI**, când pornești din dosarul SSM și SU pe care îl ai deja și AI-ul citește documentele și îți propune datele, sau cu **Adaugă manual**, când completezi tu datele firmei, pornind de la CUI. La primul client, cele două apar ca două căsuțe în mijlocul listei; ce cere formularul găsești în [Adăugarea și modificarea unui client](/clienti/adaugare-si-modificare/).

## Lista clienților

**Clienți** din meniul lateral arată clienții organizației tale. Fiecare rând arată:

- **Companie**: denumirea, cu CUI-ul dedesubt, cu prefixul RO când firma e plătitoare de TVA;
- **Lucrători**: câți lucrători actuali are clientul; foștii lucrători nu intră în număr;
- **Documentație SSM** și **Documentație SU**: cât din fiecare set de documente e emis (vezi [Documentația SSM și SU](#documentația-ssm-și-su));
- **Instruire**: cum stau cu instruirea lucrătorii actuali ai clientului, la SSM și la SU (vezi [Instruirea lucrătorilor în listă](#instruirea-lucrătorilor-în-listă));
- **Următorul termen**: cea mai apropiată zi, de azi înainte, la care un lucrător actual trebuie instruit din nou, la SSM sau la SU. O liniuță înseamnă că nu e niciun termen de azi înainte, de exemplu când toți lucrătorii sunt de instruit;
- **Adăugat**: ziua în care firma a devenit client, adică ziua în care ai adăugat-o sau, dacă a fost întâi ofertă, ziua în care a devenit client.

Lista e ordonată după denumire și împărțită pe pagini. O poți ordona după oricare dintre coloane. Un clic pe rând deschide pagina clientului, la tabul **Detalii**. Din meniul de la capătul rândului ajungi la **Modifică**, care deschide același tab, și, dacă ești admin, la **Arhivează…**.

Deasupra listei vezi câți clienți are. Când cauți sau filtrezi, vezi câți se potrivesc din total, de exemplu „12 din 80 de clienți”.

### Instruirea lucrătorilor în listă

Coloana **Instruire** adună starea instruirii tuturor lucrătorilor actuali ai clientului, la SSM și la SU (vezi [Starea instruirii](/clienti/angajati/#starea-instruirii)):

- în roșu, **de instruit**: câți lucrători sunt neinstruiți sau au instruirea depășită, în cel puțin unul dintre domenii;
- în galben, **scadente**: câți lucrători au instruirea scadentă în următoarele 30 de zile, când niciunul nu e de instruit;
- **La zi**: toți lucrătorii actuali sunt la zi în ambele domenii;
- o liniuță: clientul nu are lucrători actuali, sau e arhivat.

Un clic pe această valoare deschide lista lucrătorilor clientului, filtrată exact pe lucrătorii numărați (vezi [Filtrele](/clienti/angajati/#filtrele)).

Ordonată după **Instruire**, lista arată întâi clienții cu lucrători de instruit, apoi pe cei cu instruiri scadente, apoi pe cei la zi și la sfârșit clienții fără lucrători. Ordonată după **Următorul termen**, clienții fără termen ajung mereu la sfârșit.

### Căutarea și filtrele

Câmpul de căutare găsește clienții după denumire, CUI sau localitate. Nu contează diacriticele și nici forma juridică de la începutul sau de la sfârșitul denumirii, prescurtată sau scrisă în întregime: „SC Alfa SRL” găsește „ALFA S.R.L.”, iar „Societatea Profesională Notarială Popescu” găsește „S.P.N. POPESCU”. CUI-ul îl poți scrie cu sau fără RO și cu spații sau puncte între cifre.

Butonul **Filtre** deschide filtrele listei. Le poți combina; un client apare dacă se potrivește cu cel puțin o valoare aleasă din fiecare filtru:

- **Documentație SSM** și **Documentație SU**: **Negenerată**, **În lucru** sau **Emisă**;
- **Instruire**: **Neinstruiți**, clienții cu cel puțin un lucrător neinstruit; **Depășită**, cu cel puțin un lucrător cu instruirea depășită; **Scadentă în 30 de zile**, cu cel puțin un lucrător cu instruirea scadentă în următoarele 30 de zile; **La zi**, clienții la care toți lucrătorii sunt la zi;
- **Necesită atenție**: **Documente de actualizat**, adică documente de generat din nou, pentru că s-a schimbat modelul lor sau instrucțiunile proprii pe care le citează; **Date de bază lipsă**, adică lipsesc date despre reprezentantul legal, persoanele desemnate sau posturi; **Semnături în așteptare**, de la lucrători; **Teste în așteptare**, ale lucrătorilor care așteaptă testul de la angajare;
- **Județ**: județul sediului; poți alege mai multe;
- **Contract**, doar pentru admini: **Se încheie în 60 de zile**, contractele care nu se prelungesc singure și se încheie în următoarele 60 de zile.

Filtrele alese apar sub câmpul de căutare; scoți unul cu semnul x de lângă el, sau pe toate cu **Șterge filtrele**. Pe telefon, filtrele se deschid într-un panou de jos; le aplici cu butonul care arată câți clienți se potrivesc. Căutarea și filtrele rămân în adresa paginii, așa că le regăsești când revii sau dai înapoi.

La **Arhivați** poți căuta, dar nu și filtra.

Ofertele nu apar aici. Au lista lor, **Oferte**, pe care o văd doar adminii (vezi [Ofertele](#ofertele)).

### Clienți activi și clienți arhivați

Lista arată implicit clienții **Activi**. Un client arhivat trece la **Arhivați**, cu toate datele și documentele lui. Vezi [Arhivarea unui client](#arhivarea-unui-client).

### Documentația SSM și SU

Fiecare dintre cele două coloane arată unde se află un set de documente al clientului:

- **Negenerată**: niciun document din set nu a fost generat încă;
- **În lucru**: o parte din set e generată, dar nu toate documentele care i se aplică clientului sunt emise. Lângă stare vezi câte sunt emise din câte i se aplică, de exemplu „3/12”;
- **Emisă**: toate documentele care i se aplică clientului sunt emise.

Un document se numără ca emis de când are o versiune emisă, chiar dacă i-ai generat între timp o versiune nouă, încă ciornă.

Câte documente i se aplică depinde de client. De exemplu, de la 10 lucrători actuali ambele seturi cer documente în plus (vezi [De ce contează numărul de lucrători](/clienti/angajati/#de-ce-contează-numărul-de-lucrători)). Când clientul ajunge la 10 lucrători, un set **Emisă** poate trece înapoi la **În lucru**.

Poți ordona lista după aceste coloane ca să vezi întâi clienții la care mai ai de lucru.

## Pagina unui client

În capul paginii vezi denumirea clientului, CUI-ul și câți lucrători actuali are. Dedesubt sunt taburile clientului:

- **Detalii**: datele firmei, reprezentantul legal, sediul și punctele de lucru, persoana de contact și, pentru admini, notițele. Vezi [Detalii](/clienti/detalii/);
- **Lucrători**: lucrătorii clientului, cu instruirea și testarea lor. Vezi [Lucrători](/clienti/angajati/);
- **Posturi de lucru**, **Mijloace de apărare**, **Instruire și responsabili** și **Instruiri ținute**: datele din care se întocmesc documentele și evidența instruirilor;
- **Documente SSM** și **Documente SU**: cele două seturi de documente;
- **Contract**: contractul de prestări servicii cu clientul, pe care îl văd doar adminii;
- **Alte documente** și **Portal**.

Documentele se întocmesc din ce completezi în celelalte taburi. Când îți lipsește ceva la generare, lista datelor lipsă te duce la câmpul de completat, pe tabul lui.

## Arhivarea unui client

Arhivezi un client cu care nu mai lucrezi. Doar adminii pot arhiva și reactiva un client. Alege **Arhivează…** din capul paginii clientului sau din meniul rândului din listă, apoi confirmă.

Arhivarea nu șterge nimic. Clientul iese din lista clienților activi, iar lucrătorii, posturile și documentele lui rămân cum erau și le găsești din **Arhivați**.

Dacă unele documente ale clientului sunt încă ciorne, dialogul îți spune câte: „Un document este încă ciornă și nu va mai putea fi emis cât timp clientul este arhivat.” Dacă vrei să le emiți, emite-le înainte să arhivezi clientul.

Un client arhivat își păstrează CUI-ul. Nu poți adăuga un client nou cu același CUI; reactivează-l pe cel arhivat (vezi [CUI folosit deja](/clienti/adaugare-si-modificare/#cui-folosit-deja)).

## Un client arhivat

Pe pagina unui client arhivat vezi „Client arhivat” și „Datele și documentele lui pot fi consultate și descărcate, dar nu modificate.”

Nimic din ce ține de client nu se mai schimbă până la reactivare: nu poți modifica datele lui, adăuga sau modifica lucrători, posturi și puncte de lucru, genera sau emite documente, înregistra instruiri ori trimite invitații în portal. Butoanele acestor acțiuni nu mai apar. Lucrătorii lui nu mai apar nici în lista **Lucrători** din meniul lateral.

Dacă un coleg a arhivat clientul cât timp lucrai la el, la salvare vezi „Clientul este arhivat; datele lui nu mai pot fi modificate.”

## Reactivarea unui client

Un admin reactivează un client cu **Reactivează…**, din capul paginii clientului arhivat sau din meniul rândului din lista **Arhivați**. Clientul revine în lista clienților activi, cu lucrătorii, posturile și documentele lui, și poți lucra din nou la el.

## Ofertele

O ofertă e o firmă cu care discuți și care nu e încă client. Le găsești în **Oferte**, în meniul lateral, pe care îl văd doar adminii. Pe pagina unei oferte ții datele firmei, persoana de contact, notițele, fișierele și contractul de prestări servicii, pe care îl poți trimite firmei. Când firma semnează, o transformi în client cu **Transformă în client…**, cu tot ce ai scris deja despre ea.

### Lista ofertelor

**Oferte** arată ofertele active; cele arhivate sunt la **Arhivate**. Fiecare rând arată:

- **Companie**: denumirea, cu CUI-ul dedesubt, cu prefixul RO când firma e plătitoare de TVA;
- **Persoană de contact**: numele, cu emailul dedesubt sau, dacă nu ai trecut un email, telefonul;
- **Lucrători**: câți lucrători a declarat firma; o liniuță când nu ai trecut numărul;
- **Contract**: unde a ajuns contractul de prestări servicii: **Fără contract**, **Ciornă**, **Emis**, **Trimis**, **Primit** sau **Semnat**. Sub stare vezi ziua în care contractul a ajuns acolo: ziua în care l-ai emis, ziua în care l-ai trimis ultima dată, ziua în care firma a încărcat copia semnată sau ziua în care ai confirmat-o;
- **Adăugat**: ziua în care ai adăugat oferta.

Două lucruri apar în galben, pentru că așteaptă ceva de la tine:

- **Primit**: firma a încărcat copia semnată prin linkul din emailul cu contractul, iar copia așteaptă să o confirmi pe pagina ofertei;
- „link expirat”, lângă data unui contract **Trimis**: linkul din email e valabil 60 de zile de la trimitere, iar după ele firma nu mai poate încărca copia semnată. Trimite contractul din nou ca să primească un link nou.

Lista e ordonată după denumire și împărțită pe pagini. O poți ordona și după **Lucrători**, după **Contract**, în ordinea stărilor de mai sus, și după **Adăugat**. Un clic pe rând deschide oferta. Din meniul de la capătul rândului ajungi la **Modifică**, **Transformă în client…** și **Arhivează…**.

Câmpul de căutare găsește ofertele după denumire, CUI sau localitate, ca la clienți; persoana de contact nu e căutată. Butonul **Filtre** are un singur filtru, **Contract**, cu cele șase stări; poți alege mai multe, iar o ofertă apare dacă are una dintre ele. Când cauți sau filtrezi, vezi câte oferte se potrivesc din total, de exemplu „6 din 18 oferte”. Dacă nu se potrivește niciuna, **Șterge filtrele** scoate filtrele și păstrează căutarea. La **Arhivate** poți căuta, dar nu și filtra.

Ofertele, cu contractele lor, fac parte din planul **Profesional** și din perioada de probă. Pe planul **Start**:

- ofertele de până acum rămân în listă: le deschizi, le citești și descarci contractul și fișierele lor;
- le poți arhiva, reactiva și transforma în clienți, ca până acum;
- nu poți adăuga oferte noi și nu le poți modifica: datele firmei, persoana de contact, notițele, fișierele și contractul rămân cum sunt. Butoanele acestor acțiuni nu mai apar, iar o notă pe pagină îți spune de ce și te duce la [Abonament](/organizatie/abonament/).

Contractul unui client îl lucrezi pe orice plan, pe tabul **Contract**. Și o ofertă transformată în client își are de atunci contractul acolo, unde îl poți modifica, emite și trimite ca pe al oricărui client.
