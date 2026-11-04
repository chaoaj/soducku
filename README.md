# SoDuckYou

A p5.js logic puzzle in the spirit of [Meowdoku](https://meowdoku.app), with ducks,
built on the level format from CS 149 PA4 (SoDuckYou).

[Play it](https://chaoaj.github.io/team0x-chao-fa26/)

## Rules

- Every row gets exactly one duck.
- Every column gets exactly one duck.
- Every patch (colored region with a thick outline) gets exactly one duck.
- No two ducks touch, not even diagonally.

## Controls

| Action | Mouse / touch | Keyboard (board focused) |
| --- | --- | --- |
| Cycle empty → X → duck | Tap / click | Space or Enter |
| Place or remove a duck | Tap twice | D |
| Place or remove an X | Right-click, or drag from an empty square | X |
| Clear a square | Tap until empty | Delete / Backspace |
| Move | | Arrow keys, Home, End |
| Hint / Undo | Buttons | H / U or Ctrl+Z |
| Read the board aloud | | R |

Hints work like Meowdoku's: they point out mistakes first (ducks breaking a rule,
ducks not in the solution, X marks covering a needed square), then the next logical
move. Every level can be solved by following hints alone.

## Accessibility

- Patches are separated by thick dark outlines, so color is never the only cue;
  "Show patch letters" adds the PA4 letters to every square.
- Rule-breaking ducks get a dashed ring and a "!" badge, not just a color change.
- Full keyboard play, with a visible focus square on the board.
- A live status line announces the focused square, each move, hints, and wins
  for screen readers.
- Text and controls meet WCAG 2.2 AA contrast; buttons are at least 44px tall;
  animations stop when the system's "reduce motion" setting is on.
- Checked with axe-core (no violations).

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout, buttons, help text |
| `sketch.js` | p5.js drawing and input |
| `puzzle.js` | Rules, solver, and hint logic (no p5, testable with Node) |
| `levels.json` | 300 playable levels in the PA4 format |
| `tools/generate_levels.py` | Makes new levels |
| `style.css` | Page styles |

## Levels (`levels.json`)

Same format as PA4: a list of dictionaries with `name`, `size`, `grid`
(one string per row; same letter = same patch), and an optional `draft: true`
that the game skips.

```json
{"name": "Puddle", "size": 4, "grid": ["ABBC", "ABBC", "ABBD", "ADDD"]}
```

The file has 300 playable levels, each with exactly one solution, and every
one can be solved by following hints alone:

| Levels | Size |
| --- | --- |
| 1–10 | 4×4 (starts with PA4's Puddle) |
| 11–29 | 5×5 (starts with PA4's Pond) |
| 30–65 | 6×6 |
| 66–105 | 7×7 |
| 106–190 | 8×8 |
| 191–300 | 9×9 (ends with Open Ocean) |

Difficulty climbs within each size. PA4's Mud Hole draft is also in the file,
and the game skips it. PA4's `play_soduckyou.py` asks for sizes 4–6, so the
7×7, 8×8, and 9×9 levels only appear in the web game.

To make a new set:

```bash
python3 tools/generate_levels.py --seed 42   # takes a few minutes
```

## Running locally

`loadJSON` can't read files from a `file://` page, so use a local server, for
example VS Code Live Server or `python3 -m http.server`, then open
`http://localhost:8000`. Add `#12` to the URL to open level 12.
