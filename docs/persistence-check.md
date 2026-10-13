# M4 — Data persistence check

Evidence for charter milestone **M4 — Data Persistence Verified** (target 04.11.2026).
Run in desktop Chrome on the target device. Mark each row ✅ / ❌ and note anything odd.

Date: ____  Chrome version: ____  Tester: ____

## Setup
Build a small campaign first:
- World map from a PNG, 3 cities.
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
| 7 | Replace City 1's PNG with a different-size image, then reload | Markers keep their relative positions | |
| 8 | Delete City 2, then reload | City 2 and its map are gone; other cities untouched | |
| 9 | DevTools console: `await navigator.storage.persisted()` | Informational only: `true` = Chrome protects the data from eviction; `false` is normal for a new/localhost site | |
| 10 | DevTools → Application → IndexedDB → `dnd-dm` | `maps` holds Blobs, `markers` has x/y between 0 and 1 | |

## Known limitations (local-only storage)
- Data lives only in this Chrome profile on this device. "Clear browsing data → Cookies and site data", a different browser or another device means no data.
- No backup yet. Export/backup is a charter stretch goal; see the decision after M4.
- Chrome grants "persistent" storage silently (no prompt). Without it, Chrome may evict data only when the disk is nearly full.

## Result
M4 passed: yes / no. Notes:
