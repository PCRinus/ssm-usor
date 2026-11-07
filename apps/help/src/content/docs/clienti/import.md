---
title: Importul din documente și din fișe
description: Cum aduci în aplicație un client din documentația lui SSM și SU și lucrătorii lui din fotografiile fișelor individuale de instruire.
topics:
  - id: import.client
    heading: Importul unui client din documente
  - id: import.angajati
    heading: Importul lucrătorilor din fișe
  - id: import.pornire
    heading: De unde pornești
  - id: import.fise-gasite
    heading: Fișele găsite în documentație
  - id: import.ce-fotografiezi
    heading: Ce fotografiezi
  - id: import.limite
    heading: Cât intră într-un import
  - id: import.citire
    heading: Citirea fișelor
  - id: import.persoane
    heading: Lista persoanelor
  - id: import.fotografii-neatribuite
    heading: Fotografiile neatribuite
  - id: import.pagina-persoanei
    heading: Pagina unei persoane
  - id: import.post
    heading: Postul de lucru
  - id: import.loc-de-munca
    heading: Locul de muncă
  - id: import.cnp
    heading: CNP-ul de pe fișă
  - id: import.angajat-existent
    heading: Un lucrător pe care clientul îl are deja
  - id: import.fost-angajat
    heading: Cine a plecat din firmă
  - id: import.randuri
    heading: Rândurile de instruire
  - id: import.test-verificat-pe-fisa
    heading: Testul la angajare verificat pe fișă
  - id: import.salvare
    heading: Salvarea și cele 14 zile
  - id: import.confirmare
    heading: Crearea lucrătorilor
  - id: import.dupa-import
    heading: După import
  - id: import.originale
    heading: Originalele rămân la client
  - id: import.fara-reinstruire
    heading: Nicio instruire și niciun test de refăcut
  - id: import.portal
    heading: Portalul și actul adițional după import
  - id: import.instructiuni-proprii
    heading: Instrucțiunile proprii din documentație
  - id: import.evaluari-de-risc
    heading: Evaluările de risc din documentație
  - id: import.problema
    heading: O problemă cu importul
sources:
  - docs/architecture/adr-030-import-from-documents.md
  - docs/architecture/adr-037-import-quality-and-alerts.md
  - apps/app/src/features/imports/report-import-button.tsx
  - docs/architecture/adr-032-employees-imported-from-training-sheets.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - packages/contracts/src/imports.ts
  - packages/contracts/src/billing.ts
  - docs/architecture/adr-034-own-instructions-as-app-text.md
  - docs/architecture/adr-036-risk-library-and-import.md
  - apps/app/src/features/imports/library/risks-model.ts
  - packages/import/src/risks-proposal.ts
  - packages/import/src/risks-roles.ts
  - supabase/migrations/20261102180100_apply_risk_import.sql
  - apps/api/src/modules/imports/library.ts
  - apps/app/src/features/imports/library/*.tsx
  - apps/app/src/features/imports/library/library-model.ts
  - apps/app/src/features/imports/library/next-steps-model.ts
  - apps/api/src/modules/credits/usage.ts
  - apps/app/src/features/imports/import-credits.ts
  - apps/app/src/features/imports/review-fields.tsx
  - apps/app/src/features/imports/training-category.ts
  - apps/app/src/features/imports/phone-diff.ts
  - apps/api/src/modules/imports/payload.ts
  - apps/app/src/features/imports/credits-notices.tsx
  - apps/api/src/modules/imports/handlers.ts
  - apps/api/src/modules/imports/employees.ts
  - apps/api/src/modules/imports/cleanup.ts
  - packages/import/src/sheet-people.ts
  - packages/import/src/employee-match.ts
  - packages/import/src/employee-checks.ts
  - apps/app/src/features/imports/start-ways.tsx
  - apps/app/src/features/imports/import-upload-dialog.tsx
  - apps/app/src/features/imports/upload-selection.ts
  - apps/app/src/features/imports/review-hub.tsx
  - apps/app/src/features/imports/confirm-import-dialog.tsx
  - apps/app/src/features/imports/abandon-import-dialog.tsx
  - apps/app/src/features/imports/import-ready-notices.ts
  - apps/app/src/features/imports/open-imports.ts
  - apps/app/src/features/imports/employees/employee-import-entry.tsx
  - apps/app/src/features/imports/employees/employee-upload-dialog.tsx
  - apps/app/src/features/imports/employees/employee-processing.tsx
  - apps/app/src/features/imports/employees/employee-hub.tsx
  - apps/app/src/features/imports/employees/review-groups.tsx
  - apps/app/src/features/imports/employees/people-list.tsx
  - apps/app/src/features/imports/employees/unplaced-pages.tsx
  - apps/app/src/features/imports/employees/person-page.tsx
  - apps/app/src/features/imports/employees/person-decisions.tsx
  - apps/app/src/features/imports/employees/person-fields.tsx
  - apps/app/src/features/imports/employees/person-trainings.tsx
  - apps/app/src/features/imports/employees/employee-review-model.ts
  - apps/app/src/features/imports/employees/employee-confirm-dialog.tsx
  - apps/app/src/features/client-files/import-folder.tsx
  - supabase/migrations/20261101100100_hiring_test_after_app_training.sql
  - supabase/migrations/20261101100200_import_caps_per_kind.sql
  - supabase/migrations/20261101120000_apply_employee_import.sql
  - supabase/migrations/20261101140000_import_found_sheets.sql
---

Un client pe care îl preiei vine cu un dosar: documentația SSM și SU (în dosarele mai vechi, PSI) scrisă de-a lungul anilor și fișele individuale de instruire completate de mână. Aplicația le citește și îți face o propunere. Nu se salvează nimic până nu verifici propunerea și o confirmi.

Sunt două importuri, în această ordine: întâi clientul, din documentația lui, apoi lucrătorii, din fișele lor.

## Creditele importurilor

Citirea documentelor și a fotografiilor se socotește în credite. Un credit înseamnă o fotografie sau o pagină scanată citită.

- **Importul unui client** folosește 25 de credite pentru citirea documentelor, oricât de lungi ar fi, plus câte unul pentru fiecare fotografie și pagină scanată. Un PDF cu text, salvat din Word de exemplu, intră în cele 25. Care pagini ale unui PDF sunt scanate se află abia la citire, așa că fereastra de încărcare îți spune: „Folosește 25 de credite, plus 1 pentru fiecare pagină scanată.” Tot ea îți spune că, dacă le găsim, instrucțiunile proprii folosesc încă 25 (IPSSM) și 10 (IPSU), iar evaluările de risc încă 15.
- **Importul lucrătorilor** folosește un credit pentru fiecare fotografie și pentru fiecare pagină a unui PDF.
- **Instrucțiunile proprii** din documentația unui client se citesc separat, pentru biblioteca ta de instrucțiuni proprii: 25 de credite pentru cele SSM și 10 pentru cele SU, de fiecare dată când le citim. Dacă citirea lor nu reușește, creditele ei îți sunt returnate.
- **Evaluările de risc** din documentația unui client se citesc tot separat, pentru biblioteca ta de evaluări de risc și pentru fișele clientului: 15 credite de fiecare dată când le citim, returnate dacă citirea nu reușește.

### Câte credite ai

În perioada de probă ai 300 de credite pentru toată perioada. Planul Start are 300 de credite pe lună, iar Profesional 1.500. Luna e cea a abonamentului, iar creditele nefolosite nu trec în luna următoare.

La prima plată primești, o singură dată, creditele de bun venit, ca să-ți aduci toți clienții în aplicație: 2.500 cu Start sau 10.000 cu Profesional. Ele nu expiră și se folosesc după cele ale lunii. Dacă treci de la Start la Profesional, primești pe loc diferența de credite a lunii și, dacă aveai deja cadoul de la Start, diferența de cadou.

Înainte să pornești un import, fereastra de încărcare îți arată cât folosește și câte credite îți mai rămân luna aceasta și din cadoul de bun venit. Câte mai ai vezi oricând și pe pagina **Abonament**, în bara creditelor (vezi [Creditele pentru import](/organizatie/abonament/#creditele-pentru-import)).

### Când nu ajung creditele

Un import nou pornește doar dacă creditele rămase acoperă ce se știe dinainte: cele 25 ale citirii și fotografiile, la un client; toate fotografiile și paginile, la lucrători. Altfel **Încarcă și citește** rămâne oprit, iar fereastra îți spune câte credite trebuie, câte îți mai rămân și când primești altele. La lucrători poți scoate o parte dintre fotografii și le imporți după reînnoire, cu toate fotografiile unei persoane în același import. Dacă ai nevoie de credite mai devreme, scrie-ne la contact@ssmusor.ro și îți adăugăm credite.

Un import pornit nu se oprește din lipsă de credite. Dacă documentele unui client au mai multe pagini scanate decât credite rămase, importul se termină, iar diferența se scade din creditele lunii următoare: cu 4 credite peste, luna următoare pe Start începe cu 296. Înainte să creezi clientul vezi cât a folosit importul, de exemplu „Importul a folosit 34 de credite (25 + 9 pagini scanate)” sau, cu instrucțiunile proprii, „Importul a folosit 60 de credite (25 + 35 pentru instrucțiunile proprii)”.

### Creditele returnate

Dacă un import se oprește înainte să fie gata de verificat, primești înapoi toate creditele lui, iar pagina importului îți spune „Creditele ți-au fost returnate.” Un import la care renunți după ce a fost citit nu se returnează: citirea s-a făcut.

## Importul unui client din documente

Pornești din **Clienți**, cu **Importă din documente**, pentru un client nou, sau de pe pagina unui client existent, cu **Completează din documentație**. Încarci documentația unei singure firme: fișiere, un folder sau o arhivă ZIP, în PDF, DOC, DOCX, JPG, PNG sau HEIC, cel mult 150 de fișiere și 100 MB în total. Arhiva o deschide aplicația înainte de încărcare, așa că vezi ce intră.

Aplicația pune deoparte ce nu poartă date despre client (coperți, formulare goale, texte de lege), citește restul și îți propune datele firmei, punctele de lucru, posturile, persoanele cu atribuții, programul de instruire, datele SU și echipamentul de protecție. Le verifici pe secțiuni, apoi confirmi. Cu **Vezi în document**, lângă fiecare valoare, deschizi locul din document de unde a fost luată. La un client existent, o valoare pe care o ai deja în aplicație nu se schimbă decât dacă alegi tu valoarea din documente.

### Ce intră în documente

Pe fiecare card, coloana **Ce intră în documente** arată valoarea care se scrie în documentele clientului. Unde ai de ales între două variante, ele stau una sub alta, iar cea aleasă are eticheta **Intră în documente**:

- **Scrierea corectată sau ca în document.** Un text scris numai cu majuscule sau fără diacritice e propus corectat, cu cuvintele schimbate marcate. Corectura atinge doar majusculele și diacriticele; numele, codurile și adresele rămân cum le scriu documentele. Scrierea corectată e aleasă din start; dacă vrei textul exact ca în document, alege **Ca în document**.
- **Denumirea de la ANAF sau din documente.** Când la ANAF CUI-ul este înregistrat cu altă denumire decât cea din documente, e aleasă din start denumirea de la ANAF, cea valabilă acum. Dacă ai dreptate cu denumirea din documente, verifică întâi CUI-ul, apoi alege **În documente**. Până alegi una, cardul **Date firmă** îți amintește să te uiți la denumire.
- **Mai multe variante în documente.** Când documentele dau valori diferite, de exemplu două numere de telefon de contact, alegi una dintre ele. Dacă niciuna nu mai e valabilă, alege **Altă valoare** și scrie-o tu. Fumatul interzis în toată incinta și permis într-un loc amenajat, de exemplu la poartă, nu sunt două variante: e o singură regulă, fumatul permis numai în locurile amenajate, cu locul citit din documente, iar **Vezi în document** îți arată ambele pasaje. Ai de ales între reguli doar când documentele nu spun unde e locul pentru fumat.
- **Două numere de telefon.** Numerele care au aceleași cifre, scrise cu alte spații sau cu +40 în față, sunt socotite unul singur. Când documentele dau numere cu cifre diferite, le vezi scrise la fel, grupate ca un număr de mobil sau de fix, iar cifrele prin care diferă sunt marcate, ca să deosebești o greșeală de tastare. Numărul ales intră în documente așa cum e scris în documentul lui.
- **Instruirea periodică pe categorii.** Pentru fiecare categorie de personal, execuție și tehnico-administrativ, un singur rând arată fie periodicitatea, de exemplu „la 6 luni”, fie „Nu se aplică”. Cu **Schimbă** alegi unul dintre intervalele din programul de instruire al clientului sau „Nu se aplică”, așa că cele două nu pot rămâne amândouă. Când niciun post nu e în categorie, e propus „Nu se aplică”, cu motivul scris dedesubt. Când documentele dau și o periodicitate, și „Nu se aplică”, alegi una dintre ele, fiecare cu documentul ei. Periodicitatea instruirii SU o alegi tot dintr-o listă, în luni.

**Schimbă** deschide doar câmpul de pe rândul lui, încadrat și marcat cu „Schimbi acum”; ce salvezi intră în documente în locul valorii din import. La un client nou, lângă CUI apare și **Plătitor de TVA**, ca la un client adăugat de mână. Căsuța e bifată când ANAF arată firma înregistrată în scopuri de TVA, iar un CUI scris cu prefixul RO o bifează la salvare. Pe card, CUI-ul unei firme plătitoare de TVA apare cu prefixul RO. Un câmp care lipsește din documente îl completezi cu **Completează**, iar o întrebare cu da sau nu o lămurești direct din rând.

La sfârșitul primei secțiuni, **Găsite în alte secțiuni** îți arată ce mai e de văzut în celelalte: corecturile de scriere, alegerile de făcut și datele lipsă, fiecare cu **Deschide secțiunea**.

Instrucțiunile proprii (IPSSM și IPSU) și evaluările de risc nu intră în propunerea clientului: le citim separat, pentru bibliotecile tale, și nu te țin pe loc când creezi clientul.

Numele reprezentantului legal, al persoanei de contact și ale persoanelor cu atribuții le căutăm în toate documentele încărcate, și în cele puse deoparte, ca instrucțiunile proprii. Când un document scrie numele cu una sau două litere altfel, de exemplu „Ionescu” într-unul și „Ioanescu” în altul, primești ambele scrieri ca variante, fiecare cu fișierul ei și cu **Vezi în document**. La reprezentantul legal și la persoana de contact alegi una dintre ele, ca la orice valoare pe care documentele o dau diferit, sau scrii alta cu **Altă valoare**. La o persoană cu atribuții, rândul ei îți spune „Documentele scriu numele în 2 feluri”, cu numele citit ales din start; dacă cealaltă scriere e cea corectă, o alegi tu.

Nu trebuie să aștepți citirea: importul rămâne în **Clienți**, la **Importuri din documente**, până creezi clientul sau renunți. Dacă ai pornit tu importul și lucrezi între timp pe altă pagină din aplicație, îți apare o notificare când propunerea e gata, cu **Verifică propunerea**, sau când citirea s-a oprit.

Cât timp ai un import pornit de tine care se citește, te așteaptă la verificare sau s-a oprit, în capul paginii apare butonul **Importuri**, lângă **Ghid de configurare**; pe telefon e butonul rotund de lângă ghid, cu numărul importurilor de verificat. Îl deschizi de pe orice pagină și vezi importurile grupate: **De verificat**, cu butonul care te duce la verificare, **Se citesc**, cu cât s-a citit, și **S-au oprit**, cu **Vezi importul**. Un import confirmat sau la care ai renunțat iese din listă, iar butonul dispare când nu mai ai niciunul deschis.

Documentele încărcate rămân la client, în **Alte documente**, într-un folder „Dosar importat pe …”. Fotografiile fișelor de instruire găsite printre ele sunt păstrate pentru importul lucrătorilor.

### Instrucțiunile proprii din documentație

Instrucțiunile proprii din pachet (IPSSM și IPSU) se citesc separat, după ce propunerea clientului e gata, pentru biblioteca ta de [instrucțiuni proprii](/instructiuni/). Pe pagina importului apar sub secțiunile clientului, în grupul **Instrucțiuni proprii**, câte una pentru IPSSM și IPSU, fiecare cu starea ei: _se citește_, _de verificat_, _nimic nou_, _nu s-a putut citi_ sau _confirmat_.

Le poți deschide și verifica de îndată ce sunt citite, dar le confirmi după client, pentru că se aplică la posturile lui: până atunci butonul lor spune **Confirmă întâi clientul**. Nu te țin pe loc: creezi clientul oricând. Dacă mai ai instrucțiuni de confirmat, după crearea clientului rămâi pe pagina importului, care începe cu ce mai ai de făcut (vezi [După crearea clientului](#după-crearea-clientului)), iar pagina clientului îți amintește de ele, cu **Verifică instrucțiunile**, până le confirmi. Le poți confirma timp de 14 zile de la crearea clientului; după aceea propunerea expiră și nu mai poate fi schimbată sau citită din nou.

Ce ai deja în bibliotecă nu ți se cere din nou. Deasupra listei vezi câte sunt, de exemplu „7 instrucțiuni din pachet sunt deja în biblioteca ta”: la confirmare, posturile primesc instrucțiunea ta. Fiecare instrucțiune nouă sau asemănătoare are un card cu titlul ei și, pe rânduri, ce hotărăști pentru ea, fiecare rând cu butonul lui. Un rând care încă așteaptă o alegere e marcat cu galben, iar sus cardul îți spune ce mai ai de făcut, de exemplu „Mai ai de ales posturile”, sau „Gata de confirmat”. Rândurile sunt:

- **Titlul în bibliotecă**, pe care îl schimbi cu **Redenumește**. Titlul pierde începutul comun („Instrucțiuni proprii … privind”), iar unul scris numai cu majuscule e propus cu literă mare doar la început, cu prescurtări ca SSM, SU, PSI sau EIP păstrate; cel din pachet rămâne scris dedesubt, după „Din document”. Dacă ai deja o instrucțiune cu același titlu, SSM sau SU, sau dacă pachetul are două cu același titlu, propunerea adaugă numele clientului în paranteză, iar la nevoie și un număr;
- **Categoria**, pe care o schimbi cu **Schimbă categoria**;
- **Posturile** la care se aplică, după tematica de instruire, cu **Alege posturile** sau **Schimbă posturile**. Fără posturi, instrucțiunea intră doar în bibliotecă. Un post pentru care tematica nu spune clar ce instrucțiuni ia rămâne nedecis: îl vezi deasupra listei, cu ce scrie în tematică și de ce nu s-a putut decide, și îl alegi tu;
- **Textul**, cu numărul de articole. **Vezi în document** deschide fișierul la începutul instrucțiunii, iar **Editează textul** deschide textul în formularul instrucțiunii, ca să corectezi un articol sau să scoți numele clientului. Sub el apar avertismentele textului, de exemplu când numerotarea nu s-a putut citi, când un articol din pachet nu are text și a fost lăsat deoparte, când un tabel a fost trecut ca text sau când textul numește clientul.

Comutatorul din capul cardului hotărăște dacă preiei instrucțiunea și scrie lângă el ce ai ales: **Inclusă** când e pornit, **Nu e inclusă** când e oprit. O instrucțiune care nu e inclusă nu intră în bibliotecă și nu se aplică la niciun post.

O instrucțiune **asemănătoare** arată pe rândul **Seamănă cu** cu care dintre instrucțiunile tale seamănă. **Vezi ce diferă** îți arată articolele adăugate, cele care lipsesc și cele schimbate, cu cuvintele schimbate marcate. La **Ce primesc posturile** alegi **Cea din bibliotecă**, ca posturile să primească instrucțiunea ta așa cum e, sau **Cea din pachet**, ca textul din pachet să intre în bibliotecă separat, cu titlul și categoria lui. Propunerea e „Cea din bibliotecă”, în afară de cazul în care pachetul are articole pe care instrucțiunea ta nu le are; rândul rămâne marcat până alegi tu una dintre ele, chiar și pe cea propusă.

Schimbările se salvează pe măsură ce le faci. Când nu e nimic nou, sarcina spune „Nimic nou în pachet”, iar confirmarea doar aplică instrucțiunile tale la posturi. La confirmare, instrucțiunile noi intră în bibliotecă și toate se aplică la posturile alese; un post care o avea deja nu o primește de două ori.

Dacă citirea nu reușește, vezi motivul și **Citește din nou**. Creditele citirii care nu a reușit îți sunt date înapoi, iar o citire nouă le folosește din nou (25 pentru IPSSM, 10 pentru IPSU), iar clientul și cealaltă parte rămân cum sunt. Totalul importului le arată separat, de exemplu „Importul a folosit 60 de credite (25 + 35 pentru instrucțiunile proprii)”.

### Evaluările de risc din documentație

Evaluarea riscurilor din pachet și planul ei de prevenire și protecție se citesc separat, după ce propunerea clientului e gata, pentru biblioteca ta de [evaluări de risc](/evaluari-de-risc/) și pentru fișele de evaluare ale clientului. Pe pagina importului apar în grupul **Evaluări de risc**, după instrucțiunile proprii, cu aceleași stări: _se citește_, _de verificat_, _nimic nou_, _nu s-a putut citi_ sau _confirmat_. Fișele pe care le ai deja în bibliotecă tot îți cer confirmarea, fiindcă ea le scrie pe fișele clientului: sarcina spune atunci „Le ai deja în bibliotecă; confirmă ca să le scriem pe fișele clientului”. _Nimic nou_ apare doar când confirmarea n-ar scrie nimic, nici în bibliotecă, nici la client. Ca și instrucțiunile, le poți verifica de îndată ce sunt citite, dar le confirmi după client, în cel mult 14 zile de la crearea lui; până atunci butonul spune **Confirmă întâi clientul**, iar pagina clientului îți amintește de ele.

Fiecare evaluare de risc din pachet are un card, cu titlul ei din document și felul ei: post de lucru, grupuri sensibile sau o fișă în afara posturilor, de exemplu „Vizitatori”. Sus, cardul îți spune ce mai ai de făcut sau „Gata de confirmat”, iar deasupra cardurilor vezi la câte evaluări mai ai de ales și câți factori au ceva de verificat. Rândurile cardului sunt:

- **Posturile** pe care le evaluează fișa, după titlul ei, cu **Schimbă posturile**. O fișă care evaluează mai multe posturi se scrie la fiecare. Un titlu care nu numește niciun post al clientului rămâne marcat până alegi postul, cu **Alege posturile**, sau o lași **Doar în bibliotecă**. Fișa grupurilor sensibile și celelalte fișe din afara posturilor merg la fișele clientului cu același nume;
- **Fișa existentă**, când postul are deja o fișă cu factori, de exemplu „Postul are deja o fișă cu 18 factori”: **Adaugă după cei existenți**, **Înlocuiește** sau **Lasă cum e**, care e propunerea;
- **În bibliotecă**: o evaluare nouă o adaugi cu **Adaugă în bibliotecă** sau o lași doar la client cu **Nu adăuga**; o evaluare din afara posturilor e propusă fără bibliotecă. Una care seamănă cu o evaluare a ta îți spune „Ai deja o evaluare asemănătoare”, iar **Ce diferă** îți arată factorii care sunt doar în pachet, cei care sunt doar în evaluarea ta și cei cu alte clase sau alte măsuri. Alegi **Folosește ce ai**, ca evaluarea ta să rămână cum e, sau **Adaugă ca nouă**, ca fișa din pachet să intre separat; rândul rămâne marcat până alegi. O fișă la fel cu o evaluare a ta nu se adaugă din nou, iar o fișă copiată în pachet după alta urmează alegerea celei pe care o copiază;
- **Numele în bibliotecă**, cu **Redenumește**. Un nume pe care biblioteca îl are deja e propus cu numele clientului după el, de exemplu „Bucătar (Hotel Royal)”;
- **Sistemul de muncă**: mijloacele de producție, mediul de muncă și expunerea, preluate din document;
- **Factorii**, cu câți se preiau. Sub el vezi factorii de verificat, iar **Arată toți** îi arată pe toți, grupați pe componente. Fiecare are bifa lui, descrierea, grupa, clasele, nivelul calculat, măsurile și câmpurile planului de prevenire. **Modifică** deschide factorul în formularul fișei de evaluare, ca să-i schimbi clasele, măsurile sau planul, iar **Vezi în document** deschide fișierul la rândul lui.

Clasele de gravitate și de probabilitate sunt judecata evaluatorului, așa că le preluăm cum sunt scrise și nu le schimbăm noi. Îți arătăm însă, la factor: un nivel tipărit care nu se potrivește cu grila metodei, de exemplu „Nivel în document: 2, după metodă: 3” (fișa ia nivelul grilei), o consecință care ține de altă clasă de gravitate, un factor citit dintr-un PDF („Verifică”), fiindcă dintr-un PDF factorul, măsurile lui și câmpurile planului sunt transcrise, nu copiate, și o persoană numită în câmpurile planului, care rămâne doar pe fișa clientului, nu și în bibliotecă. Când la o fișă cele mai multe niveluri tipărite se potrivesc cu grila doar dacă citești gravitatea în locul probabilității și invers, cardul îți spune „Gravitatea și probabilitatea par inversate în document: verifică clasele”; nici atunci nu le inversăm noi. Persoana care răspunde, din plan, o scriem întreagă când e unul dintre rolurile obișnuite: „Cond. loc munca”, „Responsabil SSM,SU” sau „Serv extern” devin „Conducătorul locului de muncă”, „Responsabilul SSM și SU” și „Serviciul extern de prevenire și protecție”, fiecare o singură dată și în această ordine; ce nu e unul dintre aceste roluri rămâne cum e scris, după ele. Un factor inacceptabil fără nicio măsură îți spune că planul de prevenire nu are măsură pentru el și că nivelul lui cere una. Când pe fișă e trecut un nivel acceptabil, dar clasele dau după grilă un nivel inacceptabil, mesajul le spune pe amândouă, de exemplu „Pe fișă e trecut nivelul 3, dar gravitatea 7 și probabilitatea 2 dau nivelul 4”: de aceea factorul nu are rând în plan. Adaugi o măsură cu **Modifică** sau verifici clasele. Un factor căruia îi lipsește o clasă, componenta sau grupa rămâne nebifat până le alegi cu **Modifică**. Un rând din planul de prevenire care e pentru un post, dar al cărui risc nu e pe fișa postului, îl vezi pe cardul acelei fișe, sub **Rânduri fără factor**, strâns până îl deschizi. **Adaugă ca factor** îl pune pe fișă cu măsurile, termenul și persoana care răspunde din document, iar tu îi alegi clasele, componenta și grupa; altfel rămâne doar în document. Rândurile pe care nu le-am putut pune pe nicio fișă le vezi la sfârșit, sub **Rânduri pe care nu le preluăm**, cu **Vezi în document**; dacă un rând ține de un post, îl adaugi după confirmare pe fișa lui.

La confirmare, evaluările pe care le adaugi intră în bibliotecă, cu factorii, măsurile, textele sistemului de muncă și câmpurile planului ca valori propuse. Factorii bifați se scriu pe fișele de evaluare ale clientului, după alegerea ta pentru fiecare post, iar fișele care lipsesc se creează. Fiecare factor scris la client arată din ce evaluare a bibliotecii vine, așa că **Unde este folosită** e corectă de la început. Evaluarea riscurilor și planul de prevenire ale clientului se actualizează apoi ca după orice schimbare a fișelor.

Citirea evaluărilor de risc folosește 15 credite de fiecare dată când le citim. Dacă nu reușește, vezi motivul și **Citește din nou**, iar creditele citirii care nu a reușit îți sunt date înapoi. Totalul importului le arată separat, de exemplu „Importul a folosit 75 de credite (25 + 35 pentru instrucțiunile proprii + 15 pentru evaluările de risc)”.

### După crearea clientului

După ce creezi sau completezi clientul, rămâi pe pagina importului. Dacă pachetul avea instrucțiuni proprii sau evaluări de risc pe care nu le-ai confirmat încă, pagina începe cu **Ce mai ai de făcut**: ziua până la care le poți confirma, de exemplu „Până pe 19 noiembrie · mai ai 14 zile”, apoi câte un rând pentru IPSSM, IPSU și evaluările de risc, fiecare cu ce e de verificat și cu butonul care te duce la el: **Verifică IPSSM**, **Verifică IPSU** sau **Verifică evaluările**. O parte care încă se citește sau a cărei citire s-a oprit își arată starea în rând, iar butonul ei e **Vezi IPSSM**, **Vezi IPSU** sau **Vezi evaluările**. Dedesubt, la **Gata**, sunt datele clientului, cu **Deschide clientul**, și ce ai confirmat deja, fiecare cu **Vezi**. Ce n-ai confirmat în cele 14 zile apare separat, la **Au expirat**.

Când nu mai ai nimic de confirmat, pagina spune „Importul e încheiat.” și ce s-a preluat, de exemplu „Datele clientului, instrucțiunile și evaluările de risc sunt preluate. Poți genera documentația clientului.”, cu **Deschide clientul**. Sub ea, la **Ce am preluat**, vezi datele clientului și fiecare parte confirmată.

La importurile unui client revii oricând din tabul lui **Detalii**, din cardul **Importuri din documente**: fiecare import confirmat al clientului, cel mai nou primul, cu ziua, cine l-a pornit, dacă a creat sau a completat clientul, câte fișiere a avut și ce a mai rămas din el: „2 de verificat, până pe 19 nov.”, **Încheiat** sau, când a trecut termenul, „Instrucțiunile au expirat” ori „Evaluările au expirat”. Rândul deschide pagina importului.

## Importul lucrătorilor din fișe

Documentația nu are lista lucrătorilor. Oamenii, cu CNP-ul, data angajării și toate instruirile lor, sunt pe fișele individuale de instruire. Importul lucrătorilor le citește din fotografii și îți propune lucrătorii clientului, cu instruirile și testele de pe fișe.

### De unde pornești

Importul lucrătorilor pornește doar din tabul **Lucrători** al unui client. Ai trei căi:

- **Adaugă lucrător**: completezi tu datele unei persoane, fără import;
- **Importă din fișele găsite în documentație**, cu numărul de fotografii: deschide încărcarea cu fotografiile de fișe găsite la importul documentației deja adăugate;
- **Importă din fotografii noi**: încarci tu fotografiile. Când nu există fișe găsite în documentație, butonul se numește **Importă din fișele de instruire**.

La un client fără lucrători, cele trei căi apar ca trei carduri în locul listei. La un client cu lucrători, sunt butoane deasupra listei.

Dacă clientul nu are încă posturi de lucru, încărcarea îți recomandă să imporți întâi documentația: ea aduce posturile, iar lucrătorii intră direct pe ele. Poți merge și mai departe, cu **Continuă fără posturi**, și adaugi posturile pe parcurs.

### Fișele găsite în documentație

Când documentația importată a unui client conține fotografii de fișe de instruire, aplicația ți le oferă cât timp niciun import de lucrători nu le-a folosit: pe tabul **Lucrători**, ca a doua cale, și în fereastra de încărcare, „Din documentația importată pe …”, cu **Adaugă-le**. Astfel le găsești și dacă ai pornit de la fotografii noi.

O fotografie găsită se citește și se păstrează la fel ca una încărcată de tine. Dacă importul care a luat-o e abandonat sau se oprește, ți se oferă din nou.

### Ce fotografiezi

Fotografiezi fișele individuale de instruire pe hârtie ale fiecărui lucrător:

- fișa SSM și fișa SU, fiecare cu fața și verso-ul;
- fiecare pagină de continuare a tabelului instruirilor periodice;
- declarația privind traseul de deplasare, dacă e pe o pagină separată.

O pagină pe fotografie, întreagă, dreaptă și clară, cu rubricile de semnătură vizibile. Ordinea nu contează: după citire, aplicația grupează paginile pe persoane. Ține însă toate paginile unei persoane în același import.

Poți încărca fotografii JPG, PNG și HEIC, PDF-uri scanate, un folder sau o arhivă ZIP. Arhiva o deschide aplicația înainte de încărcare, așa că vezi ce intră; o arhivă 7z sau RAR o dezarhivezi întâi și tragi folderul. Ce nu e fotografie sau PDF e pus deoparte și nu se încarcă. Fotografiile le micșorăm înainte de încărcare, ca să urce mai repede.

Fotografiile alese le vezi în fereastră ca miniaturi. Un clic pe una o deschide mare, ca să verifici că fișa se citește; treci la următoarea cu butoanele de jos sau cu săgețile tastaturii. O fotografie greșită sau în plus o scoți cu semnul x din colțul miniaturii, care apare când treci cu mouse-ul peste ea și se vede mereu pe telefon, ori cu **Scoate fotografia** din fotografia deschisă. Numărul fotografiilor și totalurile se actualizează pe loc, iar o fișă găsită în documentație, odată scoasă, îți rămâne oferită cu **Adaugă-le**. PDF-urile și, în cele mai multe browsere, fotografiile HEIC nu se pot arăta înainte de încărcare, dar se citesc la fel ca celelalte.

### Cât intră într-un import

Într-un import de lucrători intră cel mult 500 de fotografii sau pagini PDF, cel mult 25 MB un fișier și 1 GB în total. În fereastra de încărcare vezi câte fotografii ai ales și cât ocupă; când te apropii de una dintre limite, vezi și cât ai folosit din fiecare.

Fotografiile JPG și PNG se socotesc după ce le micșorăm, așa că o fotografie mare nu e oprită când o alegi, iar totalul îl vezi aproximativ, de exemplu „cam 250 MB”. Dacă o fotografie are tot peste 25 MB după micșorare, îți spunem care e. Un PDF sau o fotografie HEIC de peste 25 MB e pusă deoparte de cum o alegi.

Un client mai mare îl imporți în mai multe importuri, cu fișele fiecărei persoane în același import. Un import făcut mai târziu completează lucrătorii creați de cel dinainte, ca pe orice lucrător pe care clientul îl are deja.

### Citirea fișelor

După **Încarcă și citește**, aplicația pregătește fotografiile, citește fiecare pagină, le grupează pe persoane și verifică datele. Durează câteva secunde pe pagină. Poți închide pagina: importul rămâne pe tabul **Lucrători** al clientului, cu pasul la care a ajuns, și îl deschizi de acolo când persoanele sunt gata de verificat. Cât timp citim, un clic pe o fotografie o deschide mare, cu pasul la care a ajuns citirea ei. Dacă ai pornit tu importul și lucrezi între timp pe altă pagină din aplicație, îți apare o notificare când fișele sunt citite, cu câte persoane te așteaptă și **Verifică persoanele**, care te duce direct la ele. Până confirmi sau renunți, îl regăsești de pe orice pagină și în butonul **Importuri** din capul paginii.

O pagină ajunge la o persoană după CNP, dacă cifra lui de control se potrivește; fără un CNP valid, după nume, chiar dacă e scris puțin diferit pe pagini sau cu prenumele înaintea numelui; fără CNP și fără nume, după marcă. Două prenume care diferă doar printr-o literă la sfârșit, ca Daniel și Daniela, sunt două persoane. O pagină de continuare fără niciunul dintre ele merge după pagina dinaintea ei, în ordinea încărcării, și e semnalată „O pagină pusă după ordine”.

## Lista persoanelor

**Verifică lucrătorii propuși** arată câte persoane au fost găsite și câte ai verificat. Fiecare persoană e:

- **De verificat**: încă nu ai trecut prin ea sau are ceva de hotărât;
- **Verificat**: o persoană fără nimic de hotărât devine verificată când treci de pe pagina ei la următoarea; una cu ceva de hotărât, după ce ai hotărât. Redevine **De verificat** când o corectură, o pagină pe care i-o dai sau o alegere îi lasă din nou ceva de hotărât;
- **Lăsat deoparte**: nu se creează. O iei înapoi oricând, de pe pagina ei.

Lista se filtrează după aceste stări. Persoanele de verificat sunt împărțite în **Cu ceva de hotărât** și **Încă nedeschise**. **Continuă cu …** te duce la următoarea persoană de verificat.

Deasupra listei apar posturile scrise pe fișe care nu se potrivesc exact cu un post al clientului și locurile de muncă de ales. Ce hotărăști acolo se aplică tuturor celor care au același text pe fișă.

### Fotografiile neatribuite

O pagină pe care aplicația nu o poate lega de nicio persoană apare sub listă, cu ce s-a citit pe ea. **Atribuie…** o dă unei persoane de pe fișe sau o lasă deoparte. O pagină lăsată deoparte nu ajunge la fișierele nimănui.

## Pagina unei persoane

Pe pagina unei persoane vezi, alături, fotografiile fișelor ei; un clic pe una o mărește. Sus sunt lucrurile de hotărât, apoi datele citite, pe grupuri, și instruirile, pe domenii. O valoare citită greșit o corectezi cu **Schimbă**. Cu butoanele de jos treci la persoana anterioară sau la următoarea.

Ca să fie creat, un lucrător are nevoie de nume, prenume, funcția din contract, data angajării și un post. Emailul și telefonul nu sunt obligatorii: când lipsesc, vezi „Fără email sau telefon. Îl adaugi când îl inviți în portal.” Când fișele aceleiași persoane scriu valori diferite, de exemplu două date ale angajării, alegi una.

### Postul de lucru

Funcția scrisă pe fișă e potrivită cu posturile clientului:

- când se potrivește exact cu un post, lucrătorul îl primește fără să te întrebe;
- când seamănă cu un post, ți-l propune, iar tu îl confirmi sau alegi altul;
- când nu seamănă cu niciunul, alegi un post existent sau **Adaugă un post nou**, care deschide aceeași fereastră ca în tabul **Posturi de lucru**.

Aceeași funcție scrisă pe fișele mai multor persoane o hotărăști o singură dată, pentru toate. Funcția de pe fișă rămâne funcția din contract a lucrătorului. Importul nu creează niciodată un post fără să-l alegi tu.

### Locul de muncă

Locul de muncă scris pe fișă e tratat ca postul: dacă se potrivește cu un loc de muncă al clientului, lucrătorul îl primește; dacă nu se potrivește sau fișa nu scrie niciunul, alegi tu, o singură dată pentru toți cei cu același text. La un client cu un singur loc de muncă nu te întreabă nimic.

Poți alege și **Fără loc de muncă deocamdată**. Lucrătorul se creează, iar locul îl completezi după; până atunci, fișa lui individuală îl arată ca lipsă, când clientul are mai multe puncte de lucru.

### CNP-ul de pe fișă

CNP-ul citit e verificat după cifra de control și după data nașterii. Când o cifră nu se citește și data nașterii o lămurește, aplicația îți propune CNP-ul corectat. Altfel îl scrii tu sau alegi **Lasă fără CNP** și îl completezi mai târziu, pe pagina lucrătorului.

Un CNP valid, dar greșit, îl corectezi la **Date personale**. Un CNP a cărui cifră de control nu se potrivește nu e folosit nici la gruparea paginilor, nici la găsirea unui lucrător existent.

### Un lucrător pe care clientul îl are deja

O persoană cu același CNP ca un lucrător al clientului, sau cu același nume și aceeași dată a nașterii, nu se dublează: importul îl completează. Câmpurile goale se umplu de pe fișă, iar o valoare care diferă de cea din aplicație apare la **Diferă de aplicație**, unde valoarea din aplicație rămâne dacă nu alegi **Folosește valoarea de pe fișă**.

O persoană fără un CNP valid și fără data nașterii, de obicei cu paginile de continuare aduse de un import ulterior, îți e propusă ca lucrătorul clientului cu același nume, dacă e unul singur. Confirmi că e el sau alegi că e altă persoană, care se creează ca lucrător nou. Două persoane din import nu pot completa același lucrător.

O instruire de pe fișă care e deja în aplicație, același domeniu, același fel și aceeași zi, nu se adaugă a doua oară. Vezi câte sunt și le poți afișa.

### Cine a plecat din firmă

O fișă cu data plecării e propusă nebifată. Bifează **Preia-l ca fost lucrător, cu instruirile lui** dacă vrei să-l ai în evidență: apare la **Foști lucrători**. Dacă ștergi data plecării, persoana e propusă bifată, ca lucrător actual.

Când persoana se potrivește cu un fost lucrător al clientului, vezi asta pe pagina ei. Dacă fișa scrie o dată a angajării de după plecarea lui, persoana a fost reangajată, iar în aplicație o reangajare e un lucrător nou (vezi [Reangajarea](/clienti/angajati/plecare/#reangajarea)). Importul nu reactivează fostul lucrător, iar persoana are ceva de hotărât până alegi una dintre:

- o creezi ca lucrător nou; importul nu-i trece CNP-ul și marca fostului lucrător, iar după import le poți completa pe rândul nou;
- corectezi data angajării, dacă a fost citită greșit;
- o lași deoparte.

### Rândurile de instruire

Se preiau toate instruirile de pe fișă, nu doar cele de care depinde termenul: introductiv-generală, la locul de muncă, periodice și suplimentare, cu ziua, durata, cine a instruit, funcția lui și materialul. „Admis la lucru”, cu ziua și cine l-a admis, merge la instruirea la locul de muncă. Un rând îl corectezi cu **Schimbă** sau îl scoți debifându-l.

Unele rânduri poartă o etichetă:

- **Doar luna pe fișă**: fișa scrie doar luna și anul; ziua devine prima zi a lunii;
- **Din tematica clientului**: instructorul, funcția lui sau materialul lipseau de pe fișă și au fost luate din tematica și instructorul clientului;
- **Nesemnat pe fișă**: rândul e completat, dar rubrica de semnătură e goală; e propus nebifat și se preia doar dacă îl bifezi;
- **Semnătura nu se vede clar**: verifică pe fotografie.

O durată scrisă în ore, de exemplu „8 ore” sau „1h30”, e citită în minute. Sunt semnalate, dar nu opresc nimic:

- o instruire SSM periodică cu altă durată decât 60, 90 sau 120 de minute;
- o instruire SSM la angajare sau suplimentară mai scurtă de o oră, cât cer normele cel puțin (HG 1425/2006, art. 80¹);
- o instruire SU la angajare mai scurtă de 8 ore, cât cer normele (OMAI 712/2005, art. 13 și 18);
- o instruire SU periodică mai scurtă de 2 ore (OMAI 712/2005, art. 21);
- o instruire SU suplimentară mai scurtă de 15 minute;
- o dată dinaintea angajării.

Se preiau așa dacă nu le schimbi. O instruire cu data în viitor sau fără o valoare obligatorie trebuie corectată.

Testul anual SU consemnat în tabelul instruirilor periodice devine un rezultat de test, nu o instruire. Dacă nu i s-a citit ziua sau examinatorul, îl ai de completat: alege **Schimbă** pe rândul testului.

**După import** îți arată cum va arăta instruirea lucrătorului în aplicație cu alegerile de acum: starea, ultima instruire periodică și testul la angajare. Rândurile mai multor persoane cu același domeniu, același fel, aceeași zi, același instructor, aceeași durată și același material devin o singură instruire în **Instruiri ținute**, cu toți participanții ei. Altfel devin instruiri separate în aceeași zi.

### Testul la angajare verificat pe fișă

Instruirea la angajare se încheie cu testul. În SSM, rezultatul se consemnează în fișă (HG 1425/2006, art. 89 alin. (1) și (2)); în SU, cei instruiți sunt verificați pe bază de teste la sfârșitul instructajului introductiv general și înainte de admiterea definitivă la lucru (OMAI 712/2005, art. 14 și 20). Pe fișă, cel care a verificat cunoștințele semnează în rubrica „Verificat”. Când semnătura lui se vede, importul înregistrează testul la angajare ca promovat pe hârtie, cu el ca examinator: testul SSM din blocul fișei SSM, testul SU din blocul fișei SU. Testul ia ziua rândului semnat, așa cum o lași după corecturi, și urmează paginile când le muți de la o persoană la alta.

Când semnătura nu se vede, vezi „Testul la angajare nu a putut fi verificat pe fișă: semnătura nu se vede clar sau lipsește.” Dacă semnătura e pe original, bifează **Testul la angajare: verificat pe fișă** și completează examinatorul, dacă nu s-a citit. Altfel, lucrătorul ajunge cu testarea în starea **Neverificat pe fișă** (vezi [Starea testării](/clienti/angajati/#starea-testării)), iar rezultatul îl poți înregistra și mai târziu, pe pagina lui.

## Salvarea și cele 14 zile

Tot ce verifici și schimbi se salvează pe loc. Poți închide pagina și continua mai târziu: importul deschis apare pe tabul **Lucrători** al clientului, cu câte persoane ai verificat și **Continuă**.

Un import la care nu mai lucrezi se păstrează 14 zile de la ultima schimbare; data o vezi pe card, „Se păstrează până pe …”. După aceea se oprește, iar fotografiile încărcate se șterg după încă 14 zile. La fel se întâmplă când alegi **Renunță la import**: nu se creează și nu se modifică niciun lucrător. Separat, păstrăm o copie a fiecărui import 12 luni de la încheierea lui, ca să îmbunătățim citirea documentelor, așa cum descrie acordul de prelucrare a datelor; la ea avem acces doar noi.

## Crearea lucrătorilor

Lucrătorii se creează o singură dată, la final, cu **Creează lucrătorii…**. Fereastra îți arată ce se adaugă: lucrătorii noi, cei existenți care se completează, foștii lucrători preluați, instruirile ținute, testele la angajare verificate pe fișă și fotografiile. Arată și ce rămâne de făcut după: emailurile și telefoanele lipsă, testele neverificate pe fișă, traseele de deplasare lipsă și valorile neobișnuite. Dacă la creare o valoare tot nu se poate salva, fereastra le numește pe toate cele refuzate, nu doar prima, iar tu le corectezi pe paginile persoanelor și încerci din nou.

Poți crea lucrătorii și înainte să-i verifici pe toți. Fereastra îi numește pe cei încă de verificat: ei și cei lăsați deoparte rămân în afara acestui import, iar un import nou îi poate aduce mai târziu. Nu poți crea doar o parte acum și restul din același import.

## După import

Lucrătorii apar în lista clientului, cu instruirile, testele și starea lor calculată ca la orice lucrător. Pe tabul **Lucrători** vezi câți au fost creați și ce urmează.

Fiecare lucrător are la **Fișiere**, pe tabul **Date**, un folder „Fișe importate pe …” cu fotografiile fișelor lui. Dintr-un PDF scanat cu fișele mai multor persoane, fiecare lucrător primește doar paginile lui, ca imagini, iar PDF-ul întreg rămâne o singură dată la fișierele clientului, în **Alte documente**.

Instruirile importate poartă eticheta **Transcris de pe fișa pe hârtie** și rândul „Semnat pe hârtie: …”, cu rubricile semnate pe fișă. Pentru ele nu se cere nicio semnătură, nici în aplicație, nici în portal, iar pe fișa individuală din aplicație apar cu mențiunea „semnat pe hârtie”. Instruirile ținute de acum înainte se semnează ca de obicei.

### Originalele rămân la client

Ce ai în aplicație e o transcriere a fișei, nu un înlocuitor al ei. Fișa de instruire individuală pe hârtie rămâne originalul semnat: o păstrează conducătorul locului de muncă, la client, de la angajare până la încetarea raporturilor de muncă (HG 1425/2006, art. 81 alin. (4) și (5)); de fișa SU răspunde tot conducătorul locului de muncă (OMAI 712/2005, art. 50). Normele nu prevăd înlocuirea fișei pe hârtie cu o transcriere a ei, așa că originalul rămâne la client.

### Nicio instruire și niciun test de refăcut

Lucrătorii importați lucrează deja la client, așa că nu li se cere din nou instruirea la angajare. Instruirea introductiv-generală se face la angajare, la detașarea sau delegarea unui lucrător de la altă firmă și pentru lucrătorul pus la dispoziție de un agent de muncă temporară (HG 1425/2006, art. 83). Schimbarea prestatorului SSM sau transcrierea fișelor nu e niciunul dintre aceste cazuri.

Nici testul la angajare nu li se mai cere: testul care a încheiat o instruire la angajare de pe hârtie s-a dat pe hârtie (HG 1425/2006, art. 89; OMAI 712/2005, art. 14 și 20). Nu apare în portal și nu se numără pe **Dashboard**. Starea testării unui lucrător importat e, pe fiecare domeniu, **Promovat**, **Neverificat pe fișă** sau, în SU, **Anual scadent**; e **Fără test** în domeniul în care fișele nu au instruirea la angajare.

Termenul următoarei instruiri periodice se socotește de la datele de pe fișe. OMAI 712/2005 cere o verificare anuală pe bază de test, consemnată în fișa individuală (art. 30); aplicația o cere la 12 luni de la ultimul test SU promovat. Dacă fișa nu consemnează niciun test anual, lucrătorul poate apărea cu testarea SU **Anual scadent** imediat după import. E o obligație pe care clientul o are cu adevărat.

### Portalul și actul adițional după import

Importul nu invită pe nimeni în portal: invitația rămâne o acțiune a ta. După confirmare, tabul **Lucrători** îți arată **Invită în portal lucrătorii din fișe**, cu care îi inviți pe toți odată; emailurile și telefoanele pe care fișele nu le au le scrii acolo. Cardul rămâne pe tab și la vizitele următoare, cu data importului și câți lucrători mai ai de invitat, până când toți sunt invitați sau în portal ori până alegi **Ascunde**. Ascuns, nu mai apare pentru acel import în browserul în care lucrezi. Dacă mai multe importuri au lucrători de invitat, cardul îl arată pe cel mai recent; după ce îi inviți sau îl ascunzi, apare următorul.

Lucrătorii importați sunt lucrători existenți, cu contractul de muncă încheiat înainte. Ca să semneze instruirile în portal, semnează întâi actul adițional privind semnarea electronică. Instruirile de pe fișe rămân semnate pe hârtie: în portal apar ca transcrise de pe fișa pe hârtie, fără nimic de semnat. Vezi [Portalul și actul adițional](/clienti/angajati/portal-si-act-aditional/).

## O problemă cu importul

Dacă aplicația a citit greșit un document, a lăsat deoparte ceva ce trebuia citit sau citirea s-a oprit, spune-ne. Ai **Raportează o problemă cu importul** în capul paginii unde verifici importul unui client, în capul paginii unde verifici importul lucrătorilor și pe paginile instrucțiunilor proprii și ale evaluărilor de risc din import. Pe un import a cărui citire s-a oprit, butonul e în mesajul care spune de ce. Butonul rămâne și după ce ai creat sau completat clientul ori ai creat lucrătorii, în capul paginii importului, așa că poți semnala o greșeală pe care o observi abia după confirmare.

Când îl apeși, aflăm despre ce import e vorba, așa că ne uităm la documentele lui și la ce s-a citit din ele fără să ni le trimiți din nou. Se deschide apoi fereastra de suport, aceeași ca la **Raportează o problemă** din meniul lateral: scrie acolo ce nu e în regulă, de exemplu ce valoare e greșită și în ce document, iar răspunsul îl primești tot acolo. Dacă fereastra de suport nu se poate deschide în browserul tău, aplicația îți spune că am primit semnalarea și îți arată adresa contact@ssmusor.ro, cu **Copiază adresa** și **Deschide aplicația de e-mail**, ca să ne scrii acolo ce nu e în regulă.

Semnalarea nu folosește credite și nu schimbă importul: îl verifici, îl confirmi sau renunți la el ca înainte.
