# Baustellen-App

Time, material and photo tracking for construction sites with invoicing; specification in `SPEC.md`, setup for humans in `README.md`.

## Agent reference

Before working on the code, read the reference of the part you change:

- `REFERENCE.backend.md` – Apps Script backend (`backend/src`), local emulator (`backend/dev`), deployment ids
- `REFERENCE.frontend.md` – React PWA (`frontend/`), GitHub Pages workflow

After changing code, update the affected sections and diagrams of the reference in the same change. Load the skill `document-software` before editing a reference so its rules apply (end state only, no line numbers, PlantUML source plus rendered SVG in `docs/`).

## Checks

- Backend: `npm --prefix backend test`
- Frontend: `npm --prefix frontend run build` and `npm --prefix frontend test`
- Local app: `node backend/dev/server.js` and `npm --prefix frontend run dev` (dev login, no Google account needed)
