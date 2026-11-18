---
title: Echipa
description: Membrii organizației și invitațiile, rolurile de admin și specialist, ultima activitate a colegilor și câți utilizatori include planul.
topics:
  - id: organizatie.echipa
    heading: Tabelul echipei
  - id: organizatie.roluri
    heading: Rolurile
sources:
  - docs/architecture/adr-003-organization-invitations.md
  - apps/api/src/modules/invitations/handlers.ts
  - apps/api/src/modules/organization/handlers.ts
  - supabase/migrations/20261119140000_member_last_activity.sql
  - apps/app/src/features/subscription/member-seats.ts
  - apps/app/src/features/organization/team-card.tsx
  - apps/app/src/features/organization/team-columns.tsx
  - apps/app/src/features/organization/team-list.ts
  - apps/app/src/features/organization/invite-member-dialog.tsx
---

Echipa sunt colegii care lucrează cu tine în aplicație, fiecare cu contul lui. O găsești în **Organizație**, la tabul **Echipă**.

## Tabelul echipei

Tabul **Echipă** arată într-un singur tabel membrii organizației și invitațiile trimise și neacceptate încă. Întâi vin membrii, după nume, apoi invitațiile în așteptare și la sfârșit cele expirate, cele mai noi întâi. Membrii îi poți ordona după **Nume** sau după **Ultima activitate**; invitațiile rămân după ei.

Pentru fiecare rând vezi:

- **Nume**: numele și, sub el, adresa de email. Pe rândul tău scrie „(tu)” după nume. La o invitație apare adresa la care a plecat;
- **Rol**: admin sau specialist (vezi [Rolurile](#rolurile));
- **Stare**: „Membru”, cu ziua în care a intrat în organizație; eticheta „Invitat”, pentru o invitație în așteptare, cu ziua în care expiră linkul; sau eticheta galbenă „Invitație expirată”, cu ziua în care a expirat;
- **Ultima activitate**, doar pentru admini (vezi [Ultima activitate](#ultima-activitate)).

Deasupra tabelului, adminii văd câți utilizatori folosiți din cât include planul, de exemplu „7 din 10 utilizatori” (vezi [Locurile din plan](#locurile-din-plan)). Pe telefon, tabelul își păstrează coloanele și se derulează în lateral.

Colegii care nu sunt admini văd membrii, cu rolul și starea lor. Deasupra tabelului scrie câți membri sunteți și câte invitații sunt în așteptare, de exemplu „6 membri · 1 invitație în așteptare”. Nu văd invitațiile și activitatea colegilor și nu pot schimba nimic.

## Rolurile

- **Specialist**: lucrează cu clienții și cu lucrătorii lor.
- **Admin**: poate tot ce poate un specialist și, în plus, invită membri noi, le schimbă rolul, îi elimină din organizație și se ocupă de abonament.

Rolul tău apare sus pe pagina **Organizație**, lângă numele ei, de exemplu „Rolul tău: Admin”. Rolul unui coleg îl alegi când îi trimiți invitația. Adminul îl poate schimba oricând din meniul de la capătul rândului, cu **Schimbă rolul în admin** sau **Schimbă rolul în specialist**. Din același meniu, **Elimină din organizație** îi ia colegului accesul la clienții și lucrătorii organizației; contul lui și datele introduse rămân. Propriul rol nu ți-l poți schimba și nici nu te poți elimina singur: o face alt admin.

## Invitațiile

Cu **Invită un membru** trimiți pe email un link valabil 7 zile. Persoana își creează contul din link sau, dacă are deja unul, intră cu el și se alătură organizației. După ce acceptă, apare în tabel ca membru.

La capătul rândului unei invitații poți:

- apăsa **Retrimite**: pleacă un email nou, cu un link valabil încă 7 zile, iar linkul de dinainte nu mai merge. La aceeași adresă poți retrimite cel mult o dată la 10 minute;
- alege **Revocă invitația** din meniul de lângă buton: linkul nu mai merge, iar rândul dispare din tabel.

Ca să schimbi rolul unei invitații în așteptare, trimite din nou o invitație la aceeași adresă, cu rolul nou. Când planul e plin, fereastra **Invită un membru** nu mai arată formularul: revocă întâi invitația, apoi trimite-o din nou cu rolul nou.

O invitație expirată rămâne în tabel până o retrimiți sau o revoci. Organizația poate avea cel mult 20 de invitații în așteptare.

## Ultima activitate

Coloana o văd doar adminii. Arată ziua în care colegul a folosit ultima dată aplicația: ziua în care s-a conectat sau, dacă a rămas conectat, ultima zi în care a avut aplicația deschisă. După ce se deconectează, coloana arată ziua în care s-a conectat ultima dată, chiar dacă a lucrat și după aceea. Cine nu s-a conectat niciodată are o liniuță.

Te ajută să vezi un loc din plan pe care nu-l mai folosește nimeni. Ordonează după **Ultima activitate**: la primul clic apar întâi cei care nu au mai lucrat de cel mai mult timp.

## Locurile din plan

Numărul de deasupra tabelului, de exemplu „7 din 10 utilizatori”, e același cu cel din **Abonament**, la **Cât folosești**. Se numără membrii, cu tine cu tot, și invitațiile în așteptare: fiecare invitație ține un loc până e acceptată, revocată sau până expiră. O invitație expirată nu mai ține un loc, dar dacă o retrimiți ia din nou unul, așa că nu o poți retrimite când planul e plin. Start are 3 utilizatori, Profesional și perioada de probă 10. Pe Enterprise numărul nu are limită și scrie doar câți utilizatori sunteți.

Când toate locurile sunt ocupate, numărul apare cu galben. **Invită un membru** rămâne la îndemână, dar fereastra lui îți spune că planul e plin. Pe un abonament Start plătit, adminul vede și butonul **Treci pe Profesional**, care deschide alegerea planului din **Abonament** (vezi [Schimbarea planului](/organizatie/abonament/#schimbarea-planului)). Pentru mai mult de 10 utilizatori, scrie-ne la contact@ssmusor.ro. Poți face loc și revocând o invitație în așteptare sau eliminând un membru.
