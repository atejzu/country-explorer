# Country Explorer

Country Explorer je spletna aplikacija, izdelana v okviru programerske naloge za Petrol.
Omogoča iskanje držav, filtriranje po regijah, razvrščanje po imenu ali številu
prebivalcev ter ogled podrobnosti posamezne države z zemljevidom Leaflet /
OpenStreetMap. Stanje raziskovalnika je mogoče deliti prek parametrov v URL-ju.

Poleg osnovnih zahtev aplikacija vključuje avtentikacijo uporabnikov, priljubljene
države ter javne razprave in komentarje. Podatki uporabnikov, priljubljenih držav,
razprav in komentarjev se shranjujejo v PostgreSQL. Prijavljeni uporabniki lahko
ustvarjajo vsebino ter urejajo in brišejo svojo vsebino, kadar je to dovoljeno.
Prvi komentar trajno zaklene urejanje in brisanje razprave, komentiranje ter urejanje
in brisanje lastnih komentarjev pa ostanejo na voljo.

Aplikacija vključuje tudi obravnavo napak, optimistične posodobitve priljubljenih
držav, zaščito CSRF, upravljanje uporabniških sej, predpomnjenje podatkov o državah,
Docker Compose konfiguracijo ter avtomatizirane backend in frontend teste.

**Tehnologije:** Java 21, Spring Boot 4.1.1, Maven Wrapper, PostgreSQL 17, Flyway,
Angular 22, Node.js 24.15.0, npm, Vitest in Docker Compose. Nginx streže
produkcijsko SPA in posreduje `/api/*` v Spring Boot brez spreminjanja poti.

```text
backend/       Aplikacija Spring MVC, konfiguracija, testi in Dockerfile
frontend/      Angular SPA: standalone, strict, zoneless; konfiguracija Nginx
docs/          Izvirno besedilo naloge
compose.yaml   Storitve frontend, backend in PostgreSQL
.env.example   Varna predloga lokalne konfiguracije
```

## Zagon aplikacije

Predpogoji: Docker Engine/Desktop z Docker Compose in zagnanim Docker daemonom.
Za zagon prek Compose ni potrebna lokalna namestitev Jave ali Node.js.

API ključ pridobi na [uradni strani REST Countries za registracijo](https://restcountries.com/sign-up).
Kopiraj `.env.example` v `.env` in pridobljeni ključ vpiši v `REST_COUNTRIES_API_KEY`.
Nato zaženi Docker Compose:

```sh
cp .env.example .env
# V .env prilagodi lokalne podatke za dostop do baze in nastavi REST_COUNTRIES_API_KEY.
docker compose up --build
```

Odpri **http://localhost:8080**. Preverjanje delovanja: http://localhost:8081/actuator/health.
GET endpointi za države in razprave s komentarji, preverjanje delovanja ter
pridobitev CSRF piškotka, registracija in prijava so javni. Dostop do trenutnega
uporabnika, priljubljenih držav, spremembe razprav in komentarjev ter odjava
zahtevajo avtentikacijo; dostop do prihodnjih poti na backendu je privzeto zavrnjen.
Frontend ne posreduje zahtev do Actuatorja. PostgreSQL nima objavljenih vrat
na gostitelju, aplikacijska in diagnostična vrata pa so vezana na localhost.

`REST_COUNTRIES_API_KEY` je obvezen za zahteve po podatkih o državah. Samo backend
ga pošilja kot Bearer token v REST Countries v5. Prazen ključ omogoča zagon
in preverjanje delovanja; zahteve po državah vrnejo `503 COUNTRY_SERVICE_UNAVAILABLE`.
Poverilnice se ne posredujejo v gradnjo frontenda. Datoteka `.env` naj ostane
zasebna in zunaj sledenja v Gitu. `FRONTEND_ORIGIN` je rezerviran za poznejšo integracijo.

Flyway ob zagonu izvede `V1__create_users.sql`, `V2__create_favorite_countries.sql`
in `V3__create_discussions_and_comments.sql`.
Tabela `users` uporablja ID-je UUID, časovne oznake v UTC in unikatna indeksa
za uporabniško ime in e-pošto, ki ne razlikujeta med velikimi in malimi črkami.
Hibernate uporablja `validate`. Za gesla se uporablja delegirajoči kodirnik
Spring Security z oznako različice; za nove račune se uporablja
`pbkdf2@SpringSecurity_v5_8`. Gesla morajo imeti 8–72 znakov, brez zahtev glede
vrste znakov ali dodatne omejitve dolžine v bajtih UTF-8. Privzetega uporabniškega
računa ni.

```sh
docker compose ps
docker compose logs -f backend
docker compose down       # Ustavi storitve; ohrani podatkovni volumen.
docker compose down -v    # Destruktivna ponastavitev: izbriše tudi podatkovni volumen.
```

## Uporabniški vmesnik za države

`/` prikazuje kartice držav ter jasna stanja nalaganja, praznih rezultatov
in ponovnega poskusa ob napaki. `/countries/:code` neodvisno naloži vse podrobnosti
in prikaže stanje 404 za državo, ki je ni mogoče najti.
Iskanje posodobi URL po 300 ms; navigacija prekliče zastarele zahteve. Vsi podatki
o državah prihajajo prek Spring Boot. Zemljevidi uporabljajo standardne ploščice
OpenStreetMap, zastave pa URL-je slik, ki jih vrne API. Frontend testi ne potrebujejo
ključa za zunanji API.

## API za države

- `GET /api/v1/countries`: neobvezni parametri `search`, `region`, `sort=name|population`,
  `direction=asc|desc`; privzeto razvrščanje po imenu naraščajoče. Regije so Africa,
  Americas, Asia, Europe, Oceania in Antarctic (brez razlikovanja med velikimi in malimi črkami).
- `GET /api/v1/countries/{alpha3}`: podrobnosti o državi; kode so lahko zapisane
  z velikimi ali malimi črkami.

Običajna imena držav uporabljajo slovenska izvirna imena ali lokalizacijske podatke
Jave; če teh ni, se uporabi kanonično ime. Uradna imena uporabljajo slovenska izvirna
imena, kadar so na voljo, sicer kanonična. Iskanje upošteva tako imena, prikazana
v aplikaciji, kot kanonična imena.
Podatki o državah ostanejo v pomnilniku: celoten katalog z izbranimi polji in
podrobnosti posameznih držav imajo ločena predpomnilnika Caffeine s privzetim TTL
24 ur. Države se ne shranjujejo v PostgreSQL; tam so shranjeni uporabniški računi,
sklici na priljubljene države, razprave in komentarji.
Napake se vračajo v obliki Problem Details s stabilnimi vrednostmi `code`.

Konfiguracija backenda podpira `REST_COUNTRIES_BASE_URL`,
`REST_COUNTRIES_CONNECT_TIMEOUT` (privzeto `2s`), `REST_COUNTRIES_READ_TIMEOUT`
(privzeto `5s`), `COUNTRY_CATALOG_TTL` / `COUNTRY_DETAILS_TTL` (privzeto `24h`)
in `COUNTRY_DETAILS_MAXIMUM_SIZE` (privzeto `300`). Pri zagonu prek Compose je treba
neobvezne nastavitve poleg osnovnega URL-ja in ključa posredovati v okolje storitve backend.

## Avtentikacija na backendu

- `GET /api/v1/auth/csrf`: za neprijavljenega uporabnika vrne `204` in nastavi piškotek `XSRF-TOKEN`.
- `POST /api/v1/auth/register`: `username`, `email` in `password`; vrne `201` z DTO-jem
  trenutnega uporabnika. Registracija uporabnika ne prijavi. Konflikti brez razlikovanja
  med velikimi in malimi črkami vrnejo stabilne napake `409`, tudi pri sočasnih vnosih.
  Validacija vrne `400 VALIDATION_FAILED` z napakami posameznih polj.
- `POST /api/v1/auth/login`: JSON z `email` in `password`; vrne `200` z `{ "user": ... }`.
  Neveljavne poverilnice vrnejo enak `401 INVALID_CREDENTIALS` tako za neznano e-pošto
  kot za napačno geslo. Prijava poteka znotraj verige filtrov Spring Security.
- `GET /api/v1/users/me`: DTO lastnega računa ali `401 AUTHENTICATION_REQUIRED`.
- `POST /api/v1/auth/logout`: zahteva avtentikacijo, razveljavi sejo in vrne `204`.

Aplikacija uporablja strežniško HTTP sejo Spring Security. Ob prijavi zamenja ID
seje, po 30 minutah nedejavnosti pa seja poteče. Ne uporablja JWT ali tokena
v shrambi brskalnika. Sejni piškotek ima nastavitvi HttpOnly / SameSite=Lax;
za namestitev prek HTTPS nastavi `SESSION_COOKIE_SECURE=true`.
Seje so lokalne enemu backendu in se po njegovem ponovnem zagonu ne ohranijo.

Vse zahteve POST za avtentikacijo so zaščitene s CSRF. Pred spremembo pokliči
`/auth/csrf`, pošlji neobdelano vrednost piškotka `XSRF-TOKEN` v glavi `X-XSRF-TOKEN`
in po prijavi oziroma odjavi ponovno pridobi CSRF piškotek. JavaScript lahko bere
samo piškotek XSRF. Obravnava SPA v Spring Security ohranja zaščito pred BREACH.
Varnostne napake uporabljajo `application/problem+json`; napake CSRF in avtorizacije
vrnejo `403 ACCESS_DENIED`. Posredovanje zahtev znotraj istega izvora ne zahteva
konfiguracije CORS.

## Priljubljene države na backendu

- `GET /api/v1/users/me/favorites`: lastne priljubljene države; vsaka vsebuje
  `CountrySummaryResponse` pod `country` in shranjeno časovno oznako `favoritedAt`.
- `PUT /api/v1/users/me/favorites/{countryCode}`: doda veljavno državo, `204`.
- `DELETE /api/v1/users/me/favorites/{countryCode}`: odstrani državo, `204`.

Vsi trije endpointi zahtevajo avtentikacijo; PUT in DELETE zahtevata CSRF. Kode
so lahko zapisane z velikimi ali malimi črkami. Dodajanje in brisanje sta idempotentna,
tudi pri sočasnem dodajanju iste države; ponovno dodajanje ohrani prvotno časovno oznako.
PostgreSQL shrani samo UUID, lastnika, kodo države in časovno oznako. CountryService
preveri nove priljubljene države in seznam dopolni s podatki iz predpomnjenega
kataloga, brez ločene zahteve za podrobnosti vsake priljubljene države.
Napake pri podatkih o državah uporabljajo obstoječi kodi `404 COUNTRY_NOT_FOUND`
in `503 COUNTRY_SERVICE_UNAVAILABLE`.
Angular stran s priljubljenimi državami se naloži po potrebi in kartico, ki se
odstranjuje, ohrani na mestu, dokler strežnik ne potrdi izbrisa. Odjava in sprememba
seje počistita zaščiteno stanje.

## Razprave in komentarji na backendu

Razprave in komentarji brez gnezdenja se shranjujejo v PostgreSQL in so javno berljivi.
Vsebino ustvarjajo prijavljeni uporabniki; backend določi avtorja iz seje
in pri urejanju ter brisanju preveri lastništvo. Vsaka sprememba zahteva CSRF.

- `GET/POST /api/v1/countries/{countryCode}/discussions`: seznam ali ustvarjanje razprav.
  Ustvarjanje preveri natančno kodo alpha-3 prek predpomnjenega kataloga držav,
  še preden začne podatkovno transakcijo.
- `GET/PATCH/DELETE /api/v1/discussions/{id}`: branje, urejanje ali brisanje razprave.
- `GET/POST /api/v1/discussions/{id}/comments`: seznam ali ustvarjanje komentarjev.
- `PATCH/DELETE /api/v1/comments/{id}`: urejanje ali brisanje lastnega komentarja.

Prvi uspešno potrjeni komentar trajno zaklene naslov in besedilo razprave ter
avtorju onemogoči njen izbris, tudi če so pozneje izbrisani vsi komentarji.
Komentiranje ostane odprto, avtorji komentarjev pa jih lahko še vedno urejajo
ali brišejo. Skupni pesimistični zaklep vrstice zagotavlja zaporedno izvajanje
ustvarjanja komentarjev in urejanja oziroma brisanja razprave; vnos komentarja
in trajna oznaka zaklepa se potrdita ali razveljavita skupaj. Uporabniki, ki niso
lastniki, prejmejo `403`; lastniki zaklenjene razprave prejmejo `409 DISCUSSION_LOCKED`.

Seznami vrnejo `{items, page, size, totalItems, totalPages}`; številčenje strani
se začne z nič. Razprave so razvrščene od najnovejše (privzeto 10, največ 50 na stran),
komentarji pa od najstarejšega (privzeto 20, največ 100 na stran). Pri enakih časovnih
oznakah vrstni red določi UUID. Število komentarjev se izračuna; javni podatki
o avtorjih vsebujejo samo ID in uporabniško ime. Angular prebere oznako zaklepa
z backenda in nikoli ne sklepa o življenjskem ciklu razprave iz števila komentarjev.

## Razprave in komentarji v Angularju

Podrobnosti o državi naložijo razprave neodvisno od podatkov in zemljevida, po 10
na stran. `/discussions/:discussionId` je javna pot in deluje ob neposrednem obisku;
podatki o razpravi in komentarji se nalagajo neodvisno. Komentarji se prikazujejo
po 20 na stran, od najstarejšega. Izbris zadnjega elementa na poznejši strani
vrne uporabnika na veljavno stran.

Ustvarjanje razprave uporablja izvorni dialog brskalnika z ustrezno nastavljenim
fokusom. Urejanje razprave in komentarjev ostane na isti poti, uporablja Signal Forms
in ob napakah, po katerih je mogoč ponovni poskus, ohrani osnutke.
Brisanje zahteva potrditev. Spremembe počakajo na odgovor strežnika; ustvarjanje
ali brisanje komentarja nato osveži veljavno število komentarjev in stanje zaklepa
razprave. Odgovor `DISCUSSION_LOCKED` ob sočasni spremembi onemogoči urejevalnik,
ohrani osnutek, ki ga je mogoče kopirati, osveži podatke in pojasni trajni zaklep.

Neprijavljeni uporabniki dostopajo do istih možnosti ustvarjanja prek skupnega
poziva k prijavi. Ena namera za zaščiteno dejanje, shranjena samo v pomnilniku,
podpira priljubljene države, odpiranje urejevalnika razprave in premik fokusa
v polje za komentar. Običajne povezave za prijavo in registracijo ohranijo celoten
varen povratni URL, vključno s parametri in fragmentom. Po dejanski prijavi se
nadaljevanje v vmesniku izvede največ enkrat; razprave in komentarji se nikoli
ne oddajo samodejno. Preklic, odjava in potek seje počistijo namere; kliki
z modifikatorskimi tipkami in srednjim gumbom miške ne aktivirajo dejanj v izvornem
zavihku. Po registraciji je še vedno potrebna prijava.

Vsebina razprav in komentarjev se izriše kot besedilo z ustrezno obravnavo posebnih
znakov, ohranjenimi prelomi vrstic, slovenskim zapisom datumov in samo javnimi uporabniškimi imeni.
Možnosti za lastnika sledijo trenutni seji. Lokalna stanja nalaganja in napak,
dostopno listanje po straneh, izvorni potrditveni dialogi brskalnika, povrnitev
fokusa in prilagodljive postavitve uporabljajo obstoječi oblikovni sistem.

## Avtentikacija v Angularju

Ob zagonu inicializator aplikacije pokliče `/api/v1/auth/csrf` in nato
`/api/v1/users/me`, da obnovi sejo v signalni shrambi v pomnilniku.
Odgovor za neprijavljenega uporabnika je pričakovan. Omrežne napake ne preprečijo
brskanja po državah; strani za avtentikacijo ponudijo izrecen ponovni poskus,
oddaja obrazcev pa ostane onemogočena, dokler inicializacija ne uspe.

`/login` in `/register` uporabljata Angular Signal Forms z validacijo v slovenščini.
Registracija uporabnika ne prijavi samodejno. Prijava osveži CSRF, preden posodobi
prijavljeno stanje in preusmeri na preverjen lokalni povratni URL.
Ponovno uporabni `authGuard` ščiti `/account`, ki prikazuje samo osnovne podatke
trenutnega uporabnika. Odločitev backenda o avtorizaciji ostaja merodajna.

Nepotrjena prijava blokira nadaljnje oddaje obrazcev za avtentikacijo, dokler
izrecno preverjanje CSRF in seje ne ugotovi izida; zahteva za prijavo se nikoli
ne ponovi samodejno. Operacije s sejo so usklajene med navigacijo po straneh,
zastareli odgovori pa ne morejo nadomestiti novejše prijavljene identitete.
Časovno omejitev na odjemalcu imajo samo zahteve za branje, pri katerih je mogoč
ponovni poskus; zahteve POST za registracijo, prijavo in odjavo nimajo samodejne
časovne omejitve ali ponovnega poskusa.

Vgrajena podpora XSRF v Angularju obravnava piškotek `XSRF-TOKEN` in glavo
`X-XSRF-TOKEN` za relativne zahteve znotraj istega izvora. Odjava počisti lokalno
identiteto, osveži CSRF za neprijavljenega uporabnika in vrne na začetno stran,
tudi če je seja že potekla. Nepričakovan potek seje odstrani navigacijo za
prijavljenega uporabnika in prikaže kratko obvestilo. JWT, shranjevanje poverilnic
in tokeni v shrambi brskalnika se ne uporabljajo.
Navigacija do priljubljenih držav ostane vidna neprijavljenim uporabnikom in
uporablja obstoječi auth guard. Čakajoča zaščitena dejanja ostanejo v pomnilniku
in se zavržejo ob preklicu, poteku seje, odjavi ali nepotrjeni prijavi;
neuspele zahteve se nikoli ne ponovijo samodejno.

## Razvoj in testi

Predpogoji: Java 21, Node.js `>=24.15.0 <25`, npm in Docker za teste s PostgreSQL.
`frontend/.nvmrc` določa Node 24.15.0; Maven Wrapper samodejno prenese Maven.

```sh
cd backend
./mvnw verify             # Lokalni nadomestni HTTP strežnik in neodvisni PostgreSQL Testcontainer.
```

```sh
cd frontend
nvm use                  # Če uporabljaš nvm.
npm ci
npm run build
npm test -- --watch=false
npm start                # http://localhost:4200; /api/** se posreduje na localhost:8080.
```

Za lokalni zagon backenda brez vsebnika najprej ustavi celoten sklad
(vrata 8080 morajo biti prosta). Iz korena repozitorija v enem terminalu zaženi
samo PostgreSQL z vrati, vezanimi na lokalni vmesnik:

```sh
docker compose down
docker compose run --rm --name country-explorer-postgres-dev \
  -p 127.0.0.1:5432:5432 postgres
```

V drugem terminalu, prav tako iz korena repozitorija (predloga je združljiva z lupino):

```sh
set -a
. ./.env
set +a
export DB_URL="jdbc:postgresql://localhost:5432/$POSTGRES_DB"
export DB_USERNAME="$POSTGRES_USER"
export DB_PASSWORD="$POSTGRES_PASSWORD"
cd backend
./mvnw spring-boot:run
```

Razvojna baza uporablja isti poimenovani volumen kot Compose. Pred ponovnim
zagonom celotnega sklada jo ustavi z `docker stop country-explorer-postgres-dev`.
Backend testi uporabljajo neodvisne začasne vsebnike in ne dostopajo do tega volumna.
Testi avtentikacije preverjajo dejanski CSRF s piškotkom in glavo, HTTP seje,
sočasne vnose pri omejitvah unikatnosti v PostgreSQL ter migracije na svežih shemah
in pri prazni zgodovini Flyway.
Integracijski testi za države uporabljajo lokalni nadomestni HTTP strežnik;
ko so odvisnosti za gradnjo in slika PostgreSQL na voljo lokalno, testi ne
potrebujejo API ključa, internetne povezave ali dejanske kvote REST Countries.
