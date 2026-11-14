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
  - id: organizatie.trepte
    heading: Treptele de lucrători și utilizatorii
  - id: organizatie.consum
    heading: Cât folosești
  - id: organizatie.credite
    heading: Creditele AI
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
  - apps/api/src/modules/sms-usage/notices.ts
  - apps/mail/src/emails/sms-usage-notice.tsx
  - apps/app/src/features/subscription/*.tsx
  - apps/app/src/features/subscription/sms-copy.ts
  - apps/api/src/modules/sms-usage/policy.ts
  - apps/app/src/features/subscription/credits-copy.ts
  - apps/api/src/modules/credits/policy.ts
  - docs/architecture/adr-030-import-from-documents.md
  - apps/app/src/features/subscription/checkout/*.tsx
---

Abonamentul e al organizației, nu al unei persoane. Îl alege, îl schimbă și îl anulează adminul organizației; colegii văd planul și cât folosiți, fără sume și fără butoane.

## Pagina Abonament

O găsești în **Organizație**, la tabul **Abonament**, după **Abilitări**. Ajungi tot aici din insigna planului, de lângă sigla din capul paginii (pe telefon, din meniu, la **Abonament**, deasupra contului tău), și din banda care apare deasupra paginii când perioada de probă se apropie de sfârșit, când o plată nu a reușit sau când ai folosit 80 % din codurile de semnare prin SMS ale lunii (vezi [Cât folosești](#cât-folosești)).

Pagina are trei părți:

- **planul**: numele lui, treapta de lucrători, dacă e lunar sau anual, starea și următoarea plată, plus TVA;
- **Cât folosești**: lucrătorii, utilizatorii, codurile de semnare prin SMS și creditele AI, față de cât include planul (vezi [Cât folosești](#cât-folosești));
- **Plată și facturi**: cardul, adresa la care pleacă facturile și lista facturilor (vezi [Plata și facturile](#plata-și-facturile)).

Prețurile din aplicație sunt fără TVA, la care se adaugă TVA de 21 %. Totalurile arată și suma cu TVA.

## Perioada de probă

Un cont nou începe cu 14 zile de probă, fără card. În acest timp ai tot ce include **Profesional**: până la 5.000 de lucrători la clienți și 10 utilizatori, plus 300 de credite AI pentru toată perioada de probă (vezi [Creditele AI](#creditele-ai)). Singura diferență: în perioada de probă nu se trimit SMS-uri. Codurile de conectare și de semnare pleacă pe email, iar un lucrător fără adresă de email nu poate fi invitat până alegi un plan.

Insigna planului arată câte zile mai ai. În ultima săptămână apare și o bandă deasupra paginii, pe care o poți închide până a doua zi; în ultima zi nu se mai închide.

Poți alege un plan oricând în perioada de probă, fără să pierzi zilele rămase: cardul se salvează atunci, dar prima plată se face abia în ziua în care s-ar fi încheiat proba. Până atunci lucrezi exact ca înainte, cu limitele probei, iar SMS-urile pornesc din ziua în care ai ales planul. Până la prima plată, codurile de semnare prin SMS se opresc la cât include treapta aleasă, de exemplu 50 la 250 de lucrători. Din acel moment insigna arată numele planului ales, iar banda nu mai apare. Dacă alegi în ultima oră a probei, prima plată se face pe loc.

Dacă banca nu a confirmat cardul, pagina **Abonament** îți spune că nu e salvat: fără card, prima plată nu reușește. **Adaugă cardul** deschide din nou formularul cardului, cu planul ales.

Dacă proba se încheie fără un plan, contul rămâne 30 de zile doar pentru citire (vezi [Contul doar pentru citire](#contul-doar-pentru-citire)).

## Alegerea planului

Apasă **Alege un plan**. Pe pagina care se deschide:

1. Alegi perioada de plată: **Lunar** sau **Anual**. Pe an, o lună costă zece douăsprezecimi din prețul lunar, rotunjit în jos la euro întreg: două luni gratuite.
2. Alegi câți lucrători au clienții tăi, cu butoanele minus și plus de lângă **Lucrători la clienții tăi** (vezi mai jos).
3. Alegi planul: **Start** sau **Profesional**. Fiecare card arată prețul la treapta aleasă și ce include.
4. Completezi cardul. Poți plăti și cu Apple Pay sau Google Pay, dacă telefonul sau browserul tău le are.

În dreapta, **Rezumat** arată prețul pe lună sau pe an, TVA-ul și totalul, iar dedesubt ce se întâmplă azi: în perioada de probă, „Azi nu plătești nimic” și data primei plăți; altfel, suma pe care o plătești azi.

Banca îți poate cere să confirmi plata în aplicația ei sau printr-un cod. Fereastra băncii apare peste pagină; după confirmare, te întorci la pagina **Abonament**. Dacă banca refuză cardul, mesajul apare deasupra butonului și poți încerca alt card.

Uneori plata are nevoie de un minut până apare abonamentul. Atunci pagina îți spune că plata se procesează; nu alege din nou un plan. Dacă o faci totuși, nu plătești a doua oară: aplicația găsește abonamentul deja plătit și te duce la el.

Factura are nevoie de denumirea și de CUI-ul organizației. Dacă lipsesc, completează-le în **Organizație**, la **Date firmă**, apoi revino.

**Enterprise** nu se alege din aplicație. Pentru peste 5.000 de lucrători sau peste 10 utilizatori, scrie-ne la contact@ssmusor.ro și îți trimitem o ofertă.

### Treptele de lucrători și utilizatorii

Prețul depinde de treapta de lucrători: cel mai mare număr de lucrători pe care îl acoperă, la clienții activi, în total. Prețurile sunt fără TVA:

- **Start**, cu 3 utilizatori: până la 250 de lucrători, 39 € pe lună; până la 500, 59 €; până la 750, 79 €;
- **Profesional**, cu 10 utilizatori: până la 500 de lucrători, 89 € pe lună; până la 1.000, 119 €; până la 1.500, 149 €; până la 2.000, 179 €; până la 3.000, 239 €; până la 4.000, 299 €; până la 5.000, 359 €.

Fiecare treaptă include în fiecare lună un cod de semnare prin SMS la 5 lucrători și 2 credite AI la fiecare lucrător, plus 250: la 500 de lucrători, 100 de coduri SMS și 1.250 de credite AI. La prima plată primești, o singură dată, 10 credite AI de bun venit pentru fiecare lucrător al treptei, cel mult 10.000.

Utilizatorii nu se cumpără separat: Start are 3, Profesional 10, cu tine cu tot.

Aplicația nu te lasă să alegi o treaptă sub câți lucrători ai azi: dacă ai 312 lucrători, treapta cea mai mică e de 500. **Start** nu se poate alege dacă ai peste 750 de lucrători sau peste 3 utilizatori; cardul planului spune de ce.

## Cât folosești

Se numără:

- **lucrătorii la clienți**: lucrătorii actuali ai clienților activi, față de treapta ta. Foștii lucrători, ofertele și clienții arhivați nu intră în număr;
- **utilizatorii**: membrii organizației, cu tine cu tot. O invitație trimisă și neacceptată ține și ea un loc, iar sub bară scrie câte sunt în așteptare: pe Start, cu 3 utilizatori, nu poți trimite o invitație dacă sunteți 2 și mai e una în așteptare. Dacă alegi Start în perioada de probă, numărul lui de utilizatori contează de atunci. Când nu mai e loc, poți revoca o invitație sau, de pe Start, poți trece pe Profesional;
- **codurile de semnare prin SMS**: câte au plecat luna aceasta, față de cât include treapta, de exemplu „252 din 300”. Luna e a abonamentului: începe în ziua în care se reînnoiește, de exemplu de pe 14.10 până pe 13.11, și pe un plan anual. Invitațiile în portal, codurile de conectare și anunțurile că sunt instruiri de semnat pleacă și ele prin SMS, dar nu se numără. În perioada de probă, fără un plan ales, rândul nu are bară: spune doar că totul pleacă pe email.

Dacă treci de treapta ta, lucrezi mai departe cu tot ce ai. Pagina îți spune cu câți ai trecut și îți propune treapta următoare, cu **Treci pe treapta următoare**. Dacă după o lună ai tot mai mulți lucrători decât treapta, treci pe treapta următoare sau arhivează clienții cu care nu mai lucrezi.

Când ai folosit toate codurile de semnare prin SMS ale lunii, nu plătești nimic în plus: până la luna următoare, codurile pleacă pe email, iar un lucrător fără email nu le mai primește prin SMS.

Adminul organizației primește un email când au plecat 80 % din codurile incluse în lună și când au plecat toate, fiecare o singură dată pe lună. Emailul de la 100 % spune că, până la luna următoare, codurile nu mai pleacă prin SMS. Un lucrător fără email care cere atunci un cod de semnare vede în portal că trebuie să vorbească cu specialistul SSM; dacă îi adaugi o adresă de email, codul îi vine pe email și semnează pe loc.

SMS-urile pleacă doar la numere din România (+40). Un lucrător cu un număr din altă țară se invită pe email.

Bara codurilor de semnare își schimbă culoarea doar când e ceva de știut:

- **de la 80 %** devine galbenă, iar textul de sub ea spune câte mai ai incluse și până când;
- **când s-au folosit toate** devine roșie: până la reînnoire, codurile pleacă pe email, iar cine nu are email nu poate semna.

Din 80 %, o bandă galbenă deasupra paginii le spune tuturor membrilor câte coduri s-au folosit, cu **Vezi consumul**. La 80 % o poți închide până a doua zi. Când s-au folosit toate, banda devine roșie, spune că codurile de semnare nu mai pleacă prin SMS și rămâne până la reînnoire. Cât timp apare banda perioadei de probă sau a unei plăți nereușite, banda SMS-urilor așteaptă după ea. Fereastra insignei planului arată și ea codurile lunii, iar când s-au oprit, insigna primește un punct.

### Creditele AI

Cu creditele AI, inteligența artificială citește documentația și fișele pe care le ai deja, iar tu verifici ce a citit înainte să se salveze. Documentele unui client folosesc 25 de credite AI, plus unul pentru fiecare pagină scanată; un document scris pe calculator, cum e unul din Word, intră în cele 25. Fiecare fotografie a unei fișe folosește unul.

Câte credite AI ai:

- **în perioada de probă**: 300 pentru toată perioada, care nu se reînnoiesc. Dacă alegi un plan în perioada de probă, păstrezi cele 300 până la prima plată;
- **pe un plan**: în fiecare lună, 2 pentru fiecare lucrător al treptei, plus 250. De exemplu 750 la 250 de lucrători, 3.250 la 1.500.

Creditele AI ale lunii se reînnoiesc în ziua în care se reînnoiește abonamentul, iar cele nefolosite nu se adună.

La prima plată primești, o singură dată, **credite AI de bun venit**, ca să-ți muți clienții: 10 pentru fiecare lucrător al treptei, cel mult 10.000. Nu expiră și se folosesc după creditele lunii. Dacă treci pe o treaptă mai mare sau pe Profesional după ce le-ai primit, primești diferența. Pe pagina **Abonament**, sub bare, un panou arată câte credite de bun venit mai ai; înainte de prima plată, panoul îți spune câte primești și când.

Bara creditelor se colorează la fel ca a codurilor SMS:

- **când mai ai puține**, sub o cincime din cele ale lunii, cu cele de bun venit cu tot, devine galbenă și îți spune câte mai ai;
- **când s-au terminat**, devine roșie: importurile noi așteaptă reînnoirea și nu plătești nimic în plus;
- **sub zero**: un import care găsește mai multe pagini scanate decât credite merge până la capăt, iar ce lipsește se scade din luna următoare, de exemplu „−4 · se scad din luna viitoare”. Soldul nu coboară sub −150. Până la reînnoire nu poți porni un import nou.

Dacă un import nu reușește, creditele lui se întorc; nu se întorc pentru un import citit și lăsat apoi neterminat. Unui cont de test îi dăm 1.500 de credite AI pe lună, fără credite de bun venit; la 1.500, importurile se opresc până la reînnoire.

Insigna planului arată și ea creditele lunii și pe cele de bun venit rămase.

## Schimbarea planului

Din pagina **Abonament**:

- **Schimbă planul sau treapta** deschide aceeași pagină ca la alegere, fără card. După ce alegi, **Continuă** îți arată exact ce se schimbă și cât costă, înainte să confirmi;
- **Treci la plata anuală** sau **Treci la plata lunară** schimbă doar perioada.

Ce se întâmplă depinde de schimbare:

- **o treaptă mai mare sau trecerea de la Start la Profesional** se aplică pe loc. Pe un plan lunar, diferența pentru zilele rămase apare pe factura următoare; pe unul anual se plătește pe loc. Ce aveai înainte se scade pentru partea nefolosită. Codurile SMS și creditele AI ale treptei noi le ai de azi, pentru luna în curs;
- **o treaptă mai mică sau trecerea de la Profesional la Start** se aplică de la următoarea reînnoire și nu costă nimic azi. Până atunci păstrezi ce ai plătit, iar banii nu se returnează. Treapta nu poate fi sub câți lucrători ai azi;
- **de la lunar la anual** se aplică pe loc: plătești anul, din care se scade partea nefolosită din luna curentă;
- **de la anual la lunar** se aplică la sfârșitul anului plătit.

Pe un plan anual, cât timp plata pentru o schimbare se confirmă la bancă, o schimbare pentru reînnoire așteaptă: o faci după ce plata a reușit.

Ofertele, cu contractele lor, fac parte din Profesional. După trecerea la Start, ofertele de până acum rămân de citit și de descărcat și le poți transforma în clienți, dar nu mai poți adăuga altele și nu le mai poți modifica (vezi [Ofertele](/clienti/#ofertele)).

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

Colegii care nu sunt admini văd tabul **Abonament** cu planul, starea lui și cât folosiți, plus prețurile planurilor. Nu văd sumele organizației, cardul sau facturile, și nu pot schimba nimic. Văd și banda codurilor de semnare prin SMS. Dacă aveți nevoie de o treaptă cu mai mulți lucrători sau de mai mulți utilizatori, adminul schimbă planul din pagina lui.
