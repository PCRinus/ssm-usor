---
title: Portalul și actul adițional
description: Cum îi dai unui angajat acces la portal și cum ții evidența actului adițional prin care acceptă să semneze electronic fișele de instruire.
topics:
  - id: angajati.portal
    heading: Accesul la portal
  - id: angajati.invitatie
    heading: Invitația
  - id: angajati.invitatie-fara-adresa
    heading: Angajat fără email sau telefon
  - id: angajati.invitatie-din-fise
    heading: Invitarea angajaților din fișe
  - id: angajati.revocare-acces
    heading: Revocarea
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
    heading: Revenirea la semnarea olografă
  - id: angajati.anexa-13
    heading: Anexa 13 la regulamentul intern
sources:
  - docs/architecture/adr-022-participants-and-the-portal.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - docs/architecture/adr-032-employees-imported-from-training-sheets.md
  - packages/contracts/src/participants.ts
  - apps/app/src/features/participants/employee-portal-card.tsx
  - apps/app/src/features/participants/invite-employee-dialog.tsx
  - apps/app/src/features/participants/bulk-invite-dialog.tsx
  - apps/app/src/features/participants/bulk-invite-format.ts
  - apps/app/src/features/participants/participant-actions.tsx
  - apps/app/src/features/participants/participant-errors.ts
  - apps/app/src/features/signatures/signing-agreement-card.tsx
  - apps/app/src/features/signatures/agreement-warning.tsx
  - apps/app/src/features/signatures/signature-format.ts
---

Pe tabul **Date** al unui angajat, două carduri țin de semnarea electronică: **Acces la portal**, prin care angajatul își vede evidența și semnează, și **Actul adițional privind semnarea electronică**, acordul lui de a semna astfel fișele de instruire.

## Accesul la portal

În portal, angajatul își vede instruirile, fișele individuale și datele pe care le tipăresc fișele, își semnează rubricile din instruiri și susține testele. Nu vede CNP-ul și nici observațiile tale. Intră cu un cod primit pe email sau prin SMS, fără parolă. Uneori, înainte să trimită codul, pagina de intrare îi cere să bifeze o casetă care confirmă că nu e un program automat.

Portalul îi dă angajatului acces direct la o parte din datele pe care angajatorul le ține despre el. Dreptul de acces din GDPR (art. 15) rămâne neschimbat: angajatul îl exercită printr-o cerere către angajator.

Cardul arată dacă angajatul are acces, cu ce adresă și din ce zi, și în ce limbă folosește portalul. Tot aici poate apărea avertismentul **Act adițional nesemnat**, despre care vezi mai jos.

### Invitația

**Invită în portal** trimite adresa portalului la emailul sau la telefonul din datele angajatului. Dacă are ambele, alegi unde; emailul e ales din start, pentru că fiecare cod trimis prin SMS costă. Angajatul intră apoi cu un cod primit la aceeași adresă: adresa la care l-ai invitat e cea cu care intră.

Invitația e valabilă 30 de zile. Până o acceptă, vezi **Invitat**, cu data trimiterii și data la care expiră; după 30 de zile, **Invitație expirată**. **Retrimite** reînnoiește invitația și retrimite mesajul, cel mult o dată la 10 minute.

Câteva mesaje pe care le poți vedea:

- „Această adresă aparține deja unui participant al clientului.”: altă persoană a clientului intră deja cu această adresă. Fiecare persoană are nevoie de adresa ei.
- „Angajatul are deja o invitație deschisă la cealaltă adresă. Revoc-o înainte de a-l invita la aceasta.”
- „Adresa nu mai este cea din datele angajatului. Reîncarcă pagina și încearcă din nou.”: emailul sau telefonul s-a schimbat între timp.
- „Invitația a fost salvată, dar mesajul nu a putut fi trimis. O poți retrimite peste 10 minute.”

### Angajat fără email sau telefon

Fără email și fără telefon, dialogul îți spune „Angajatul nu are email sau telefon” și te trimite la **Modifică datele**. Adaugă unul dintre ele, apoi trimite invitația.

### Invitarea angajaților din fișe

După un import de angajați din fișele de instruire, îi inviți pe toți în portal deodată, cu **Invită în portal angajații din fișe**. Butonul e în cardul pe care tabul **Angajați** îl arată după confirmarea importului și la vizitele următoare, cât timp unii dintre angajații aduși nu sunt nici invitați, nici în portal. Cu **Ascunde** nu-l mai vezi pentru acel import, în browserul în care lucrezi. Dacă mai multe importuri au angajați de invitat, cardul îl arată pe cel mai recent; după ce îi inviți sau îl ascunzi, apare următorul.

Dialogul începe cu ce găsesc angajații în portal, în ordine: informarea despre cum le folosim datele, la care apasă „Am înțeles”; actul adițional privind semnarea electronică, primul lucru de semnat; apoi instruirile de acum înainte, pe care le semnează pe telefon. Instruirile transcrise de pe fișe rămân semnate pe hârtie și apar doar de citit. Nu li se cere niciun acord: informarea doar îi anunță, pentru că evidența instruirilor e o obligație legală a angajatorului.

Apoi îi împarte pe angajați în două liste:

- **Primesc invitația**: cei cu email sau telefon în datele lor. Cine are și email și telefon primește invitația pe email.
- **Fără email sau telefon pe fișă**: fișele pe hârtie au rareori un contact. Scrie un email sau un număr de telefon în dreptul celor pe care vrei să-i inviți acum.

Ce scrii hotărăște cum pleacă invitația: un email, pe email; un număr de telefon, prin SMS. Un rând lăsat gol rămâne neinvitat, fără să-i oprească pe ceilalți; îl inviți oricând din pagina lui sau din tabul **Portal**. Emailurile și telefoanele scrise aici se salvează în datele angajaților, ca atunci când le modifici, odată cu invitația: o adresă pentru care invitația e refuzată nu se salvează. Foștii angajați nu apar, iar cei care au deja acces sau o invitație deschisă apar separat și nu primesc nimic din nou.

Înainte să trimiți, dialogul îți spune câte invitații pleacă prin SMS: fiecare SMS costă, ca și codurile de intrare trimise după aceea, pe când emailul nu.

Cu **Trimite**, fiecare invitație pleacă la fel ca atunci când inviți angajatul din pagina lui și e valabilă 30 de zile. La sfârșit, fiecare rând îți spune dacă invitația a plecat sau de ce nu, de exemplu pentru o adresă care aparține deja altei persoane a clientului. O invitație salvată al cărei mesaj nu a plecat o retrimiți după 10 minute, din pagina angajatului sau din tabul **Portal**.

### Revocarea

**Revocă** anulează o invitație încă neacceptată. **Revocă accesul** îl oprește pe angajat să mai intre în portal. Instruirile, fișele și celelalte date rămân la client, iar angajatul poate fi invitat din nou oricând.

Un angajat care pleacă de la client își păstrează accesul: evidența lui rămâne, și odată cu ea dreptul lui de a o vedea. Revocă-l doar dacă angajatorul cere.

## Actul adițional privind semnarea electronică

Actul adițional la contractul individual de muncă e acordul angajatului de a semna electronic fișele de instruire. HG 1425/2006, art. 81, cere ca procedura semnării electronice a fișei să fie cuprinsă în contractul individual de muncă (alin. (3²)). Actul adițional modifică contractul, care se modifică doar prin acordul părților (Codul muncii, art. 41 alin. (1)), iar angajatorul nu-l poate obliga pe angajat să-l semneze electronic (art. 16 alin. (1⁶)). De aceea fiecare angajat își dă acordul separat.

Angajatul semnează actul în portal, unde îl găsește de la prima autentificare, înaintea oricărei instruiri. Apoi administratorul clientului îl contrasemnează în portal pentru angajator, pentru că la modificarea contractului părțile folosesc același tip de semnătură: dacă angajatul semnează electronic, semnează electronic și angajatorul (Codul muncii, art. 16 alin. (1⁷)).

Fără actul adițional semnat, angajatul poate semna în continuare instruirile. Lipsa apare ca avertisment, **Act adițional nesemnat**, pe pagina lui și în portal, dar nu blochează nimic.

### Stările actului adițional

- **Nesemnat**: nimic nu s-a întâmplat încă. Angajatul îl poate semna din portal de la prima autentificare.
- **Generat**: l-ai descărcat, ca să fie semnat de mână, sau angajatul l-a semnat în portal și se așteaptă semnătura administratorului clientului (**Act adițional așteaptă angajatorul**).
- **Semnat electronic**: l-au semnat în portal atât angajatul, cât și administratorul clientului.
- **Semnat pe hârtie**: l-ai marcat semnat de mână de ambele părți.
- **Clauza în contract**: contractul de muncă cuprinde deja clauza, așa că nu mai e nevoie de actul adițional.
- **Revenire la semnarea olografă**: angajatul a cerut în scris să semneze din nou de mână.

### Ce trebuie completat înainte

Actul adițional se poate descărca sau semna în portal doar când are tot ce tipărește:

- emailul sau telefonul angajatului, pentru că actul spune unde primește angajatul codurile de semnare;
- numele și funcția reprezentantului legal, în datele clientului.

Când lipsește unul dintre ele, cardul îți spune ce și te trimite la câmpul lui. Numărul contractului individual de muncă e opțional; când îl ai, se tipărește lângă data angajării.

### Semnat pe hârtie

Pentru un angajat care semnează de mână: **Descarcă** actul, tipărește-l și dă-l spre semnare angajatului și angajatorului. Apoi alege **Marchează semnat pe hârtie**. Poți atașa scanul, dacă l-ai încărcat întâi în **Fișiere**, pe pagina angajatului.

### Clauza în contract

Pentru un angajat nou, clauza poate intra direct în contractul individual de muncă, în locul actului adițional. **Copiază clauza pentru contract** îți dă textul, cu numele organizației tale. După semnarea contractului, alege **Clauza e în contract**.

### Revenirea la semnarea olografă

Când angajatul cere în scris să semneze din nou de mână, alege **Marchează revenirea la semnarea olografă**. De atunci, instruirile lui se semnează pe hârtie, iar cererile de semnare electronică în așteptare se anulează. Actul adițional și semnăturile de până atunci rămân la dosar.

### Anexa 13 la regulamentul intern

Angajatorul hotărăște în regulamentul intern cum se semnează fișele de instruire (HG 1425/2006, art. 81 alin. (3¹)). În setul SSM, asta face anexa 13 la regulamentul intern, care se aplică unui client cu participanți în portal.

Cât timp anexa nu e emisă, cardul actului adițional te avertizează și te trimite la **Documente SSM**. Emite anexa odată cu actele adiționale.
