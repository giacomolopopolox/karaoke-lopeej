# Karaoke Night · Lopee J

Web app per gestire una serata karaoke:

- **Ospiti** (`/`): inquadrano il QR code e prenotano la canzone dal proprio telefono.
- **Regia** (`/regia`): la tua console. Gestisci la coda e scegli la base tra le versioni karaoke trovate su YouTube. Controlli anche il player: play, pausa, da capo, ±10 secondi.
- **Schermo** (`/schermo`): va sul proiettore o sulla TV. Mostra il video karaoke a tutto schermo, chi canta, i prossimi in coda e il QR per prenotare.

Quando arriva una richiesta, l'app cerca su YouTube la versione karaoke e mette in cima la più adatta. Premia i titoli con "karaoke", "testo" o "base" e i canali specializzati. Penalizza invece videoclip ufficiali, live, tutorial e remix. Se una base non ti convince, puoi scegliere un'alternativa, fare una nuova ricerca o incollare un link. Se un video non si può riprodurre sullo schermo, l'app passa da sola alla base successiva.

---

## 1. Crea la chiave di YouTube (gratis, 5 minuti)

1. Vai su <https://console.cloud.google.com> ed entra con il tuo account Google.
2. In alto clicca sul selettore dei progetti, poi su **Nuovo progetto**. Chiamalo per esempio `karaoke` e premi **Crea**.
3. Dal menu apri **API e servizi → Libreria**, cerca **YouTube Data API v3** e premi **Abilita**.
4. Vai su **API e servizi → Credenziali → Crea credenziali → Chiave API** e copia la chiave.
5. Consigliato: clicca sulla chiave, scegli **Limita chiave → YouTube Data API v3** e salva.

La quota gratuita è di 10.000 unità al giorno. Una ricerca ne usa 100, quindi hai **circa 100 ricerche al giorno**. Le ricerche ripetute usano la memoria (cache) e non consumano quota. In regia vedi quante ricerche hai fatto oggi.

Senza chiave l'app funziona lo stesso, ma la base la scegli incollando il link di YouTube a mano.

## 2. Provala sul tuo computer

1. Installa **Node.js** versione LTS da <https://nodejs.org>.
2. Estrai lo zip in una cartella.
3. Nella cartella copia il file `.env.example`, rinomina la copia in `.env` e compila:
   - `YOUTUBE_API_KEY=` la chiave del passo 1
   - `DJ_PIN=` un PIN tuo per regia e schermo
4. Apri il terminale nella cartella:
   - **Mac**: tasto destro sulla cartella → *Servizi* → *Nuovo terminale nella cartella*
   - **Windows**: apri la cartella, scrivi `cmd` nella barra dell'indirizzo e premi Invio
5. Scrivi questi due comandi:
   ```
   npm install
   npm start
   ```
6. Il terminale mostra gli indirizzi:
   - Regia: `http://localhost:3000/regia`
   - Schermo: `http://localhost:3000/schermo`
   - Ospiti: `http://192.168.x.x:3000/` (funziona per chi è sulla **stessa Wi-Fi** del computer; il QR in regia punta già lì)

   Se il computer chiede se consentire le connessioni in entrata a Node, rispondi **Consenti**.

Per spegnere l'app premi `Ctrl + C` nel terminale. Coda e impostazioni restano salvate nella cartella `data/`.

## 3. Mettila online (così gli ospiti usano i loro dati mobili)

Con [Render](https://render.com), piano gratuito:

1. Crea un account su <https://github.com> e un nuovo repository, per esempio `karaoke-lopeej`. Carica tutti i file dello zip con **Add file → Upload files**, **tranne** il file `.env`.
2. Crea un account su <https://render.com> ed entra con GitHub.
3. **New → Web Service**, scegli il repository. Render legge le impostazioni da `render.yaml`. Se le chiede: Build `npm install`, Start `npm start`, piano **Free**.
4. In **Environment** aggiungi `YOUTUBE_API_KEY` e `DJ_PIN`.
5. Dopo il primo avvio Render ti dà un indirizzo tipo `https://karaoke-lopeej.onrender.com`. Aggiungilo come `PUBLIC_URL` nelle variabili e riavvia.

Due cose da sapere sul piano gratuito:
- Dopo 15 minuti senza visite il server si addormenta e al risveglio impiega circa un minuto. Apri la regia qualche minuto prima della serata.
- A ogni riavvio coda e storico ripartono da zero. Per una serata va bene.

## 4. Durante la serata

1. Sul computer collegato al proiettore apri **/schermo**, inserisci il PIN, premi **Attiva schermo** e porta la finestra a schermo intero.
2. Su portatile, tablet o telefono apri **/regia** con lo stesso PIN.
3. Fai inquadrare il QR (è sullo schermo e in regia). Le richieste arrivano in coda con la base già cercata.
4. Premi **♫** su una canzone per vedere le basi alternative con anteprima, durata ed etichette. Con **Usa questa** cambi base, con **Cerca altre versioni** scrivi una ricerca tua (es. *"albachiara karaoke tonalità bassa"*), oppure incolli un link.
5. **Chiama sul palco / Avanti**: la base viene caricata sullo schermo in pausa. Quando il cantante è pronto premi **Play**.
6. Scorciatoie in regia: **spazio** = play/pausa, **N** = prossimo cantante.

## Pubblicità sui video

L'app usa il player ufficiale di YouTube, quindi la pubblicità la decide YouTube. Il modo per eliminarla è **YouTube Premium**: nel browser dello schermo entra su youtube.com con l'account Premium e di norma anche il player integrato non mostra spot. L'app non contiene blocchi pubblicitari, perché violerebbero i termini d'uso di YouTube.

Ricorda anche che i termini di YouTube riguardano l'uso personale. Per una serata pubblica verifica col locale la copertura SIAE della musica riprodotta.
