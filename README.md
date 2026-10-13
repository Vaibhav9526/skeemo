<p align="center">
  <img src="reference/skeemo-logo.png" alt="Skeemo logo" width="140" height="140">
</p>

<h1 align="center">Skeemo</h1>

<p align="center"><strong>Find the government schemes you qualify for, and get the paperwork right.</strong></p>

Skeemo is a desktop app that turns government-scheme hunting into a walk through a government office. You enter your details once
(state, age, gender, income, occupation, category, rural or urban) and get a pixel avatar. Counter staff then help you find schemes,
check your papers, tell you straight whether you are eligible, and guide you through the application form.

> Scheme rules and amounts are summarised from public guidelines of central-government schemes. Skeemo gives a first screening only.
> Deadlines are the usual yearly windows. Always confirm on the official portal before you apply.

## What you can do

| Counter | What it does |
| --- | --- |
| **Reception** | Notices, schemes picked for you, every scheme by purpose, and your files. |
| **Registration** | Pick a topic and scheme in a few steps, or describe what you need (typed or spoken). |
| **Document verification** | Lists the papers a scheme needs, checks each upload, and compresses or enlarges files to the portal's size limit. |
| **Eligibility** | A plain yes or no with reasons, and what else you could try. |
| **Form submission** | Opens the official portal and starts [SuperJargon](#superjargon) to guide you through the form. |
| **Help** | Short, direct answers. |

The **chaprasi** (peon, and the app's mascot) walks your file from counter to counter.

## Three rooms

- **Office**: the floor on the left, the open counter's chat docked on the right, and a marquee along the bottom that scrolls the
  schemes relevant to you with their form-filling deadlines. Click a desk and your avatar walks there while the camera follows. The wheel zooms.
  Click a scheme on the marquee or the wall notice board to open the notice board up close, with that scheme in focus and the rest blurred.
- **Chat**: a focus chat with one conversation per counter, chat history, and search. Type `@registration`, `@documents`,
  `@eligibility`, `@form`, `@help` or `@vault` to call another counter.
- **Vault**: keep your papers in one place. Each is read with OCR on this computer and judged valid, needs a look, or invalid
  (type, ID checksum, your name, expiry). It also counts the applications and scholarships you have filed.

### Three looks

A select in the top bar switches between **Classic** (a crisp pixel tilemap), **Modern** (an illustrated office with soft panels) and **Draft** — the original first version of Skeemo, kept as its own separate UI (desk panels instead of chat, the photo office). Draft lives in `src/renderer/src/govt/draft` and shares nothing with the other two but the scheme data and the main process.

## Languages and voice

The interface is available in 11 languages: English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu (right to left), Kannada,
Malayalam and Punjabi. Every counter can speak and listen through [ElevenLabs](https://elevenlabs.io); add your key in Settings.

## Privacy

- OCR runs locally. Your papers are not uploaded for reading.
- Reading papers with AI is off until you tick the box, and then goes through your own Claude login.
- The ElevenLabs key is stored encrypted in the main process and never returned to the UI.
- Only the last four digits of an Aadhaar number are ever stored.

## Run it

Requires Node 20+ and Windows (local OCR uses Windows.Media.Ocr).

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
./node_modules/.bin/electron-rebuild -f
node tools/ensure-pty-perms.cjs && node tools/patch-node-pty-conpty.cjs
npm run dev
```

The extra steps work around native-module build problems on some Windows setups; see `AGENTS.md` for details.

### SuperJargon

The Form counter launches SuperJargon, the form-filling guide. By default Skeemo looks for
`D:\Work\superJargon\release\win-unpacked\SuperJargon.exe`; change the path in Settings.

### Tests

```bash
node --test test/govt-domain.test.cjs test/govt-i18n-layout.test.cjs test/govt-main.test.cjs test/govt-vault.test.cjs
```

### Rebuilding the art

```bash
node tools/build-skeemo-world.cjs    # Classic pixel office
node tools/build-skeemo-modern.cjs   # Modern illustrated office (from reference/govt-office-modern.png)
```

## Built with

Electron, electron-vite, React 18, Pixi 8, zustand and i18next. Developer notes are in [`AGENTS.md`](AGENTS.md).

## License

See [`LICENSE`](LICENSE) and [`LICENSE-ASSETS`](LICENSE-ASSETS).
