# Project notes

## Skeemo (current product)

This app is now **Skeemo**: an AI-assisted government-scheme eligibility and benefit navigator, drawn as a
government office. (It was briefly called Samadhaan; the `govt`/`govt:*` names stayed.) The IsCool/Jargon agent engine
below is still in the tree (and still starts in the main process) but the renderer mounts
`src/renderer/src/govt/SkeemoApp.tsx` instead of `App.tsx`. Nothing under "Hosted teaching", "Librarian", "Tapri",
"Spectator" or "Releasing" applies to Skeemo.

- **Three rooms**, switched from the top bar: **Office** (`OfficeView`, the pixel floor), **Chat** (`chat/ChatView.tsx`, the
  IsCool-style focus chat) and **Vault** (`vault/VaultView.tsx`). Esc returns to the Office.
- **Focus chat**: one conversation per counter (Reception, Registration, Documents, Eligibility, Form, Help). Each opens with a
  greeting + a "tool" card (`chat/tools/*`: schemes browser, 3-step registration form, document checklist, eligibility
  questions + verdict, SuperJargon launcher). Free text goes to the open counter; `@name` calls another one (`chat/mentions.ts`,
  `chat/agents.ts`). Greetings/tool cards are rendered fresh in the current language; only what was said is stored
  (`chat/chatStore.ts`, localStorage). Registration matches text to schemes, Eligibility can run the check, Form can launch the guide,
  the rest answer as Help.
- **Floor** — `scene/govt/GovtFloor.tsx` (Pixi). The office is painted tile by tile by `node tools/build-skeemo-world.cjs`
  (42x24 tiles of 16px; own 5x7 pixel font; writes `assets/govt/skeemo-office.png` at 3x, `skeemo-front.png` = desk fronts and
  monitors drawn OVER the seated staff, and `skeemo-layout.json`). `scene/govt/layout.ts` reads that JSON, so art and coordinates
  cannot drift (1 unit = 1 art pixel). Staff are seated and never move; the chaprasi (Ramu Kaka) and the citizen are the only
  movers. The UI drives the floor through `scene/govt/floorBus.ts`; commands sent while the Office is not mounted are dropped and the
  floor re-opens with the citizen standing at the current counter. The wall **notice board** is Pixi cards fed by
  `shared/govt/notices.ts`.
- **People** — `govt/art/people.ts` draws every pixel person from a `Look` recipe on a 20x34 buffer (citizen avatar via `lookFor`, 6 staff,
  the chaprasi: khaki cap, red towel, wink and grin, after the user's reference). The logo is the same chaprasi
  (`reference/skeemo-logo.svg`, drawn again as `Logo` in `govt/icons.tsx`).
- **No emoji in the UI** — every glyph is an SVG from `govt/icons.tsx` (one-weight line icons). Theme is `govt/skeemo.css`
  (warm paper, one green accent). Keep it plain: no heavy borders, no all-caps labels.
- **Domain** (pure, in `src/shared/govt`): `profile.ts`, `schemes.ts` (29 central schemes, bilingual en/hi; `deadlines` = usual yearly
  closing dates, `trending`), `eligibility.ts` (deterministic rules), `notices.ts`, `documents.ts` (16 paper types, Aadhaar Verhoeff /
  PAN / IFSC checks), `analysis.ts` (what OCR text says: type, ID validity, name, expiry), `vaultTypes.ts`, `cases.ts`, `languages.ts`.
  Scheme amounts/rules are a first screening: `incomeBasis: 'indicative'` marks income caps that stand in for survey tests, and deadline
  dates are the USUAL windows — the UI always says to confirm on the portal. Verify against the portal before editing numbers.
- **Main** (`src/main/govt`, IPC `govt:*` in `ipc.ts`): `store.ts` (JSON in userData/samadhaan), `ocr.ts` (LOCAL OCR: Windows.Media.Ocr
  through PowerShell for images; PDF text layer, then OCR on rendered pages), `vault.ts` (private copy + masked index; the OCR text itself is
  never stored), `docFit.ts` (compress/convert/enlarge to a portal's size window), `docVerify.ts` (local checks + OCR text + optional AI
  read; only the last 4 Aadhaar digits are ever stored), `ai.ts` (matching, help, document read, translation via `runClaudeOnce`, all with
  offline fallbacks), `speech.ts` (ElevenLabs TTS per desk voice, model chosen by language, Scribe STT), `formGuide.ts` (launches
  SuperJargon, default `D:\Work\superJargon\release\win-unpacked\SuperJargon.exe`), `translate.ts`.
- **Privacy rules**: the ElevenLabs key lives only in main (safeStorage). OCR never leaves the computer. AI reading of uploaded papers is OFF
  until the citizen ticks the box (the file then goes to their own Claude login). Never log or return keys.
- **i18n** — UI strings are the `govt` namespace: `govt/locales/<code>.ts` (11 languages). Every language must have the exact key tree and
  `{{placeholders}}` of `en.ts` (a test enforces it). Scheme/document copy is en+hi in the data; other languages come from `useTx()`
  (LLM, cached). Urdu is RTL via `useDirectionSync`.
- **Checks**: `node --test test/govt-domain.test.cjs test/govt-i18n-layout.test.cjs test/govt-main.test.cjs test/govt-vault.test.cjs`.
- **Dev tricks** (dev builds only): `SAMADHAAN_USER_DATA=<dir>` runs against a throw-away profile; `SAMADHAAN_DEBUG_PORT=9444` exposes
  the DevTools protocol so the UI can be driven/screenshotted headlessly. Do not drive an instance the user is looking at.
- **Windows gotchas**: never `rm -rf` a directory that contains an NTFS junction to `node_modules` (it can delete the real folder); if
  `node_modules/.bin` vanishes, re-copy from `D:\Work\Jargon\node_modules`. In this shell, large heredocs containing many quotes can
  fail to parse — write files with the editor tool instead.

IsCool is the School-only port of Jargon (Office, Tapri, Mail, Spectator and the Office/School switch were removed; the floor is locked to the staffroom theme, auto-update is off, URL scheme is iscool://). The notes below were inherited from Jargon; sections about Tapri, Spectator, releasing and auto-update do not apply.

## IsCool branding

- The original app logo lives in `reference/logo.png` and `reference/logo.svg`; keep both unchanged. The renderer's `@brand` alias and the README use `reference/`, and both main-asset copy paths emit the PNG as `out/main/logo.png`.
- Regenerate desktop packaging icons with `node tools/build-brand-assets.cjs`. Do not use the inherited `tools/make-logo.cjs` for IsCool: it generates the old Jargon assets.
- Branding checks: `node --test test/iscool-branding.test.cjs`.

## Running this app (Windows)

- `npm install` fails on this machine: Node 25's headers ship `clang: 1` and the
  project's `@electron/node-gyp` fork lacks upstream's clang reset, so gyp
  demands the (uninstalled) ClangCL toolset → MSB8020.
- Workaround used: `npm install --ignore-scripts`, then:
  1. `node node_modules/electron/install.js` (downloads the Electron binary)
  2. `./node_modules/.bin/electron-rebuild -f` (builds better-sqlite3 + node-pty
     against Electron headers — no clang issue there)
  3. `node tools/ensure-pty-perms.cjs && node tools/patch-node-pty-conpty.cjs`
- `node-pty` also required a local patch: `SpectreMitigation: 'Spectre'` →
  `'false'` in `node_modules/node-pty/binding.gyp` and
  `node_modules/node-pty/deps/winpty/src/winpty.gyp` (this machine's VS Build
  Tools lack the Spectre-mitigated libs → MSB8040). Wiped on reinstall.
- Run dev app: `npm run dev`
- Rebuild the current School atlas/map: `python tools/build-school-world.py`
  (requires Pillow). This validates entrance reachability for all seats and
  interaction points before writing the assets. Older school generators produce
  the superseded layouts and should not be used for the current theme.
- School regression checks: `node --test test/staffroom-theme.test.cjs test/school-character-art.test.cjs test/school-leader-switch.test.cjs test/god-identity.test.cjs test/school-office-switcher.test.cjs`.

## Hosted teaching integration

- Manual teaching checks: `node --test test/teaching-routing.test.cjs test/teaching-composer.test.cjs test/teaching-window.test.cjs test/teaching-branding.test.cjs`.
- `@teacher` / `@teach-me` requires an active Teacher worker, but no API access
  code. Jargon opens the hosted website; the user signs in, uploads materials,
  and starts generation manually. Jargon does not make generation API calls.
- The isolated teaching window uses local Jargon branding on root/classroom
  chrome. Authentication, payment, legal pages, course content, and citations
  retain their original identity/content. Provider details disclose OpenMAIC.
- `openMaic.ts` and `teachingMaterials.ts` remain as standalone legacy helpers,
  but are not wired into the active manual teaching flow. Existing stored
  credentials are neither read nor deleted by manual mode.

## Librarian file desk

- `@convert` (PDF→PPT, PPT→PDF, image→PDF, PDF→image) and `@compress N%` (image)
  run locally from the composer: `shared/fileTools.ts` parses, `main/fileTools.ts`
  does the work, IPC `fileTools:run` re-validates and requires per-window file
  grants. Output goes to `Documents/Jargon Converted`. PPT→PDF needs PowerPoint
  (Windows) or LibreOffice; PDF→PPT makes one picture per slide (not editable).
- Checks: `node --test test/file-tools.test.cjs`.

## Modern tileset

- Settings: the top-bar **Modern / Classic** switch (`config.tilesetStyle`, default modern) swaps the
  art for the Office and School floors; seats, zones and cast are identical.
- Rebuild: `python tools/build-emakina-world.py --src <clone of EmakinaFR/office-map>` (Pillow).
  `--preview <prefix>` writes PNG previews instead of building. It refuses unreachable seats.
- Checks: `node --test test/emakina-maps.test.cjs`. The art is used with the owner's permission,
  is NOT MIT (see `LICENSE-ASSETS`), and the Star Wars sheet must never be packed.

## Ambient floor sound

- Procedural only — oscillators + band-passed noise on the Web Audio API. There
  are no audio assets and there must never be any. Cues: `type` (key tick),
  `taskDone` (two-note chime), `agentJoin`/`agentLeave` (door sweep),
  `error` (low blip). All under 0.6s.
- `src/renderer/src/audio/soundEngine.ts` owns the AudioContext and the master
  gain; `src/renderer/src/audio/soundBridge.ts` owns the trigger map and is the
  ONLY thing wired to the engine (from `useHive.ts`). Do not add `playSound()`
  calls to components — the bridge subscribes to the store diff so mute is one
  master gain, not a per-component job. A test asserts `useHive.ts` is still the
  only wiring site.
- Chromium will not start an AudioContext before a user gesture. `initSound()`
  arms a one-shot gesture listener; a cue asked for while the context is still
  suspended is DROPPED, not queued, so a burst of cues cannot all land on the
  first click.
- Settings: `soundEnabled` (default true — absent must read as ON) and
  `soundVolume` (default 0.5), mirrored through the store and the top-bar
  speaker toggle in `components/SoundToggle.tsx`.
- Throttling (per-agent tick window, one-chime-per-moment) lives in the bridge
  so it is testable without an AudioContext. Checks:
  `node --test test/sound-bridge.test.cjs`.

## Spectator mode (read-only LAN live view)

- Top-bar **spectator toggle** (`components/SpectatorToggle.tsx`) starts a read-only
  HTTP server (`src/main/spectator.ts`, no electron import) bound to `0.0.0.0` and
  shows the LAN URL + a QR code a phone scans to watch the floor live. The audience
  is hackathon judges, so the page is a schematic floor that pulses, not a JSON dump.
- Security model: the unguessable token in the URL path (`crypto.randomBytes`, minted
  per start) is the ONLY auth — GET only, no write endpoint exists, a wrong token is
  answered with the identical 404 as a wrong path (constant-time compare against a
  decoy), and a fixed-window rate limit sheds floods with a 429. See the header
  comment on `spectator.ts`.
- The renderer pushes a compact snapshot ~1/s over IPC `spectator:push`
  (`src/renderer/src/spectator/spectatorStream.ts` reads the live store + task board);
  main only caches it. The self-contained page (`spectator.ts` `spectatorPage()`) polls
  `/<token>/state` every 1.5s — inline CSS/JS, NO CDN/fonts (hackathon wifi may be
  offline). The QR is a hand-rolled, dependency-free encoder
  (`src/renderer/src/spectator/qr.ts`); the raw URL is always shown as a fallback.
- Additive config: `spectatorPort` (optional; default 47870, falls back to a free
  port). Not auto-started on boot — the LAN surface exists only while the user has it
  on, and `teardownAndQuit` stops it.
- Checks: `node --test test/spectator-view.test.cjs`.

## Tapri level (chai-stall discussion — no agents)

- Third option in the top-bar **School / Office / Tapri** switch. Tapri is an overlay
  (`useTapriLevel` in `tapri/TapriLevel.tsx`) over the floor: it does NOT start a fresh
  team and leaves agents/PTYs running. Selecting School/Office closes it.
- The talk is generated by a CLI the user picks (Claude, Codex, Gemini, Qwen, OpenCode —
  `TAPRI_CLIS` in `shared/tapri.ts`). One tool-less one-shot per round, **prompt on stdin,
  never argv**. The reply is strict JSON (`turns`, `reactions`, `summary`, `leaves`) parsed
  and validated by `parseTalkResponse` — unknown speakers are dropped, not trusted.
- Split: `shared/tapri.ts` (cast, prompt, parser) · `main/tapri.ts` (CLI spawn, ElevenLabs,
  IPC `tapri:*`) · `renderer/src/tapri/` — `sim.ts` (pure world: seats, walkers, autos/cabs,
  anger → storm off), `engine.ts` (director; all I/O injected), `render.ts` (canvas, also
  rendered headlessly for screenshots), `people.ts`/`vehicles.ts` (procedural sprites),
  `voice.ts` (playback), `TapriLevel.tsx` (HUD: CLI select, topics, say box, top-right summary).
- ElevenLabs is optional BYOK: key saved write-only under `apikey:elevenlabs` (own `tapri:key*`
  IPC — deliberately NOT in `BACKEND_KEY_ENV`, which would export it into every agent's env).
  Voices use `eleven_flash_v2_5`; street ambience uses sound-generation, cached in
  `userData/tapri/ambience.mp3`. Voices/street default OFF; lines are capped at 300 chars.
- Auto-chat pauses after `MAX_AUTO_ROUNDS` rounds without the user speaking (each round is a
  CLI call). A CLI error also stops auto-chat so a missing binary is not retried forever.
- Backdrop: `assets/tapri/tapri-bg.png` (1600x900; the parked van was painted out so traffic
  can drive the road). Seat/stand/lane coordinates in `sim.ts` are in that frame.
- Checks: `node --test test/tapri.test.cjs test/tapri-people.test.cjs test/tapri-vehicles.test.cjs`.

## Releasing + auto-update (public repo `Vaibhav9526/Jargon`, remote `origin`)

- Auto-update is ON (`UPDATES_ENABLED` in `main/updater.ts`, `REPO` there and in
  `shared/updateState.ts`, `publish:` in `electron-builder.yml` — keep all three in sync).
  electron-updater reads `latest.yml` + the setup exe + `.blockmap` from the newest GitHub release;
  the portable exe only gets the notify-only fallback. Builds before 0.5.0 cannot update.
- Release recipe: bump `package.json` (+ lock), `RELEASE.md`, `build/release-notes.md`,
  `CHANGELOG.md`, `docs/llms.txt` → `npm run check:links` → commit on a branch based on
  `origin/main` (the backup remote's history is unrelated; never push to `backup`) →
  `npm run build && npx electron-builder --win --config.npmRebuild=false --publish never`
  (`npmRebuild=false` because the clang/gyp problem above breaks a rebuild; node_modules is already
  rebuilt for Electron) → tag `vX.Y.Z`, push, then `gh release create` uploading from `dist/`:
  the setup exe, portable exe, `latest.yml`, `*.blockmap`, and a `SHA256SUMS.txt`.
  `latest.yml` is what makes the in-app update work; a release without it is invisible to the updater.

## User preferences

- When running opencode, use `npx opencode` — NOT bare `opencode`. The bun shim
  at `~/.bun/bin/opencode` is broken ("bin executable does not exist on disk")
  and shadows the working npm-global `opencode-ai` install; npx resolves the
  latter correctly.
- After making a change, run the app (`npm run dev`) so the user can see it —
  do this every time, not just when asked.

## Skeemo (government scheme navigator) — current app

- The app is now Skeemo: a government-office floor with five counters (Registration, Documents, Eligibility, Form, Help) plus Reception. Code lives in `src/shared/govt`, `src/main/govt`, `src/renderer/src/govt`, `src/renderer/src/scene/govt`.
- Two map styles (top-bar select, `useGovt.style`): **Classic** (pixel tilemap, `tools/build-skeemo-world.cjs`) and **Modern** (illustration, `tools/build-skeemo-modern.cjs` from `reference/govt-office-modern.png`). Both write art + a layout JSON that `scene/govt/layout.ts` reads.
- Office view = floor (camera follows the citizen, wheel zoom) + docked chat + bottom deadline marquee; clicking a marquee/board scheme opens `NoticeOverlay`. Focus chat is the full-screen `ChatView`.
- Styles: `skeemo.css` then `skeemo2.css`. `.sk-root button { color: inherit }` outranks single-class rules, so button colours need `.sk-root .x`.
- i18n: all 11 locales in `govt/locales` must keep the same key tree (test enforced). Checks: `node --test test/govt-*.test.cjs test/iscool-branding.test.cjs`.
