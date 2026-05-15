# WebP Converter

Bulk PNG → WebP converter. Runs entirely in the browser — no server, no upload.

**Live:** https://\<your-github-username\>.github.io/\<repo-name\>/

## Features

- Drag & drop or click-to-browse (any quantity, any size)
- Adjustable WebP quality (1–100)
- Per-file size savings shown (e.g. "68% smaller")
- Individual download per file
- Download all converted files as a single ZIP
- Privacy-first: files never leave your device

## Local dev

```bash
pnpm install
pnpm dev          # starts Vite dev server
pnpm build        # builds to /docs (used by GitHub Pages)
```

## Deploy to GitHub Pages

1. Push to `main` branch
2. In repo Settings → Pages → set source to **GitHub Actions**
3. The workflow in `.github/workflows/deploy.yml` handles the rest

## Project structure

```
├── apps/
│   └── converter/       # Vite app
│       ├── index.html
│       └── src/
│           ├── main.js  # conversion logic + UI
│           └── style.css
├── docs/                # built output (served by GitHub Pages)
└── .github/workflows/
    └── deploy.yml
```
