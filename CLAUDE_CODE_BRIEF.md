# TCG Field Check — Claude Code Project Brief

## What This Is
A mobile-first PWA for Thompson Construction Group (TCG) field equipment verification. Crew members walk jobsites checking off equipment items in real-time across multiple phones. Built as a single `index.html` deployed to Firebase Hosting.

## Live URL
https://tcg-field-check-cafe1.web.app

## Firebase Config
```javascript
{
  apiKey: "AIzaSyBqZ2Kf4wPesSA5axB-asFzG5B0LkQ0Yl8",
  authDomain: "tcg-field-check-cafe1.firebaseapp.com",
  databaseURL: "https://tcg-field-check-cafe1-default-rtdb.firebaseio.com",
  projectId: "tcg-field-check-cafe1",
  storageBucket: "tcg-field-check-cafe1.firebasestorage.app",
  messagingSenderId: "365927295149",
  appId: "1:365927295149:web:419fb6f31654ee07b03e24"
}
```

## Firebase Realtime Database Structure
```
/rfe_index/{rfeId}
  - name: "Hercs_Equipment_List"
  - count: 95
  - importedAt: ISO timestamp
  - fileName: "Hercs_Equip__Search.csv"

/rfe/{rfeId}/items/{itemId}
  - id: 1
  - {headerName}: "value"  (one key per CSV column)

/rfe/{rfeId}/state/{itemId}
  - checked: true/false
  - note: ""
  - ts: ISO timestamp
  - by: "Billy"

/rfe/{rfeId}/headers
  - [array of column name strings]

/rfe/{rfeId}/display
  - descName: "Cat Class Description"  (header NAME, not index)
  - idName: "IC Number"
  - ctxNames: ["Make", "Model", "Serial Number"]
  - qtyNames: []
  - grpName: "Category" or null
```

## Deploy Command
```bash
firebase deploy
```

## Architecture
- Single HTML file with embedded CSS + JS
- Firebase Realtime Database for cross-device sync (no auth — test mode)
- Firebase SDK v8.10.1 loaded from CDN
- SheetJS (xlsx) loaded from CDN for Excel file parsing
- PWA via manifest.json + sw.js (service worker)
- No build step, no bundler, no framework

## Current Features
1. **CSV/XLSX Import** — universal column auto-detection
2. **Real-time sync** — Firebase listeners, instant cross-device updates
3. **Per-item check-off** with timestamp and user name
4. **Search** across all fields with yellow highlight on matches
5. **Keyboard toggle** — ABC (text) ↔ 123 (numpad) via inputmode attribute
6. **Filter** by group category and by status (Found/Missing)
7. **Sort** by #, A-Z description, or check status
8. **Group toggle** — cluster items by category column
9. **Select All / Deselect All** on filtered view
10. **Expand arrow** on each item reveals all columns + notes field
11. **RFE Inventory system** — each import becomes an RFE entry
12. **Inventory view** — shows all RFEs with completion status (Complete/Partial/Incomplete)
13. **Export** — generates HTML report with TCG branding, summary stats, full item table
14. **Bottom nav** — Checklist, Inventory, Import, Settings (4 tabs)
15. **Slide-out panels** — Menu (left), Settings (right)
16. **PWA** — installable as standalone app, green TCG icon
17. **Delete RFE** — removes entire RFE from Firebase
18. **Reset Checks** — clears check marks only, keeps items

## Known Bugs to Fix
1. **Items show "—" instead of real data** — Column detection stores header names in `display` config but items stored in Firebase may have keys that don't match (spaces, special chars getting sanitized inconsistently). The fix: ensure item keys and display config names use the EXACT same sanitization.
2. **Old data in Firebase uses index-based display** — Any data imported before v3.1 stores column indices instead of names. Need migration or force re-import.
3. **Search highlight** works but needs testing with special characters.
4. **Export** generates HTML, not actual PDF. Should use a proper PDF library.
5. **Settings panel** items are placeholders — none are functional yet.

## UI Design Reference
The app should match the FieldFlow logistics app aesthetic:
- **Light theme**: white background (#f8fafc), green accent (#16a34a)
- **Green gradient top bar** with hamburger menu + settings gear
- **Card-based item list** with rounded corners, subtle shadows
- **Orange dot** = unchecked/unverified, **Green dot** = found/checked
- **Item card layout**: Bold ID on line 1, description on line 2, qty + context tags on line 3
- **Bottom nav bar**: 4 tabs with SVG icons + active indicator line on top
- **Slide-out panels** for Menu (left) and Settings (right)
- **DM Sans** font throughout
- **Big green FAB** for Export, green-bordered FAB for Import

## CSV Formats This Must Handle

### Format 1: Hercs Equipment List (from PDF)
Headers: IC Number, Cat Class Description, Make, Model, Serial Number, VIN Number, GPS Status
- IC Number → ID (line 1, bold)
- Cat Class Description → Description (line 2)
- Make → context tag
- Model, Serial, VIN, GPS → expanded detail

### Format 2: TCG Crew Material List
Headers: Asset ID, Location, Vendor, Inventory Quantity, Material Type, Description, Dimensions, Weight, Shipment ID, PO Number, PO Line Number, Bundle ID, Reference Number
- Description → Line 1
- Asset ID → Line 2 (ID)
- Vendor, Location → context tags
- Inventory Quantity → qty badge
- PO Number → context tag

### Any other CSV
The column detection must handle ANY headers gracefully. Score-based matching:
- "description", "desc", "cat class description", "name" → description column
- "ic number", "asset id", "item code", "sku", "barcode", "part number" → ID column
- "qty", "quantity", "count", "amount" → quantity badge
- "vendor", "supplier", "make", "manufacturer" → context tag
- "location", "loc", "site" → location tag (with 📍 icon)
- "serial", "model", "po number" → context tags
- "category", "type", "material type", "class" → group-by column

## Production Goals
1. Refactor from single HTML into proper project structure (separate CSS, JS modules)
2. Add proper error handling and loading states
3. Add offline support (queue writes when disconnected, replay on reconnect)
4. Add user authentication (at minimum, name persistence per device)
5. Make all Settings panel items functional (appearance, profile, etc.)
6. Generate actual PDF exports (not HTML)
7. Add barcode/QR scan input mode
8. Performance optimization for 500+ item lists (virtual scrolling)
9. Comprehensive testing
10. TypeScript migration (optional but recommended)

## Key Principles
- **Zero data loss** — check marks must persist no matter what
- **Mobile-first** — 44px minimum touch targets, works on Samsung Z Fold
- **Universal import** — any CSV/XLSX structure, smart column detection
- **Real-time sync** — multiple crew members on different phones
- **Professional exports** — TCG branded, signature lines, color-coded status
- **Description prominence** — always the most visible field regardless of CSV structure
