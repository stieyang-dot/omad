# OMAD — fasting & weight tracker

A small, fully-offline PWA (progressive web app). All data is stored **on your device** in the browser's IndexedDB — nothing is ever uploaded.

## Features
- **Time since last meal** — the Today screen counts **up** from your last meal (no target, no ring). Under 24h it reads `Xh YYm`; once past a day it reads `Xd YYh ZZm`. Tap **Edit time** to move the start earlier/later.
- **Countdown** — a separate card where you enter any **hours + minutes** and it counts down (independent of the fasting tracker). It keeps running if you leave and reopen the app.
- **Fasting / OMAD log** — log the exact time a meal was eaten (now or a past time). Each entry shows the time since the previous meal. Fully editable and deletable.
- **Weight tracking** — log weigh-ins and see a trend graph with an up/down trend indicator and net change. Editable and deletable.
- **kg ⇄ lbs** — flip the unit toggle anywhere and every number converts instantly. Weights are stored canonically in kg so there's no rounding drift.
- **Progress** — fast streak (consecutive days with a 24h+ fast), longest streak, average & longest fast, and a colour-coded month calendar: **green** = a 24h fast achieved, **yellow** = one meal logged, **purple** = more than one meal logged. Streaks count green days only.
- **Light / dark theme**, soft sage-and-sand palette.

## Files
```
index.html          app shell + all screens
styles.css          styling, light/dark themes
db.js               IndexedDB wrapper
app.js              all app logic
manifest.json       PWA metadata
service-worker.js   offline caching
icons/              app icons (svg + png)
.claude/            local-preview server (NOT needed for deployment)
```

## Test it on your PC
Just **double-click `index.html`** to open it in your browser. Everything works (logging, countdown, weight, conversion). The only thing that won't run from a double-click is the offline service worker — that activates automatically once it's hosted (below).

## Put it on your phone (GitHub Pages)
1. Create a new repository on GitHub (e.g. `omad`). It can be public or private.
2. In a terminal in this folder:
   ```
   git init
   git add .
   git commit -m "OMAD tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/omad.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, branch **`main`**, folder **`/ (root)`**, then **Save**.
4. Wait ~1 minute. Your app is live at `https://<your-username>.github.io/omad/`.
5. On your phone, open that URL in **Chrome**, tap the **⋮ menu → "Add to Home screen"** (or "Install app").
6. Launch it from the new home-screen icon — it runs full-screen and works offline.

> Note: the `.claude/` folder is only a helper for previewing locally on this PC. It's harmless if pushed, but you can delete it before committing if you prefer a clean repo.
