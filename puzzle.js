// puzzle.js — game rules, solver, and hint logic for SoDUCKu.
// No p5.js here, so this file can also be tested with Node:
//   node -e "const P=require('./puzzle.js'); ..."

const EMPTY = 0;
const XMARK = 1;
const DUCK = 2;

class Puzzle {
  /**
   * @param {{name:string, size:number, grid:string[]}} level  one entry from levels.json
   */
  constructor(level) {
    this.name = level.name;
    this.size = level.size;
    this.grid = level.grid;
    if (this.grid.length !== this.size || this.grid.some(row => row.length !== this.size)) {
      throw new Error(`Level "${this.name}" grid does not match size ${this.size}`);
    }
    this.letters = [...new Set(this.grid.join(""))].sort();
    this.groups = this.buildGroups();
    const sols = this.solve(2);
    this.solution = sols[0] || null;     // array: solution[row] = column
    this.unique = sols.length === 1;
  }

  patch(r, c) {
    return this.grid[r][c];
  }

  // Rows, columns, and patches: each must hold exactly one duck.
  buildGroups() {
    const n = this.size;
    const groups = [];
    for (let r = 0; r < n; r++) {
      groups.push({ kind: "row", label: `Row ${r + 1}`, cells: [...Array(n)].map((_, c) => [r, c]) });
    }
    for (let c = 0; c < n; c++) {
      groups.push({ kind: "column", label: `Column ${c + 1}`, cells: [...Array(n)].map((_, r) => [r, c]) });
    }
    for (const L of this.letters) {
      const cells = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.grid[r][c] === L) cells.push([r, c]);
      groups.push({ kind: "patch", label: `Patch ${L}`, cells });
    }
    return groups;
  }

  // True when ducks at (r1,c1) and (r2,c2) would break a rule.
  conflicts(r1, c1, r2, c2) {
    if (r1 === r2 && c1 === c2) return false;
    return r1 === r2 || c1 === c2 ||
      this.grid[r1][c1] === this.grid[r2][c2] ||
      (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1);
  }

  // Backtracking solver, one row at a time. Returns up to `limit` solutions.
  solve(limit = 2) {
    const n = this.size;
    const out = [];
    const cols = new Set();
    const patches = new Set();
    const placed = [];
    const go = (r) => {
      if (out.length >= limit) return;
      if (r === n) { out.push([...placed]); return; }
      for (let c = 0; c < n; c++) {
        const p = this.grid[r][c];
        if (cols.has(c) || patches.has(p)) continue;
        if (r > 0 && Math.abs(placed[r - 1] - c) <= 1) continue;
        cols.add(c); patches.add(p); placed.push(c);
        go(r + 1);
        placed.pop(); cols.delete(c); patches.delete(p);
      }
    };
    go(0);
    return out;
  }

  newBoard() {
    return [...Array(this.size)].map(() => Array(this.size).fill(EMPTY));
  }

  ducksOn(board) {
    const list = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      if (board[r][c] === DUCK) list.push([r, c]);
    }
    return list;
  }

  // Ducks that break a rule with another duck, as "r,c" keys.
  conflictingDucks(board) {
    const ducks = this.ducksOn(board);
    const bad = new Set();
    for (let i = 0; i < ducks.length; i++) for (let j = i + 1; j < ducks.length; j++) {
      const [a, b] = ducks[i], [c, d] = ducks[j];
      if (this.conflicts(a, b, c, d)) { bad.add(`${a},${b}`); bad.add(`${c},${d}`); }
    }
    return bad;
  }

  // Empty squares that can't hold a duck because a placed duck rules them out.
  blockedSquares(board) {
    const ducks = this.ducksOn(board);
    const out = new Set();
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      if (board[r][c] !== EMPTY) continue;
      if (ducks.some(([dr, dc]) => this.conflicts(r, c, dr, dc))) out.add(`${r},${c}`);
    }
    return out;
  }

  isSolved(board) {
    return this.ducksOn(board).length === this.size && this.conflictingDucks(board).size === 0;
  }

  /**
   * Suggest the next step. Returns {cells:[[r,c],...], message:string}.
   * Order follows Meowdoku: fix mistakes first, then point to a logical move.
   */
  hint(board) {
    const n = this.size;
    const sol = this.solution;
    const where = (r, c) => `row ${r + 1}, column ${c + 1}`;

    // 1. Ducks that break a rule.
    const bad = [...this.conflictingDucks(board)].map(k => k.split(",").map(Number));
    if (bad.length) {
      return { cells: bad, message: "These ducks break a rule: they share a row, column, or patch, or they touch. Remove one." };
    }
    // 2. Ducks that are not part of the solution.
    for (const [r, c] of this.ducksOn(board)) {
      if (sol && sol[r] !== c) {
        return { cells: [[r, c]], message: `The duck at ${where(r, c)} can't be part of the solution. Remove it.` };
      }
    }
    // 3. X marks covering a square the solution needs.
    if (sol) for (let r = 0; r < n; r++) {
      if (board[r][sol[r]] === XMARK) {
        return { cells: [[r, sol[r]]], message: `The X at ${where(r, sol[r])} is covering a square that needs a duck. Clear it.` };
      }
    }

    // Open = could still hold a duck given current ducks and X marks.
    const blocked = this.blockedSquares(board);
    const isOpen = (r, c) => board[r][c] === EMPTY && !blocked.has(`${r},${c}`);
    const hasDuck = g => g.cells.some(([r, c]) => board[r][c] === DUCK);

    // 4. A row, column, or patch with only one open square.
    for (const g of this.groups) {
      if (hasDuck(g)) continue;
      const open = g.cells.filter(([r, c]) => isOpen(r, c));
      if (open.length === 1) {
        const [r, c] = open[0];
        return { cells: [[r, c]], message: `${g.label} has only one square left for a duck: ${where(r, c)}.` };
      }
    }
    // 5. Squares ruled out by placed ducks that aren't marked yet.
    if (blocked.size) {
      const cells = [...blocked].map(k => k.split(",").map(Number));
      return { cells, message: `${cells.length} highlighted square${cells.length > 1 ? "s" : ""} can't hold a duck because ${cells.length > 1 ? "they share" : "it shares"} a row, column, or patch with a duck, or touch${cells.length > 1 ? "" : "es"} one. Mark ${cells.length > 1 ? "them" : "it"} with X.` };
    }
    // 6. A square whose duck would leave some group with nowhere to go.
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!isOpen(r, c)) continue;
      for (const g of this.groups) {
        if (hasDuck(g) || g.cells.some(([gr, gc]) => gr === r && gc === c)) continue;
        const open = g.cells.filter(([gr, gc]) => isOpen(gr, gc));
        if (open.length && open.every(([gr, gc]) => this.conflicts(r, c, gr, gc))) {
          return { cells: [[r, c]], message: `A duck at ${where(r, c)} would leave ${g.label.toLowerCase()} with no room for its duck. Mark it with X.` };
        }
      }
    }
    // 7. Confined groups: k rows/columns/patches that fit inside k of another kind.
    const conf = this.confinedGroups(isOpen);
    if (conf) return conf;

    // 8. Fallback: show a square from the solution.
    if (sol) for (let r = 0; r < n; r++) {
      if (board[r][sol[r]] !== DUCK) {
        return { cells: [[r, sol[r]]], message: `Try a duck at ${where(r, sol[r])}.` };
      }
    }
    return { cells: [], message: "Every duck is in place!" };
  }

  /**
   * "Confined groups" hint (the same rule as tools/generate_levels.py).
   * If k groups of one kind (rows, columns, or patches) have all their open
   * squares inside k groups of another kind, those k groups must supply the
   * other groups' ducks, so every other open square in them is ruled out.
   * Example: patches C and F only have room in rows 3 and 4, so the ducks of
   * rows 3 and 4 are C's and F's; nothing else in rows 3 and 4 can be a duck.
   * Returns a hint for the smallest k that rules something out, or null.
   */
  confinedGroups(isOpen, maxK = 5) {
    const n = this.size;
    const open = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (isOpen(r, c)) open.push([r, c]);
    const keyOf = (kind, [r, c]) => kind === 0 ? r : kind === 1 ? c : this.letters.indexOf(this.grid[r][c]);

    let best = null;
    for (let a = 0; a < 3; a++) {
      const groups = new Map();
      for (const cell of open) {
        const id = keyOf(a, cell);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(cell);
      }
      const ids = [...groups.keys()].sort((x, y) => x - y);
      for (let b = 0; b < 3; b++) {
        if (a === b) continue;
        const reach = new Map(ids.map(id => [id, new Set(groups.get(id).map(cell => keyOf(b, cell)))]));
        for (let k = 1; k <= Math.min(maxK, ids.length - 1); k++) {
          if (best && best.k <= k) break;
          for (const combo of choose(ids, k)) {
            const used = new Set();
            for (const id of combo) for (const x of reach.get(id)) used.add(x);
            if (used.size !== k) continue;
            const inCombo = new Set(combo);
            const out = open.filter(cell => used.has(keyOf(b, cell)) && !inCombo.has(keyOf(a, cell)));
            if (out.length) {
              best = { k, a, b, combo, used: [...used].sort((x, y) => x - y), out };
              break;
            }
          }
        }
      }
    }
    if (!best) return null;

    const A = this.groupNames(best.a, best.combo);
    const B = this.groupNames(best.b, best.used);
    const cap = s => s[0].toUpperCase() + s.slice(1);
    const m = best.out.length;
    const squares = m === 1 ? "The highlighted square" : `The ${m} highlighted squares`;
    const mark = m === 1 ? "Mark it with X." : "Mark them with X.";
    let message;
    if (best.k === 1) {
      message = `${cap(A)} only has open squares in ${B}, so ${B}'s duck must be in ${A}. ` +
        `${squares} in ${B} outside ${A} can't hold a duck. ${mark}`;
    } else {
      const kw = numberWord(best.k);
      const aPlural = ["rows", "columns", "patches"][best.a];
      const bPlural = ["rows", "columns", "patches"][best.b];
      message = `${cap(A)} only have open squares in ${B}. ${cap(kw)} ${aPlural} need ${kw} ducks ` +
        `from just ${kw} ${bPlural}, so all the ducks of ${B} must be in ${A}. ` +
        `${squares} can't hold a duck. ${mark}`;
    }
    return { cells: best.out, message };
  }

  // "row 3", "rows 3 and 4", "patches B, C, and F"
  groupNames(kind, ids) {
    const word = ["row", "column", "patch"][kind];
    const plural = ["rows", "columns", "patches"][kind];
    const names = ids.map(id => kind === 2 ? this.letters[id] : String(id + 1));
    if (names.length === 1) return `${word} ${names[0]}`;
    const list = names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    return `${plural} ${list}`;
  }
}

// All k-element subsets of arr, in order.
function* choose(arr, k, start = 0, picked = []) {
  if (picked.length === k) { yield [...picked]; return; }
  for (let i = start; i <= arr.length - (k - picked.length); i++) {
    picked.push(arr[i]);
    yield* choose(arr, k, i + 1, picked);
    picked.pop();
  }
}

function numberWord(k) {
  return ["zero", "one", "two", "three", "four", "five"][k] || String(k);
}

if (typeof module !== "undefined") module.exports = { Puzzle, EMPTY, XMARK, DUCK };
