---
title: Abonamentul
description: Perioada de probă, alegerea și schimbarea planului, plata cu cardul, facturile, anularea și ce se întâmplă cu contul după aceea.
topics:
  - id: organizatie.abonament
    heading: Pagina Abonament
  - id: organizatie.perioada-de-proba
    heading: Perioada de probă
  - id: organizatie.alegerea-planului
    heading: Alegerea planului
  - id: organizatie.pachete
    heading: Pachetele de angajați și utilizatorii în plus
  - id: organizatie.consum
    heading: Cât folosești
  - id: organizatie.limita-sms
    heading: Limita de siguranță pentru SMS
  - id: organizatie.credite
    heading: Creditele pentru import
  - id: organizatie.schimbarea-planului
    heading: Schimbarea planului
  - id: organizatie.plata-si-facturi
    heading: Plata și facturile
  - id: organizatie.plata-nereusita
    heading: Când plata nu reușește
  - id: organizatie.anulare
    heading: Anularea abonamentului
  - id: organizatie.doar-citire
    heading: Contul doar pentru citire
  - id: organizatie.colegii
    heading: Ce văd colegii
sources:
  - docs/architecture/adr-029-billing-plans-and-trials.md
  - packages/contracts/src/billing.ts
  - packages/contracts/src/subscriptions.ts
  - apps/api/src/modules/billing/service.ts
  - apps/api/src/modules/billing/rules.ts
  - apps/app/src/features/subscription/*.tsx
  - apps/app/src/features/subscription/sms-copy.ts
  - apps/api/src/modules/sms-usage/policy.ts
  - apps/app/src/features/subscription/credits-copy.ts
  - apps/api/src/modules/credits/policy.ts
  - docs/architecture/adr-030-import-from-documents.md
  - apps/app/src/features/subscription/checkout/*.tsx
---

Abonamentul e al organizației, nu al unei persoane. Îl alege, îl schimbă și îl anulează administratorul organizației; colegii văd planul și cât folosiți, fără sume și fără butoane.

## Pagina Abonament

O găsești în **Organizație**, la tabul **Abonament**, după **Abilitări**. Ajungi tot aici din insigna planului, de lângă sigla din capul paginii (pe telefon, din meniu, la **Abonament**, deasupra contului tău), și din banda care apare deasupra paginii când perioada de probă se apropie de sfârșit, când o plată nu a reușit sau când ai folosit 80 % din codurile de semnare prin SMS ale lunii (vezi [Cât folosești](#cât-folosești)).

Pagina are trei părți:

- **planul**: numele lui, dacă e lunar sau anual, starea și următoarea plată, cu prețul defalcat pe plan, pachete și utilizatori, plus TVA;
- **Cât folosești**: angajații, utilizatorii, codurile de semnare prin SMS și creditele pentru import, față de cât include planul (vezi [Cât folosești](#cât-folosești));
- **Plată și facturi**: cardul, adresa la care pleacă facturile și lista facturilor (vezi [Plata și facturile](#plata-și-facturile)).

Prețurile din aplicație sunt fără TVA, la care se adaugă TVA de 21 %. Totalurile arată și suma cu TVA.

## Perioada de probă

Un cont nou începe cu 30 de zile de probă, fără card. În acest timp ai tot ce include **Profesional**: 1.500 de angajați la clienți și 3 utilizatori, plus 300 de credite pentru import pentru toată perioada de probă (vezi [Creditele pentru import](#creditele-pentru-import)). Singura diferență: în perioada de probă nu se trimit SMS-uri. Codurile de conectare și de semnare pleacă pe email, iar un angajat fără adresă de email nu poate fi invitat până alegi un plan.

Insigna planului arată câte zile mai ai. În ultima săptămână apare și o bandă deasupra paginii, pe care o poți închide până a doua zi; în ultima zi nu se mai închide.

Poți alege un plan oricând în perioada de probă, fără să pierzi zilele rămase: cardul se salvează atunci, dar prima plată se face abia în ziua în care s-ar fi încheiat proba. Până atunci lucrezi exact ca înainte, cu limitele probei, iar SMS-urile pornesc din ziua în care ai ales planul. Până la prima plată, codurile de semnare prin SMS se opresc la cât include planul ales, 50 pe Start și 300 pe Profesional; cele în plus pornesc abia după prima plată. Din acel moment insigna arată numele planului ales, iar banda nu mai apare. Dacă alegi în ultima oră a probei, prima plată se face pe loc.

Dacă banca nu a confirmat cardul, pagina **Abonament** îți spune că nu e salvat: fără card, prima plată nu reușește. **Adaugă cardul** deschide din nou formularul cardului, cu planul ales.

Dacă proba se încheie fără un plan, contul rămâne 30 de zile doar pentru citire (vezi [Contul doar pentru citire](#contul-doar-pentru-citire)).

## Alegerea planului

Apasă **Alege un plan**. Pe pagina care se deschide:

1. Alegi perioada de plată: **Lunar** sau **Anual**. Pe an plătești 10 luni din 12.
2. Alegi planul: **Start** sau **Profesional**. Fiecare card arată ce include.
3. Alegi câte pachete de angajați și câți utilizatori în plus vrei (vezi mai jos).
4. Completezi cardul. Poți plăti și cu Apple Pay sau Google Pay, dacă telefonul sau browserul tău le are.

În dreapta, **Rezumat** arată prețul pe lună sau pe an, TVA-ul și totalul, iar dedesubt ce se întâmplă azi: în perioada de probă, „Azi nu plătești nimic” și data primei plăți; altfel, suma pe care o plătești azi.

Banca îți poate cere să confirmi plata în aplicația ei sau printr-un cod. Fereastra băncii apare peste pagină; după confirmare, te întorci la pagina **Abonament**. Dacă banca refuză cardul, mesajul apare deasupra butonului și poți încerca alt card.

Uneori plata are nevoie de un minut până apare abonamentul. Atunci pagina îți spune că plata se procesează; nu alege din nou un plan. Dacă o faci totuși, nu plătești a doua oară: aplicația găsește abonamentul deja plătit și te duce la el.

Factura are nevoie de denumirea și de CUI-ul organizației. Dacă lipsesc, completează-le în **Organizație**, la **Date firmă**, apoi revino.

**Enterprise** nu se alege din aplicație. Pentru peste 1.500 de angajați sau o echipă mare, scrie-ne la contact@ssmusor.ro și îți trimitem o ofertă.

### Pachetele de angajați și utilizatorii în plus

**Start** include 250 de angajați la clienți și un utilizator. Peste 250 adaugi pachete de câte 50 de angajați, până la 600 în total, și cel mult încă un utilizator.

**Profesional** include 1.500 de angajați și 3 utilizatori. Peste 1.500 adaugi pachete de câte 500 de angajați, iar utilizatori în plus câți îți trebuie.

Aplicația nu te lasă să alegi mai puține pachete sau utilizatori decât ai azi: dacă ai 312 angajați, Start cere cel puțin 2 pachete. **Start** nu se poate alege deloc dacă ai peste 600 de angajați sau peste 2 utilizatori; cardul planului spune de ce.

## Cât folosești

Se numără:

- **angajații la clienți**: angajații actuali ai clienților activi. Foștii angajați, clienții potențiali și clienții arhivați nu intră în număr. Liniile albe din bară arată unde se termină ce include planul și fiecare pachet;
- **utilizatorii**: membrii organizației, cu tine cu tot;
- **codurile de semnare prin SMS**: câte au plecat luna aceasta, față de cât include planul: 50 pe Start, 300 pe Profesional, de exemplu „252 din 300”. Luna e a abonamentului: începe în ziua în care se reînnoiește, de exemplu de pe 14.10 până pe 13.11, și pe un plan anual. Invitațiile în portal, codurile de conectare și anunțurile că sunt instruiri de semnat pleacă și ele prin SMS, dar nu se numără. În perioada de probă, fără un plan ales, rândul nu are bară: spune doar că totul pleacă pe email.

Dacă treci de limita de angajați, lucrezi mai departe cu tot ce ai. Pagina îți spune cu câți ai trecut și îți propune pachetul care îți lipsește. Peste cele incluse, codurile de semnare prin SMS pleacă mai departe: fiecare costă 0,10 € și apare pe factura următoare; pe un plan anual, se plătesc lunar. Ca factura să nu crească fără margini, se opresc la de trei ori cât include planul, adică 150 pe Start și 900 pe Profesional. De acolo, până la luna următoare, un angajat fără email nu mai primește codul de semnare prin SMS.

SMS-urile pleacă doar la numere din România (+40). Un angajat cu un număr din altă țară se invită pe email.

Bara codurilor de semnare își schimbă culoarea doar când e ceva de știut:

- **de la 80 %** devine galbenă, iar textul de sub ea spune câte mai ai incluse și până când;
- **peste cele incluse** rămâne galbenă. Administratorul vede câte au trecut de cele incluse și prețul lor, de exemplu „+42 peste cele incluse, 0,10 € fiecare, pe factura din 14.11”; colegii văd doar câte au trecut;
- **la limita de siguranță** devine roșie: codurile pleacă pe email până la reînnoire, iar cine nu are email nu poate semna. Administratorul vede suma codurilor de peste plan și butonul **Ridică limita** (vezi [Limita de siguranță pentru SMS](#limita-de-siguranță-pentru-sms));
- **la o oprire fermă**, într-un cont de test sau înainte de prima plată, devine roșie când s-au folosit toate codurile: până la reînnoire, codurile pleacă pe email.

Din 80 %, o bandă galbenă deasupra paginii le spune tuturor membrilor câte coduri s-au folosit, cu **Vezi consumul**. La 80 % o poți închide până a doua zi. Peste cele incluse nu se mai închide și rămâne până la reînnoire. La limita de siguranță sau la o oprire fermă banda devine roșie și spune că codurile de semnare nu mai pleacă prin SMS; la limita de siguranță, administratorul are acolo **Ridică limita**. Cât timp apare banda perioadei de probă sau a unei plăți nereușite, banda SMS-urilor așteaptă după ea. Fereastra insignei planului arată și ea codurile lunii, iar când s-au oprit, insigna primește un punct.

### Creditele pentru import

Importul clienților din documente și al angajaților din fișe se plătește în credite. Un credit e o pagină scanată sau o fotografie citită la import. Documentele unui client costă 25 de credite, plus câte unul pentru fiecare pagină scanată; un document scris pe calculator, cum e unul din Word, intră în cele 25.

Câte credite ai:

- **în perioada de probă**: 300 pentru toată perioada, care nu se reînnoiesc. Dacă alegi un plan în perioada de probă, păstrezi cele 300 până la prima plată;
- **pe Start**: 300 pe lună, cam cât pentru 12 clienți sau 40 de angajați;
- **pe Profesional**: 1.500 pe lună, cam cât pentru 60 de clienți sau 200 de angajați.

Creditele lunii se reînnoiesc în ziua în care se reînnoiește abonamentul, iar cele nefolosite nu se adună.

La prima plată primești, o singură dată, **credite de bun venit**, ca să-ți muți clienții: 2.500 pe Start și 10.000 pe Profesional. Nu expiră și se folosesc după creditele lunii. Dacă treci de la Start la Profesional după ce le-ai primit, primești diferența, 7.500. Pe pagina **Abonament**, sub bare, un panou arată câte credite de bun venit mai ai; înainte de prima plată, panoul îți spune câte primești și când.

Bara creditelor se colorează la fel ca a codurilor SMS:

- **când mai ai puține**, sub o cincime din cele ale lunii, cu cele de bun venit cu tot, devine galbenă și îți spune câte mai ai;
- **când s-au terminat**, devine roșie: nu poți porni un import nou până la reînnoire. Dacă ai nevoie mai devreme, scrie-ne la contact@ssmusor.ro și îți adăugăm credite;
- **sub zero**: un import care găsește mai multe pagini scanate decât credite merge până la capăt, iar ce lipsește se scade din luna următoare, de exemplu „−4 · se scad din luna viitoare”. Soldul nu coboară sub −150. Până la reînnoire nu poți porni un import nou.

Dacă un import nu reușește, creditele lui se întorc; nu se întorc pentru un import citit și lăsat apoi neterminat. Unui cont de test îi dăm 1.500 de credite pe lună, fără credite de bun venit; la 1.500, importurile se opresc până la reînnoire.

Insigna planului arată și ea creditele lunii și pe cele de bun venit rămase.

### Limita de siguranță pentru SMS

Limita oprește codurile de semnare trimise prin SMS după un anumit număr pe lună, ca o lună neobișnuită să nu coste mai mult decât ai hotărât. Din start e de trei ori cât include planul: 150 pe Start și 900 pe Profesional.

Administratorul o schimbă cu **Ridică limita**, de sub bara codurilor sau din banda de deasupra paginii, când limita e atinsă. În fereastra care se deschide alegi limita nouă, de la de trei până la de douăzeci de ori cât include planul, iar fereastra îți spune ce înseamnă: câte coduri pe lună și cât pot costa cel mult cele de peste plan, fără TVA. Limita rămâne așa până o schimbi din nou; o poți și coborî. Dacă luna aceasta s-au trimis deja mai multe coduri decât limita aleasă, fereastra îți spune că până la reînnoire codurile pleacă tot pe email.

## Schimbarea planului

Din pagina **Abonament**:

- **Schimbă planul sau pachetele** deschide aceeași pagină ca la alegere, fără card. După ce alegi, **Continuă** îți arată exact ce se schimbă și cât costă, înainte să confirmi;
- **Treci la plata anuală** sau **Treci la plata lunară** schimbă doar perioada.

Ce se întâmplă depinde de schimbare:

- **trecerea de la Start la Profesional, un pachet sau un utilizator în plus** se aplică pe loc. Pe un plan lunar, diferența pentru zilele rămase apare pe factura următoare; pe unul anual se plătește pe loc. Ce aveai înainte se scade pentru partea nefolosită, iar la trecerea pe Profesional pachetele și utilizatorii în plus pe care nu îi mai folosești se opresc odată cu ea;
- **trecerea de la Profesional la Start, mai puține pachete sau utilizatori** se aplică de la următoarea reînnoire și nu costă nimic azi. Până atunci păstrezi ce ai plătit, iar banii nu se returnează. Trecerea la Start adaugă pachetele de care au nevoie angajații de azi, iar fereastra de confirmare ți le arată;
- **de la lunar la anual** se aplică pe loc: plătești anul, din care se scade partea nefolosită din luna curentă;
- **de la anual la lunar** se aplică la sfârșitul anului plătit.

Dacă într-o singură schimbare adaugi ceva și scoți altceva, de exemplu un pachet în plus și un utilizator în minus, pe un plan lunar ce adaugi se aplică pe loc, cu diferența pe factura următoare, iar ce scoți de la reînnoire; fereastra de confirmare le arată pe amândouă. Pe un plan anual le faci pe rând: întâi adaugi și plătești, apoi scoți ce nu mai îți trebuie.

O schimbare programată pentru reînnoire apare pe pagină, cu data ei. O poți retrage cu **Renunță la schimbare**.

În perioada de probă, orice schimbare se aplică pe loc și nu costă nimic; prima plată rămâne în ziua în care se încheie proba.

## Plata și facturile

**Schimbă cardul** deschide o pagină sigură a procesatorului de plăți, unde înlocuiești cardul. Când termini, te întorci în aplicație. Datele cardului nu ajung niciodată la noi.

**Email pentru facturi** e opțional. Dacă îl completezi, de exemplu cu adresa contabilității, facturile pleacă acolo. Dacă îl lași gol, pleacă la adresa ta.

Fiecare factură vine pe email după ce plata a reușit și apare și în lista **Facturi**, de unde o descarci cu **Descarcă PDF**. O factură abia emisă poate arăta câteva minute **PDF în curând**, până e gata documentul.

## Când plata nu reușește

Dacă banca refuză o plată de reînnoire, pagina arată cardul refuzat, iar insigna planului primește un punct. Reîncercăm plata automat în zilele următoare. Ai acces complet încă 14 zile de la prima plată nereușită; data apare pe pagină.

Cel mai repede rezolvi cu **Schimbă cardul**: când salvezi un card nou, plata restantă se reîncearcă pe loc. Dacă plata nu reușește în cele 14 zile, contul devine doar pentru citire.

## Anularea abonamentului

**Anulează abonamentul** deschide o fereastră care îți arată ce urmează:

1. până la sfârșitul perioadei plătite lucrezi ca acum;
2. apoi, timp de 30 de zile, contul e doar pentru citire;
3. după aceea, datele organizației se șterg definitiv.

Poți spune, dacă vrei, de ce pleci. Ce ai plătit nu se returnează, nici pe un plan lunar, nici pe unul anual. Până la sfârșitul perioadei plătite te poți răzgândi cu **Reactivează**, iar abonamentul se reînnoiește din nou ca înainte.

O schimbare programată pentru reînnoire se anulează odată cu abonamentul, iar fereastra de anulare îți spune asta. Dacă reactivezi, o alegi din nou.

Dacă anulezi cât timp o plată e restantă, accesul complet se încheie la data până la care se reîncearcă plata, iar pagina arată abonamentul ca anulat, cu **Reactivează**.

Dacă ai ales un plan în perioada de probă și renunți la el înainte de prima plată, nu plătești nimic și rămâi în perioada de probă până la data ei de sfârșit.

## Contul doar pentru citire

Contul devine doar pentru citire când proba se încheie fără un plan, când se încheie un abonament anulat sau după 14 zile de plată nereușită. Tu, colegii și clienții vedeți și descărcați tot, dar nimeni nu mai poate schimba nimic. Nu se mai trimit SMS-uri. Pagina **Abonament** arată data la care se șterg datele.

Pagina **Abonament** funcționează și în acest timp. Cu **Alege un plan** sau **Reactivează abonamentul** plătești pe loc și contul revine imediat la acces complet, cu tot ce aveai. Dacă o plată de reînnoire e cea care nu a reușit, folosește **Schimbă cardul**: plata se reîncearcă, iar după ce reușește contul revine la acces complet.

## Ce văd colegii

Colegii care nu sunt administratori văd tabul **Abonament** cu planul, starea lui și cât folosiți, plus prețurile planurilor. Nu văd sumele organizației, cardul sau facturile, și nu pot schimba nimic. Văd și banda codurilor de semnare prin SMS, fără prețuri; la limita de siguranță, banda le spune că administratorul poate ridica limita. Dacă aveți nevoie de mai mulți angajați sau de un coleg în plus, administratorul adaugă din pagina lui.
