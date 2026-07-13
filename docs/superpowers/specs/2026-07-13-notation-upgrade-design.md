# Tabman notation upgrade — design

Date: 2026-07-13. Approved approach: **bar-level flags** (approach 1). Five phases,
shipped in order, each independently green. User reviews after each phase.

## Phase 1 — Configurable keymap + rhythm shortcuts

New `packages/web/src/lib/keymap.ts`:

- Action registry: 7 rhythm actions (whole → 64th) + 12 articulation actions + dot toggle.
  Each entry: `{ id, label, group, defaultKey }`.
- Defaults: `q` whole, `w` half, `e` quarter, `r` 8th, `d` 16th, `f` 32nd; 64th ships
  unbound (bindable). **Let ring moves `r` → `g`.** `.` toggles dots (0→1→2→0).
- `loadKeymap()` / `saveKeymap()` / `resetKeymap()` — localStorage key `tabman.keymap.v1`,
  stored as overrides merged over defaults.
- `useTabKeyboard` drops hardcoded `ARTICULATION_KEYS`; looks up keys in the keymap.
  New handler `onRhythmValue(value: NoteValue)`, `onToggleDot()`.

Rhythm key behavior: always sets the brush; additionally — selection non-empty → applies
value to all selected beats; no selection but cursor on an existing beat → retimes that
beat. Value replaces, dots + tuplet preserved (same rule as `+`/`-` today).

ShortcutsDialog becomes a keymap editor: rows render from registry + live keymap; click a
key chip → "press a key…" listening state; Esc cancels; conflicting key blocked with
inline "used by X" message; "Reset to defaults" button; saves immediately. ToolPanel
tooltips show bound keys.

## Phase 2 — Full rhythm UI (tuplets, dots, 32nd/64th)

- ToolPanel note-value row: all 7 values + two dot toggles (·, ··) + tuplet preset
  buttons (2, 3, 5, 6, 7, 9).
- **Tuplet split (MuseScore-style)**: `Ctrl+2..9` (real Ctrl — Cmd+digit = browser tabs)
  or ToolPanel button, on cursor beat / selection. Core `splitBeatToTuplet(state, cells, actual)`:
  - `normal` table: 2→3, 3→2, 5→4, 6→4, 7→4, 9→8.
  - Beat of written value V → `actual` beats of value `V×normal`, each tagged
    `tuplet:{actual,normal}`, dots carried. (Quarter + Ctrl+3 → three tuplet-8ths = 1/4.)
  - First slot keeps the notes, the rest become rests. Beat already in a tuplet → no-op.
- **Remove tuplet**: `Ctrl+1` / right-click. Contiguous group of exactly `actual` beats
  sharing the same tuplet collapses to one base-value beat keeping the first slot's
  notes. Incomplete group → strips the tuplet field from remaining beats.
- Playback needs nothing (durationToWholes already applies tuplets). Render: tuplet
  bracket + numeral over each contiguous same-tuplet group.

## Phase 3 — Multi-bar selection + copy/paste

- Marquee: plain drag replaces the selection; **Shift+drag unions** with the existing
  selection (desktop-icons style). Dedup by cellKey.
- Copy: selected cells grouped by bar → clipboard
  `{ kind: 'segments', segments: [{ timeSignature, beats }] }` in source order; per-bar
  beats filtered to the selected strings.
- Paste at cursor (bar B, beat i), boundary-preserving:
  - Segment 0 inserts into bar B at beat i (existing cascade handles overflow).
  - Segments 1..n insert as **whole new bars** after B, each with its stored time signature.
  - Cursor lands at the end of the last pasted segment.
- Single-bar copy keeps today's flat-beats behavior (same path, one segment).

## Phase 4 — Pickup bar (anacrusis)

- Model: `Bar.pickup?: boolean`. UI: right-click bar 0 → "Pickup bar" toggle (first bar only).
- Semantics: keeps the score time signature for display; accepts content up to normal
  capacity; never padded — playback/metronome advance by **content length** (the
  overfull-bar mechanism). Any note values, any time signature.
- Bar numbering: pickup unnumbered, next bar = 1.
- Toggle off → normal underfull bar (padded with silence as today).

## Phase 5 — Repeats + alternate endings

- Model on `Bar`: `repeatStart?: boolean`, `repeatEnd?: number` (play count ≥2, default 2),
  `endings?: readonly number[]` (volta membership, e.g. `[1]`, `[1,2]`).
- UI: right-click bar → Repeat start / Repeat end (×2 ×3 ×4…) / Ending 1st / 2nd / 1&2 /
  custom / Clear.
- New `packages/core/src/repeats.ts`: `unrollBars(bars) → { barIndex, pass }[]`:
  - `|:` sets the anchor; `:|` with count N jumps back N−1 times; anchor defaults to bar 0
    or the bar after the previous `:|`.
  - Volta: a bar with `endings` plays only when its set contains the current pass;
    contiguous equal-endings bars = one bracket.
  - Malformed input degrades gracefully (unmatched `:|` anchors at score start; endings
    with no active repeat always play). Unroll capped (counts ≤ 8).
- Playback: schedule built from the unrolled sequence; events keep original bar indices so
  the playhead follows jumps. Play-from-cursor starts at the first unrolled occurrence of
  the cursor bar.
- Render: repeat barlines (thick+thin+dots), "×N" label when count > 2, volta bracket with
  "1." / "2." labels above bar spans.

## Cross-cutting

- Persistence: schemaVersion 2 (new optional bar fields); loader accepts v1 and v2.
  Clipboard is in-memory only.
- Tests per phase: tuplet math + merge; unroll (counts, voltas, malformed); pickup
  advance; keymap load/conflict/reset; segments copy/paste round-trip; render smoke for
  barlines/brackets.
- Keyboard defaults chosen because digits are taken by fret entry; letters
  h p s b v m g t a o x n stay articulations (Let ring rebound from r to g).
