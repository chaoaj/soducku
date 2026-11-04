// puzzle.js — game rules, solver, and hint logic for SoDuckYou.
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
    // 7. Fallback: show a square from the solution.
    if (sol) for (let r = 0; r < n; r++) {
      if (board[r][sol[r]] !== DUCK) {
        return { cells: [[r, sol[r]]], message: `Try a duck at ${where(r, sol[r])}.` };
      }
    }
    return { cells: [], message: "Every duck is in place!" };
  }
}

if (typeof module !== "undefined") module.exports = { Puzzle, EMPTY, XMARK, DUCK };
