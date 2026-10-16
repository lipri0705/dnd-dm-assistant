# M4 — Data persistence check

Evidence for charter milestone **M4 — Data Persistence Verified** (target 04.11.2026).
Run in desktop Chrome on the target device. Mark each row ✅ / ❌ and note anything odd.

Date: ____  Chrome version: ____  Tester: ____

## Setup
Build a small campaign first:
- World map from 2 PNGs placed side by side + 1 color canvas tile, 3 cities; a second world (one canvas tile) with 1 city.
- City 1: PNG map, 3 buildings and 2 characters, every field filled (name, type/role, description).
- City 2: blank canvas, 1 building.
- 1 character travelling on the world map.

## Checks

| # | Action | Expected | Result |
|---|---|---|---|
| 1 | Reload the tab (Cmd+R) | World map, cities, positions and names unchanged | |
| 2 | Quit Chrome fully (Cmd+Q), reopen the app | Same as 1, and city maps open with their images | |
| 3 | Restart the computer, reopen the app | Same as 2 | |
| 4 | Open City 1 | 3 buildings, 2 characters, all fields intact; toolbar shows "3 buildings" | |
| 5 | On the world map, select City 1 | Panel shows "Buildings: 3" | |
| 6 | Move a character City 1 → world → City 2, then reload | Character is on City 2 at the same relative position | |
| 7 | Edit map: move, resize and recolor tiles, change their order, then reload | Tiles and markers stay exactly where they were left | |
| 7a | Draw: a few strokes in two colors, erase one, reload | Remaining strokes are exactly where they were drawn | |
| 8 | Delete City 2, then reload | City 2 and its map are gone; other cities untouched | |
| 8a | Move a character to the second world (travelling), switch worlds, reload | Character is on the second world map; the app reopens on the last world | |
| 9 | DevTools console: `await navigator.storage.persisted()` | Informational only: `true` = Chrome protects the data from eviction; `false` is normal for a new/localhost site | |
| 10 | DevTools → Application → IndexedDB → `dnd-dm` | `tiles` holds the image Blobs; `markers` x/y are in map units (same scale as tiles) | |
| 11 | Export → a `dnd-campaign-<date>.json` file downloads | File size roughly matches the images used | |
| 12 | Add a junk city, then Import the file from 11 | Junk city gone; everything from the setup is back, images included | |

## Known limitations (local-only storage)
- Data lives only in this Chrome profile on this device. "Clear browsing data → Cookies and site data", a different browser or another device means no data.
- Backup is manual: use Export regularly and keep the file somewhere safe. Import replaces the whole campaign.
- Data is tied to the site address: a campaign made on `localhost` won't appear on a hosted URL until imported there.
- Chrome grants "persistent" storage silently (no prompt). Without it, Chrome may evict data only when the disk is nearly full.

## Result
M4 passed: yes / no. Notes:
