# Canta con Lopee J!

Web app per le serate karaoke di Lopee J.

- **Ospiti** (`/`): inquadrano il QR e cercano la canzone con i suggerimenti mentre scrivono, con copertina, titolo e artista. Possono aggiungere un selfie e devono dare il consenso privacy.
- **Regia** (`/regia`): la console del DJ. Gestisci la coda, scegli la base karaoke tra quelle trovate su YouTube e comandi il player. Puoi togliere un selfie non adatto.
- **Schermo** (`/schermo`): va sul proiettore. Mostra la chiamata sul palco con il selfie, il video karaoke, chi viene dopo e il QR per prenotare.
- **Informativa** (`/privacy`): spiega agli ospiti come vengono trattati nome e selfie.

## Aggiornare il sito su GitHub e Render

1. Apri il tuo repository su GitHub e premi **Add file → Upload files**.
2. Trascina **tutti i file** di questa cartella, tranne la cartella `node_modules` se presente. I file con lo stesso nome vengono sostituiti; `logo.png`, `privacy.html` e le due foto vengono aggiunti.
3. Premi **Commit changes**. Render ripubblica il sito da solo in un paio di minuti.
4. Facoltativo: su Render, in **Environment**, aggiungi `PRIVACY_CONTACT` con la tua email. Comparirà nell'informativa come contatto.

## Variabili su Render

| Nome | A cosa serve |
|---|---|
| `YOUTUBE_API_KEY` | ricerca automatica delle basi karaoke |
| `DJ_PIN` | PIN per regia e schermo |
| `PUBLIC_URL` | indirizzo del sito, per il QR code |
| `PRIVACY_CONTACT` | contatto mostrato nell'informativa (facoltativo) |

## Come funzionano le novità

**Suggerimenti mentre scrivi.** Vengono dal catalogo gratuito di Deezer, con iTunes come riserva, e non consumano la quota di YouTube. Quando l'ospite sceglie un brano, titolo e artista arrivano scritti correttamente e la ricerca della base karaoke diventa più precisa. Se il brano non c'è, l'ospite può sempre scriverlo a mano.

**Selfie.** Il telefono lo ritaglia e lo alleggerisce prima di inviarlo. Lo vedono solo la regia e lo schermo, mai gli altri ospiti. Viene **cancellato appena finisce l'esibizione**, oppure se l'ospite annulla la prenotazione. In regia puoi togliere un selfie in qualsiasi momento (pulsante **⊘** o **Togli selfie**) o spegnerli tutti dalle impostazioni.

**Consenso privacy.** Senza la spunta la prenotazione non parte. L'informativa è un modello di partenza: se fai serate in locali pubblici, falla controllare a chi ti segue per la parte legale.

**Musica d'attesa.** In regia incolla il link YouTube di un video, di un tuo mix o di una playlist (le playlist vengono riprodotte in ordine casuale). La musica parte da sola quando il palco è libero, mentre la base è caricata ma non ancora partita e a fine canzone. Sfuma quando premi **Play** e riparte da sola alla fine. Dalla regia regoli il volume, salti il brano o la fermi al volo. Mentre suona, il suo video si vede in trasparenza dietro la grafica dello schermo; con il cursore **Video sullo schermo** scegli quanto si vede (a 0 resta solo l'audio).

**Durante la canzone.** In alto a sinistra restano sempre foto, nome di chi canta, titolo e chi viene dopo; in alto a destra il QR per prenotare. Se un video ha il testo in alto, spegni **Sovraimpressioni durante la canzone** nelle impostazioni della regia.

**Chiamata sul palco.** Quando premi **Avanti** o **Chiama sul palco**, le tre barre del logo attraversano lo schermo e appaiono selfie, nome e canzone. Il video parte quando premi **Play**.

**Voto del pubblico.** In regia accendi **Voto aperto**. Quando premi Play, sul telefono degli ospiti compaiono 5 pulsanti con gli applausi (1 Delusione, 2 Zero entusiasmo, 3 Bene!, 4 Spettacolo!, 5 Standing ovation!). Ogni telefono vota una volta per esibizione e può cambiare voto finché si canta; chi canta non può votarsi. Sullo schermo si vede quanti voti sono arrivati, ma non la media. A fine canzone (o quando premi **Avanti**, oppure **Chiudi voto e mostra esito**) parte il pop-up con l'esito medio, grafica e suono diversi per ogni livello. In regia vedi la classifica, puoi proiettarla con **Classifica sullo schermo** e alla fine premere **Proclama il vincitore**. Per entrare in classifica servono almeno i voti minimi impostati (di base 3). Una canzone saltata con **Salta** non viene votata.

**Banner dello schermo.** Nel riquadro **Banner dello schermo** della regia cambi il testo sopra il logo (di base «Stasera alla console») e scegli fino a 6 cerchi: le due foto di Lopee J, il microfono e le foto dei festeggiati che carichi (ritagliate a cerchio trascinando e zoomando). Il primo cerchio sta davanti; con le frecce cambi l'ordine. Il logo Lopee J resta sempre in fondo. Le foto valgono solo per la festa in corso: **Fine serata: svuota tutto** le cancella e riporta il banner a quello predefinito (Lopee J con il cappello rosso + microfono + «Stasera alla console»). Anche se ti dimentichi di premerlo, alla festa successiva riparti comunque dal banner predefinito.

**Modalità demo.** In fondo alla regia, **Avvia la demo** riempie la coda con 5 cantanti finti (avatar disegnati), lo storico con 4 esibizioni votate e fa arrivare voti finti mentre si canta: serve per girare video e fare prove. I pulsanti **1…5** mostrano subito il pop-up di quell'esito, senza toccare la classifica. **Esci dalla demo** cancella tutto ciò che è finto; le prenotazioni vere restano.

## Avvio sul tuo computer (facoltativo)

```
npm install
npm start
```
Poi apri `http://localhost:3000/regia`. Le impostazioni vanno in un file `.env`: copia `.env.example` e compilalo.

## Pubblicità sui video

L'app usa il player ufficiale di YouTube. Per eliminare gli spot, nel browser dello schermo entra su youtube.com con un account **YouTube Premium**.
