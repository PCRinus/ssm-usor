---
title: Portalul și actul adițional
description: Cum îi dai unui lucrător acces la portal, ce găsești pe tabul Portal al clientului și cum ții evidența actului adițional prin care lucrătorul acceptă să semneze electronic fișele de instruire.
topics:
  - id: angajati.portal
    heading: Accesul la portal
  - id: angajati.invitatie
    heading: Invitația
  - id: angajati.invitatie-fara-adresa
    heading: Lucrător fără email sau telefon
  - id: angajati.invitatie-din-fise
    heading: Invitarea lucrătorilor din fișe
  - id: angajati.revocare-acces
    heading: Revocarea
  - id: portal.pornire
    heading: Pornirea portalului
  - id: portal.administrator
    heading: Administratorul clientului
  - id: portal.lucratori
    heading: Lucrătorii și accesul la portal
  - id: portal.invitarea-mai-multor
    heading: Invitarea mai multor lucrători
  - id: portal.semnaturi
    heading: Semnăturile în așteptare
  - id: angajati.act-aditional
    heading: Actul adițional privind semnarea electronică
  - id: angajati.act-aditional-stari
    heading: Stările actului adițional
  - id: angajati.act-aditional-cerinte
    heading: Ce trebuie completat înainte
  - id: angajati.act-aditional-hartie
    heading: Semnat pe hârtie
  - id: angajati.act-aditional-clauza
    heading: Clauza în contract
  - id: angajati.act-aditional-revenire
    heading: Revenirea la semnarea de mână
  - id: angajati.anexa-13
    heading: Anexa 13 la regulamentul intern
sources:
  - docs/architecture/adr-022-participants-and-the-portal.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - docs/architecture/adr-032-employees-imported-from-training-sheets.md
  - packages/contracts/src/participants.ts
  - apps/app/src/features/participants/employee-portal-card.tsx
  - apps/app/src/features/employees/employee-layout.tsx
  - apps/app/src/features/participants/invite-employee-dialog.tsx
  - apps/app/src/features/participants/bulk-invite-dialog.tsx
  - apps/app/src/features/participants/bulk-invite-format.ts
  - apps/app/src/features/participants/participant-actions.ts
  - apps/app/src/features/participants/employee-access.ts
  - apps/app/src/features/participants/participant-errors.ts
  - apps/app/src/features/participants/sms-rules.ts
  - apps/app/src/features/participants/invite-administrator-dialog.tsx
  - apps/app/src/features/participants/client-portal-page.tsx
  - apps/app/src/features/participants/client-administrator-panel.tsx
  - apps/app/src/features/participants/portal-roster.tsx
  - apps/app/src/features/participants/portal-roster-columns.tsx
  - apps/app/src/features/participants/portal-access.tsx
  - apps/app/src/features/participants/portal-access-format.ts
  - apps/app/src/features/participants/use-portal-roster.ts
  - apps/app/src/features/signatures/client-signature-requests.tsx
  - supabase/migrations/20261120100000_employee_list_portal.sql
  - apps/app/src/features/signatures/signing-agreement-card.tsx
  - apps/app/src/features/signatures/agreement-scan-field.tsx
  - apps/app/src/features/signatures/agreement-warning.tsx
  - apps/app/src/features/signatures/signature-format.ts
---

Pe tabul **Portal** al unui lucrător, două panouri țin de semnarea electronică: **Acces la portal**, prin care lucrătorul își vede evidența și semnează, și **Actul adițional privind semnarea electronică**, acordul lui de a semna astfel fișele de instruire. Fiecare panou arată pe rânduri unde ai ajuns, iar butoanele stau lângă rândul la care se referă sau sub rânduri; pe telefon, toate coboară sub conținut, pe toată lățimea.

Pe tab, un singur buton e închis la culoare: pasul următor. Cât timp lucrătorul nu e invitat, e **Invită în portal**; dacă nu are nici email, nici telefon, **Adaugă emailul sau telefonul**; când invitația a expirat, **Retrimite**. Altfel, după ce ai descărcat actul adițional, pasul următor e **Înregistrează actul semnat pe hârtie…**.

## Accesul la portal

În portal, lucrătorul își vede instruirile, fișele individuale și datele pe care le tipăresc fișele, își semnează rubricile din instruiri și susține testele. Nu vede CNP-ul și nici observațiile tale. Intră cu un cod primit pe email sau prin SMS, fără parolă. Uneori, înainte să trimită codul, pagina de intrare îi cere să bifeze o casetă care confirmă că nu e un program automat.

Portalul îi dă lucrătorului acces direct la o parte din datele pe care angajatorul le ține despre el. Dreptul de acces din GDPR (art. 15) rămâne neschimbat: lucrătorul îl exercită printr-o cerere către angajator.

Panoul **Acces la portal** are două rânduri:

- **Acces**: **Fără invitație**, **Invitat**, cu data la care expiră invitația, **Invitație expirată**, cu data la care a expirat, sau **Are acces**, din ziua în care lucrătorul a intrat prima dată;
- **Primește codul**: unde primește lucrătorul codurile, pe email sau prin SMS, și, odată intrat, limba în care folosește portalul. Cât timp nu e invitat, rândul arată adresa la care ar pleca invitația: emailul, dacă îl are, altfel telefonul.

### Invitația

**Invită în portal**, lângă titlul panoului, trimite adresa portalului la emailul sau la telefonul din datele lucrătorului. Dacă are ambele, alegi unde; emailul e ales din start. Lucrătorul intră apoi cu un cod primit la aceeași adresă: adresa la care l-ai invitat e cea cu care intră.

SMS-urile pleacă doar la numere din România (+40) și nu pleacă deloc în perioada de probă, înainte să alegi un plan:

- în perioada de probă, telefonul apare în dialog, dar nu se poate alege: sub el scrie „SMS, după ce alegi un plan”, iar dialogul îți spune că invitația și codurile de semnare pleacă pe email. Dacă lucrătorul are doar telefon, adaugă-i un email cu **Modifică datele**;
- un număr din altă țară apare cu „SMS doar spre numere din România”. Dacă e singurul contact al lucrătorului, dialogul îți spune din ce țară e numărul și îți cere un email.

La fel e și la invitarea administratorului clientului, din tabul **Portal**: în perioada de probă SMS-ul nu se poate alege, iar sub telefon scrie că SMS trimitem doar spre numere din România.

Invitația e valabilă 30 de zile. Până o acceptă, vezi **Invitat**, cu data trimiterii și data la care expiră; după 30 de zile, **Invitație expirată**. **Retrimite**, pe rândul **Acces**, reînnoiește invitația și retrimite mesajul, cel mult o dată la 10 minute; până atunci, sub buton scrie ora de la care poți retrimite.

Câteva mesaje pe care le poți vedea:

- „Această adresă aparține deja unui participant al clientului.”: altă persoană a clientului intră deja cu această adresă. Fiecare persoană are nevoie de adresa ei.
- „Lucrătorul are deja o invitație deschisă la cealaltă adresă. Revoc-o înainte de a-l invita la aceasta.”
- „Adresa nu mai este cea din datele lucrătorului. Reîncarcă pagina și încearcă din nou.”: emailul sau telefonul s-a schimbat între timp.
- „Invitația a fost salvată, dar mesajul nu a putut fi trimis. O poți retrimite peste 10 minute.”
- „În perioada de probă nu trimitem SMS. Trimite invitația pe email; SMS-urile pornesc când se alege un plan.”
- „SMS trimitem doar spre numere din România (+40). Trimite invitația pe email.”

### Lucrător fără email sau telefon

Fără email și fără telefon, rândul **Primește codul** arată „Fără email sau telefon”, iar în locul invitației apare **Adaugă emailul sau telefonul**, care te duce la datele de contact ale lucrătorului. Adaugă unul dintre ele, apoi revino pe tabul **Portal** și trimite invitația.

### Invitarea lucrătorilor din fișe

După un import de lucrători din fișele de instruire, îi inviți pe toți în portal deodată, cu **Invită în portal lucrătorii din fișe**. Butonul e în cardul pe care tabul **Lucrători** îl arată după confirmarea importului și la vizitele următoare, cât timp unii dintre lucrătorii aduși nu sunt nici invitați, nici în portal. Cu **Ascunde** nu-l mai vezi pentru acel import, în browserul în care lucrezi. Dacă mai multe importuri au lucrători de invitat, cardul îl arată pe cel mai recent; după ce îi inviți sau îl ascunzi, apare următorul.

Dialogul începe cu ce găsesc lucrătorii în portal, în ordine: informarea despre cum le folosim datele, la care apasă „Am înțeles”; actul adițional privind semnarea electronică, primul lucru de semnat; apoi instruirile de acum înainte, pe care le semnează pe telefon. Instruirile transcrise de pe fișe rămân semnate pe hârtie și apar doar de citit. Nu li se cere niciun acord: informarea doar îi anunță, pentru că evidența instruirilor e o obligație legală a angajatorului.

Apoi îi împarte pe lucrători în două liste:

- **Primesc invitația**: cei cu email sau telefon în datele lor. Cine are și email și telefon primește invitația pe email.
- **Fără email sau telefon pe fișă**: fișele pe hârtie au rareori un contact. Scrie un email sau un număr de telefon în dreptul celor pe care vrei să-i inviți acum.

Ce scrii hotărăște cum pleacă invitația: un email, pe email; un număr de telefon din România, prin SMS. Un număr din altă țară rămâne neinvitat, cu „SMS trimitem doar spre numere din România (+40); scrie un email.” pe rândul lui. În perioada de probă orice număr de telefon rămâne neinvitat, cu „În perioada de probă nu trimitem SMS; scrie un email.”, iar dialogul îți spune că invitațiile pleacă doar pe email. Un rând lăsat gol rămâne neinvitat, fără să-i oprească pe ceilalți; îl inviți oricând din pagina lui sau din tabul **Portal**. Emailurile și telefoanele scrise aici se salvează în datele lucrătorilor, ca atunci când le modifici, odată cu invitația: o adresă pentru care invitația e refuzată nu se salvează. Foștii lucrători nu apar, iar cei care au deja acces sau o invitație deschisă apar separat și nu primesc nimic din nou.

Înainte să trimiți, dialogul îți spune câte invitații pleacă prin SMS. Invitațiile și codurile de intrare nu se numără din cele incluse în plan; se numără doar codurile de semnare trimise prin SMS, adică ale celor care nu au email.

Cu **Trimite**, fiecare invitație pleacă la fel ca atunci când inviți lucrătorul din pagina lui și e valabilă 30 de zile. La sfârșit, fiecare rând îți spune dacă invitația a plecat sau de ce nu, de exemplu pentru o adresă care aparține deja altei persoane a clientului. O invitație salvată al cărei mesaj nu a plecat o retrimiți după 10 minute, din pagina lucrătorului sau din tabul **Portal**.

### Revocarea

**Revocă invitația** anulează o invitație încă neacceptată. **Revocă accesul** îl oprește pe lucrător să mai intre în portal. Instruirile, fișele și celelalte date rămân la client, iar lucrătorul poate fi invitat din nou oricând.

Un lucrător care pleacă de la client își păstrează accesul: evidența lui rămâne, și odată cu ea dreptul lui de a o vedea. Revocă-l doar dacă angajatorul cere.

Tabul **Portal** al unui fost lucrător e doar de citit: arată accesul și actul adițional cum sunt, dar nu-l mai inviți și nu-i retrimiți invitația. Rămân **Revocă accesul**, cât timp îl are, și **Revocă invitația**, pentru o invitație încă deschisă.

## Tabul Portal al clientului

Tabul **Portal** al unui client adună tot ce ține de portal: administratorul clientului, lucrătorii cu accesul fiecăruia și semnăturile care așteaptă.

### Pornirea portalului

Cât timp clientul nu are administrator și nicio invitație pentru unul, iar niciun lucrător nu are acces, tabul începe cu **Pornește portalul pentru acest client**, în doi pași: **Invită administratorul** și **Invită lucrătorii**. Îi faci pe amândoi; începe cu administratorul, ca să poată pregăti portalul la client. **Invită lucrătorii** face același lucru ca **Invită lucrători** din listă (vezi mai jos). Panoul dispare de îndată ce administratorul e invitat sau un lucrător are acces, iar în locul lui apare panoul administratorului.

Un client fără lucrători actuali nu are încă pe cine invita: tabul îți spune „Clientul nu are încă lucrători” și te trimite la tabul **Lucrători**, de unde îi adaugi.

### Administratorul clientului

Administratorul clientului e persoana care ține evidența SSM la client: vede în portal lucrătorii și fișele lor și contrasemnează actele adiționale. Un client are un singur administrator, așa că **Invită administratorul** apare doar cât timp clientul nu are nici administrator, nici o invitație pentru unul. Dialogul îți propune numele reprezentantului legal și adresa persoanei de contact; poți alege în locul lor un lucrător al clientului.

Panoul arată trei rânduri:

- **Administrator**: numele și, dacă e și lucrător al clientului, legătura spre pagina lui;
- **Acces**: **Are acces**, din ziua în care a intrat prima dată, sau **Invitat**, cu data la care expiră invitația, ori **Invitație expirată**;
- **Intră cu**: adresa la care a fost invitat, dacă primește codurile pe email sau prin SMS și, odată intrat, limba în care folosește portalul.

Butoanele sunt pe rândul **Acces**: **Revocă accesul** când are acces, **Retrimite** și **Revocă invitația** cât timp invitația nu e acceptată. Ca să schimbi administratorul, revocă-l pe cel de acum, apoi invită-l pe cel nou.

### Lucrătorii și accesul la portal

Lista cuprinde toți lucrătorii actuali ai clientului, fiecare cu postul lui și cu accesul la portal. Foștii lucrători nu apar; accesul lor rămâne cum era (vezi [Revocarea](#revocarea)). Coloana **Acces** arată una dintre stări:

- **Are acces**, din ziua în care lucrătorul a intrat prima dată în portal;
- **Invitat**, cu data la care expiră invitația;
- **Invitație expirată**, cu data la care a expirat;
- **Fără invitație**;
- **Acces revocat**, cu data revocării, fie că ai revocat accesul, fie o invitație încă neacceptată.

**Intră cu** arată adresa, dacă e email sau telefon și limba în care lucrătorul folosește portalul. La lucrătorul care e și administratorul clientului scrie „administratorul clientului”.

Pe fiecare rând găsești ce se poate face acum: **Invită** pentru un lucrător fără invitație sau cu accesul revocat, cu același dialog ca din pagina lui; **Retrimite** pentru o invitație deschisă sau expirată, cel mult o dată la 10 minute; din meniul cu trei puncte, **Revocă accesul** sau **Revocă invitația**.

Cauți după nume sau marcă. **Filtre** alege după accesul la portal, postul de lucru și punctul de lucru, inclusiv **Fără punct de lucru**, când unii lucrători nu au unul. Ordonezi lista după lucrător sau după acces, în ordinea stărilor de mai sus. Deasupra listei vezi câți lucrători au acces din câți sunt, de exemplu „5 cu acces, din 14 lucrători”; cu un filtru sau o căutare, câți se potrivesc din total.

### Invitarea mai multor lucrători

Bifează lucrătorii pe care vrei să-i inviți; îi poți alege de pe mai multe pagini ale listei. Cât timp ai ales pe cineva, deasupra listei vezi câți lucrători ai ales, **Deselectează tot** și **Invită selectați**. Alegerea ține de căutare și de filtre: când le schimbi, o iei de la capăt.

Fără nimic ales, **Invită lucrători** aplică filtrul **Fără invitație** și îi alege pe toți lucrătorii care se potrivesc, de pe toate paginile. Scoate apoi bifa celor pe care nu vrei să-i inviți acum. Se aleg odată cel mult 1.000 de lucrători. Butonul nu-i alege pe cei cu invitația expirată sau cu accesul revocat: lor le trimiți din nou invitația cu **Retrimite** sau **Invită** de pe rândul fiecăruia, ori îi bifezi. Când toți lucrătorii au deja acces sau o invitație, îți spune asta și nu alege pe nimeni.

Un lucrător ales care între timp a primit acces sau o invitație, de pe rândul lui sau de la un coleg, iese din alegere, ca să nu fie invitat din nou.

**Invită selectați** deschide același dialog ca [invitarea lucrătorilor din fișe](#invitarea-lucrătorilor-din-fișe): cei cu email sau telefon în datele lor primesc invitația, iar pentru cei fără scrii un email sau un număr de telefon, care se salvează în datele lor. Cei care au deja acces sau o invitație deschisă apar separat și nu primesc nimic din nou. SMS-urile pleacă doar spre numere din România și nu pleacă în perioada de probă, ca la orice invitație.

### Semnăturile în așteptare

La sfârșitul tabului vezi rubricile din fișele clientului care așteaptă o semnătură: lucrătorul, ce se semnează, rubrica, cine semnează și când a fost cerută semnătura. Ordonezi lista după lucrător sau după data cererii. Lângă un lucrător fără actul adițional semnat apare avertismentul **Act adițional nesemnat**.

### Portalul unui client arhivat

La un client arhivat tabul rămâne de citit: nu mai inviți pe nimeni, nu retrimiți invitații și nu mai alegi lucrători. O invitație expirată nu mai apare ca avertisment, pentru că nu mai e nimic de făcut cu ea. Poți în continuare să revoci un acces sau o invitație, din meniul cu trei puncte al rândului sau din cel al administratorului, de exemplu când angajatorul cere asta după încheierea colaborării.

## Actul adițional privind semnarea electronică

Actul adițional la contractul individual de muncă e acordul lucrătorului de a semna electronic fișele de instruire. HG 1425/2006, art. 81, cere ca procedura semnării electronice a fișei să fie cuprinsă în contractul individual de muncă (alin. (3²)). Actul adițional modifică contractul, care se modifică doar prin acordul părților (Codul muncii, art. 41 alin. (1)), iar angajatorul nu-l poate obliga pe lucrător să-l semneze electronic (art. 16 alin. (1⁶)). De aceea fiecare lucrător își dă acordul separat.

Lucrătorul semnează actul în portal, unde îl găsește de la prima autentificare, înaintea oricărei instruiri. Apoi administratorul clientului îl contrasemnează în portal pentru angajator, pentru că la modificarea contractului părțile folosesc același tip de semnătură: dacă lucrătorul semnează electronic, semnează electronic și angajatorul (Codul muncii, art. 16 alin. (1⁷)).

Fără actul adițional semnat, lucrătorul poate semna în continuare instruirile. Lipsa apare ca avertisment, **Act adițional nesemnat**, pe pagina lui și în portal, dar nu blochează nimic. Pe pagina lucrătorului, avertismentul stă și în capul paginii, iar tabul **Portal** are un triunghi galben; după semnătura lucrătorului, până contrasemnează administratorul, scrie **Act adițional așteaptă angajatorul**. Capul paginii nu-l arată la un lucrător fără acces și fără invitație în portal, după revenirea la semnarea de mână, la un fost lucrător și la un client arhivat.

### Stările actului adițional

Rândul **Stare** arată una dintre stări:

- **Nesemnat**: nimic nu s-a întâmplat încă. Lucrătorul îl poate semna din portal de la prima autentificare.
- **Descărcat**: l-ai descărcat, ca să fie semnat de mână. **Ce urmează** arată ziua în care l-ai descărcat.
- **Semnat de lucrător**: lucrătorul l-a semnat în portal; urmează administratorul clientului, tot în portal.
- **Semnat electronic**: l-au semnat în portal atât lucrătorul, cât și administratorul clientului.
- **Semnat pe hârtie**: ai înregistrat actul semnat de mână de ambele părți, cu ziua semnării.
- **Clauză în contract**: contractul de muncă cuprinde deja clauza, așa că nu mai e nevoie de actul adițional.
- **Semnează de mână**: lucrătorul a cerut în scris să semneze din nou de mână.

La un fost lucrător actul nu se mai semnează: panoul îi arată starea, fără **Ce urmează** și fără să-l mai descarci pentru semnare sau să înregistrezi ceva. Un act nesemnat apare cu „Fost lucrător: actul nu se mai semnează.” **Descarcă actul semnat** și **Vezi clauza…** rămân.

Sub stare, panoul mai arată, când e cazul: **Semnături**, cine a semnat în portal și când, sau că administratorul clientului e încă în așteptare; **Scan**, la actul semnat pe hârtie, cu scanul atașat sau „Fără scan atașat”; **Cererea lucrătorului**, la revenirea la semnarea de mână; și **Ce urmează**, cât timp mai e un pas de făcut. **Descarcă actul semnat** îți dă actul semnat în portal.

### Ce trebuie completat înainte

Actul adițional se poate descărca sau semna în portal doar când are tot ce tipărește:

- emailul sau telefonul lucrătorului, pentru că actul spune unde primește lucrătorul codurile de semnare;
- numele și funcția reprezentantului legal, în datele clientului.

Când lipsește unul dintre ele, panoul arată un rând galben cu ce lipsește și un buton spre locul unde îl completezi. Numărul contractului individual de muncă e opțional; când îl ai, se tipărește lângă data angajării.

### Semnat pe hârtie

Pentru un lucrător care semnează de mână: **Descarcă actul pentru semnare pe hârtie**, tipărește-l și dă-l spre semnare lucrătorului și angajatorului. Apoi alege **Înregistrează actul semnat pe hârtie…**:

- **Data semnării** e ziua în care l-au semnat; din start e azi și nu poate fi în viitor. Poate fi și dinaintea angajării, ca un act semnat odată cu contractul.
- **Scanul actului** e opțional. Îl tragi în dialog sau îl alegi cu **Alege fișierul**, ca PDF sau imagine; la înregistrare se salvează în **Documente**, la lucrător. Dacă l-ai încărcat deja acolo, îl alegi din lista de dedesubt.

După înregistrare, rândul **Scan** deschide scanul.

### Clauza în contract

Pentru un lucrător nou, clauza poate intra direct în contractul individual de muncă, în locul actului adițional. **Folosește clauza în contractul de muncă…** îți arată textul, cu numele organizației tale; **Copiază clauza** îl copiază, ca să-l pui în contract. După semnarea contractului, alege în același dialog **Clauza e în contract**. Mai târziu, **Vezi clauza…** îți arată din nou textul.

### Revenirea la semnarea de mână

Când lucrătorul cere în scris să semneze din nou de mână, alege **Înregistrează revenirea la semnarea de mână…**. Treci **Data cererii**, ziua în care a scris-o (din start azi, nu în viitor și nu înaintea zilei în care a fost semnat actul sau, dacă nu a fost semnat, descărcat), și, opțional, cererea scrisă scanată, care se salvează în **Documente**, la lucrător, ca scanul actului.

Revenirea are efect din momentul în care o înregistrezi, nu din data cererii: de atunci, instruirile lui se semnează pe hârtie, iar cererile de semnare electronică în așteptare se anulează. Actul adițional și semnăturile de până atunci rămân la dosar. Panoul arată apoi **Semnează de mână**, cu ziua de la care lucrătorul semnează fișele de mână, iar rândul **Cererea lucrătorului** arată data cererii și scanul ei. Revenirea se înregistrează o singură dată. La o revenire înregistrată înainte ca aplicația să păstreze aceste date, panoul nu arată nici ziua înregistrării, nici cererea.

### Anexa 13 la regulamentul intern

Angajatorul hotărăște în regulamentul intern cum se semnează fișele de instruire (HG 1425/2006, art. 81 alin. (3¹)). În setul SSM, asta face anexa 13 la regulamentul intern, care se aplică unui client cu participanți în portal.

Cât timp anexa nu e emisă, panoul actului adițional arată un rând galben și te trimite la **Documente SSM**. Emite anexa odată cu actele adiționale.
