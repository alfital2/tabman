# TabKit

A keyboard-first, browser-based guitar tablature editor with its own SVG
renderer and Web-Audio playback engine (Karplus-Strong synthesis, no samples,
no third-party tab library).

```bash
pnpm install
pnpm dev        # editor at http://localhost:5173
pnpm check      # typecheck + full test suite
pnpm test       # vitest run
pnpm build      # typecheck + production build of the web app
```

## Packages

| Package | What it is | Depends on |
|---|---|---|
| `@tabkit/core` | Immutable score model, exact rational rhythm math, music theory, editor engine with snapshot undo/redo | — |
| `@tabkit/render` | `Score` → drawing primitives + hit-testing + self-contained SVG export. Pure, no DOM | core |
| `@tabkit/playback` | Pure scheduling (legato chains, pitch automation, metronome) + Karplus-Strong synth + the Web Audio `TabPlayer` | core |
| `@tabkit/web` | React + Vite editor UI | all |

Dependency rule: strictly downward; consumers import package barrels only.

## Using the editor

- **Type a tab**: click a cell (or arrow to it), type a fret. Two digits within
  900 ms combine (`1`,`2` → 12). Arrows move; down/up builds chords.
- **Rhythm**: note-value brush in the panel or `[` `]`; retime with `+` `-`.
- **Select**: drag a marquee; drag notes vertically to re-string
  (pitch-preserving), drag a selection horizontally onto another bar.
- **Articulate**: select notes, click a technique; bend/slide/harmonic open a
  variant popover. Re-click the active variant to clear it.
- **Bars**: right-click for insert/duplicate/delete/copy/paste and per-bar
  time signatures.
- **Play**: `Space` (starts at the cursor), metronome, 0.5–1.5× speed,
  clean/distortion tones, amber playhead follows the sound.
- **Files**: the document autosaves to localStorage; Export/Import moves
  versioned `.tabkit.json` files.

## Design decisions worth knowing

- All rhythm math is exact `Fraction` arithmetic — bars fill exactly, no float
  drift, triplets sum perfectly.
- Undo/redo is snapshot-based (cheap via structural sharing). Metadata
  (title/tempo/…) is deliberately *not* undoable and survives undo of other
  edits.
- Underfilled bars play with a tail of silence (metronome grid stays locked);
  overfull bars advance by their content so notes never overlap.
- Hammer-on / pull-off / legato slides don't re-pick: the source note rings
  through the chain and carries the folded pitch automation, including bends
  on slurred targets. Shift slides glide but re-pick.
- Loading a corrupt/legacy document never crashes: every node is revalidated
  through the factories; unknown articulations are dropped, legacy string tags
  migrated.
- "New"/demo loads keep the previous document reachable via undo.
