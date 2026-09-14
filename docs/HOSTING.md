# HOSTING

Four ways to put this game somewhere you can play it, in order of effort.

---

## 1. One file, no server

```bash
npm run build:hosted
```

Produces **`dist-single/ossuan.html`** — a single ~780 KB HTML file with the
entire game inlined. Double-click it and it runs. No install, no server, no
network.

Verified to boot and play from `file://` in a browser, so it also works from a
USB stick, an email attachment, or any folder.

## 2. Any static host

```bash
npm run build
```

Upload the contents of **`dist/`**. That is it — the game is static files with
no backend, no database and no API. It works on Netlify, Vercel, Cloudflare
Pages, itch.io, S3, or a folder on any web server.

Vite is configured with `base: './'`, so it works from a sub-path
(`example.com/games/ossuan/`) without reconfiguration.

## 3. GitHub Pages, automatically

`.github/workflows/pages.yml` builds, runs the tests, and deploys on every
push to `main`.

To enable it once: **repository Settings → Pages → Source: "GitHub Actions"**.

The game then lives at `https://<owner>.github.io/<repo>/`, and the standalone
single file is published alongside it at `/ossuan-standalone.html`.

The deploy is gated on `npm test` passing, so a build that fails its own tests
never becomes the thing people play.

## 4. Claude Artifact

Already published from this repository. `npm run build:hosted` produces
`dist-artifact/` (a page plus `game.js`) in the shape the artifact host expects
— no outer `<html>`/`<head>`/`<body>` tags, since the host supplies those.

---

## Why not PlayCanvas

PlayCanvas was asked about specifically, so here is the straight answer: it is
not a fit, for two independent reasons.

**It is an engine, not a file host.** PlayCanvas hosting (`playcanv.as`) serves
*PlayCanvas projects* — scenes authored in their editor, running on the
PlayCanvas engine and its own entity/component/script model. You cannot upload a
Three.js build to it and get a playable page. There is no import path for one.

**Porting would be a rewrite of the entire presentation layer.** Everything in
`src/render/` and `src/ui/` is written against Three.js and the DOM: the
procedural texture generators, the modular character rig, ~50 prop builders,
merged terrain, the pooled particle system with its custom shader, the camera
rig, and the whole UI. That is roughly 5,000 lines that would have to be
rebuilt against PlayCanvas's API. The simulation in `src/sim/` would survive
untouched — that is the point of the layering — but the port would be weeks of
work for no gain over the options above, all of which host the game as it is.

A third, practical reason: publishing to PlayCanvas needs an account and an API
token. Even if a port existed, it could not be deployed without those.

**If you want PlayCanvas specifically** — for their editor, their collaboration
features, or to publish on their platform — that is a real project and a
reasonable thing to want, but it is a port, not a deployment step. The
architecture already isolates what would need rewriting.
