# D&D Dungeon Master Assistant

Single-user web MVP: world map → city markers → city maps with building/character markers and basic records, all persisted locally.
One user (a DM friend), one device, desktop Chrome. No backend, no accounts, no paid services.
Deadline **12 Nov 2026**, ~20–22 dev hours total. Source of truth for scope and milestones: `docs/charter.md`.

## Stack
- Vite + React + TypeScript
- react-konva for the map canvas (pan/zoom, draggable markers)
- Dexie (IndexedDB) + `dexie-react-hooks`; tile images stored as Blobs
- Plain CSS. No router, no state library (React state + `useLiveQuery`)
- Hosted on GitHub Pages: https://lipri0705.github.io/dnd-dm-assistant/ (data still stays in each browser)

## Data model
- Campaign (single, implicit) → one or more connected worlds (world maps) → cities (marker on a world map, each with its own city map)
- Every map (world or city) is a board of tiles: uploaded PNGs and color canvases, each with its own position, size and layer order
- Freehand drawing per map: brush strokes (points in map units, color, width), drawn above tiles and below markers
- City map → building and character markers
- Building: name, type, short description, position
- Character: name, type/role, short description, location (a city map, or a world map when travelling; can move between worlds) + position
- Building count per city is **derived**, never stored
- Tiles and markers share one coordinate space: map units (an image tile starts at 1 unit = 1 image px). Since schema v3; before that markers were 0–1 fractions of a single image

## Folders
- `src/db.ts`: Dexie schema, types and data helpers
- `src/backup.ts`: JSON export/import of the whole campaign (images as data URLs)
- `src/components/`: React components (canvas, markers, panels)
- `docs/`: charter and notes

## Conventions
- Smallest working step → manual check list → commit. No features beyond the current milestone.
- Schema changes only via a new `db.version(n)`; never edit an existing version.
- Revoke object URLs created from Blobs.
- Code, comments, docs and commit messages in English.
- No test framework for now; each step ends with a manual check list.

## Commands
- `npm run dev`: dev server
- `npm run build`: type-check + production build
- `npm run preview`: serve the build
- `npm run deploy`: build and publish to GitHub Pages (`gh-pages` branch; needs the `lipri0705` gh login)

## OUT OF SCOPE (from the charter; do not build)
- Public release, commercialization, paid subscriptions
- Multi-user accounts, collaborative editing, sync across devices
- AI-generated maps from text, voice-based map creation
- Drawing/editing tools for roads, buildings, terrain, artwork
- Advanced character stats, inventories, complex relationships, user-defined schemas
- Google Sheets integration
- Production-grade backup, disaster recovery, cloud availability

Stretch goals (after M4): export/backup — done; tavern/legendary-drink details and a small AI feature only if time allows.
