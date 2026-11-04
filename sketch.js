// sketch.js — p5.js drawing and input for SoDuckYou.
// Game rules, solving, and hints live in puzzle.js.

// Soft patch colors (one per patch letter, A, B, C, ...).
// Patch edges are also drawn as thick dark lines, so color is never the only cue.
const PATCH_COLORS = [
  "#F7B2B7", // rose
  "#A8D5F2", // sky
  "#BFE3A5", // mint
  "#D5C3F2", // lavender
  "#FAD09A", // peach
  "#9FDCD3", // teal
  "#F4BEE0", // pink
  "#D9D9AE", // sand
];
const INK = "#1f2a2e";
const MUTED_INK = "#3e4c51";
const CONFLICT = "#b00020";
const HINT = "#0b4fbf";
const BOARD_BG = "#ffffff";
const MAX_BOARD = 560;

let levelData;          // raw result of loadJSON
let levels = [];        // playable levels (drafts removed)
let levelIndex = 0;
let puzzle;             // Puzzle for the current level
let board;              // board[r][c] is EMPTY, XMARK, or DUCK
let undoStack = [];
let cursor = { r: 0, c: 0 };
let hintCells = [];
let solved = false;
let solvedAt = 0;
let completed = new Set();
let reduceMotion = false;

let canvasEl;
let boardPx, margin, cellPx;
let press = null;       // pointer gesture in progress

// ---------- loading ----------

function preload() {
  // loadJSON turns a top-level array into an object with keys "0", "1", ...
  levelData = loadJSON("levels.json");
}

function setup() {
  levels = Object.values(levelData).filter(lv => !lv.draft);
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  sizeBoard();
  const cnv = createCanvas(boardPx, boardPx);
  cnv.parent("board");
  canvasEl = cnv.elt;
  canvasEl.setAttribute("tabindex", "0");
  canvasEl.setAttribute("role", "application");
  canvasEl.setAttribute("aria-roledescription", "puzzle board");
  canvasEl.setAttribute("aria-describedby", "keys-help");
  canvasEl.addEventListener("keydown", onKey);
  canvasEl.addEventListener("focus", () => announceCell());
  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointerup", onPointerUp);
  canvasEl.addEventListener("pointercancel", () => { press = null; });
  canvasEl.addEventListener("contextmenu", e => e.preventDefault());
  textFont("sans-serif");

  completed = new Set(loadStore("completed", []));
  hookUpControls();

  const fromHash = parseInt(location.hash.replace("#", ""), 10);
  const start = Number.isInteger(fromHash) ? fromHash - 1 : loadStore("lastLevel", 0);
  loadLevel(constrain(start, 0, levels.length - 1));
}

function loadLevel(i) {
  levelIndex = i;
  puzzle = new Puzzle(levels[i]);
  board = loadStore(`board-${levels[i].name}`, null);
  if (!Array.isArray(board) || board.length !== puzzle.size) board = puzzle.newBoard();
  undoStack = [];
  hintCells = [];
  cursor = { r: 0, c: 0 };
  solved = puzzle.isSolved(board);
  saveStore("lastLevel", i);
  history.replaceState(null, "", `#${i + 1}`);

  sizeBoard();
  resizeCanvas(boardPx, boardPx);
  canvasEl.setAttribute("aria-label",
    `Level ${i + 1}, ${puzzle.name}: ${puzzle.size} by ${puzzle.size} pond with ${puzzle.letters.length} patches. ` +
    "Use arrow keys to move, Space to cycle empty, X, and duck.");

  buildLevelSelect();
  select("#level-info").html(
    `${puzzle.size}&times;${puzzle.size} pond &middot; place ${puzzle.size} ducks` +
    (completed.has(levels[i].name) ? " &middot; solved before" : ""));
  select("#prev-btn").elt.disabled = i === 0;
  select("#next-btn").elt.disabled = i === levels.length - 1;
  select("#win-panel").elt.hidden = !solved;
  if (solved) showWin(false);
  setStatus(solved ? "" : `Level ${i + 1}: ${puzzle.name}.`);
  updateUndoButton();
}

// ---------- drawing ----------

function sizeBoard() {
  boardPx = Math.floor(Math.min(MAX_BOARD, windowWidth - 32));
  margin = 6;
  const n = puzzle ? puzzle.size : 6;
  cellPx = (boardPx - 2 * margin) / n;
}

function windowResized() {
  sizeBoard();
  resizeCanvas(boardPx, boardPx);
}

function draw() {
  clear();
  noStroke();
  fill(BOARD_BG);
  rect(0, 0, width, height, 12);

  const n = puzzle.size;
  const blocked = select("#auto-x").elt.checked ? puzzle.blockedSquares(board) : new Set();
  const bad = puzzle.conflictingDucks(board);

  // Patch fills
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const [x, y] = cellXY(r, c);
    fill(patchColor(r, c));
    noStroke();
    rect(x, y, cellPx, cellPx);
  }

  // Thin square lines
  stroke(31, 42, 46, 90);
  strokeWeight(1);
  for (let i = 1; i < n; i++) {
    line(margin + i * cellPx, margin, margin + i * cellPx, margin + n * cellPx);
    line(margin, margin + i * cellPx, margin + n * cellPx, margin + i * cellPx);
  }

  // Thick patch edges
  stroke(INK);
  strokeWeight(Math.max(3, cellPx * 0.05));
  strokeCap(ROUND);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const [x, y] = cellXY(r, c);
    if (c < n - 1 && puzzle.patch(r, c) !== puzzle.patch(r, c + 1)) line(x + cellPx, y, x + cellPx, y + cellPx);
    if (r < n - 1 && puzzle.patch(r, c) !== puzzle.patch(r + 1, c)) line(x, y + cellPx, x + cellPx, y + cellPx);
  }
  noFill();
  rect(margin, margin, n * cellPx, n * cellPx, 4);

  // Contents
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const [x, y] = cellXY(r, c);
    const cx = x + cellPx / 2, cy = y + cellPx / 2;

    if (select("#show-letters").elt.checked) {
      noStroke();
      fill(INK);
      textSize(Math.max(12, cellPx * 0.2));
      textAlign(LEFT, TOP);
      text(puzzle.patch(r, c), x + cellPx * 0.08, y + cellPx * 0.06);
    }

    if (board[r][c] === XMARK) {
      drawX(cx, cy, cellPx * 0.17, Math.max(2.5, cellPx * 0.05), INK);
    } else if (blocked.has(`${r},${c}`)) {
      drawX(cx, cy, cellPx * 0.08, Math.max(1.5, cellPx * 0.025), MUTED_INK);
    } else if (board[r][c] === DUCK) {
      let bob = 0;
      if (solved && !reduceMotion && millis() - solvedAt < 4000) {
        bob = sin((millis() - solvedAt) / 150 + r + c) * cellPx * 0.04;
      }
      drawDuck(cx, cy + bob, cellPx);
      if (bad.has(`${r},${c}`)) drawConflict(x, y);
    }
  }

  // Hint outline
  if (hintCells.length) {
    const pulse = reduceMotion ? 0 : (sin(millis() / 200) + 1) * 1.5;
    for (const [r, c] of hintCells) {
      const [x, y] = cellXY(r, c);
      noFill();
      stroke(HINT);
      strokeWeight(4 + pulse);
      drawingContext.setLineDash([8, 5]);
      rect(x + 5, y + 5, cellPx - 10, cellPx - 10, 6);
      drawingContext.setLineDash([]);
    }
  }

  // Keyboard focus ring
  if (document.activeElement === canvasEl) {
    const [x, y] = cellXY(cursor.r, cursor.c);
    noFill();
    stroke("#ffffff");
    strokeWeight(6);
    rect(x + 2, y + 2, cellPx - 4, cellPx - 4, 6);
    stroke(INK);
    strokeWeight(3);
    rect(x + 2, y + 2, cellPx - 4, cellPx - 4, 6);
  }
}

function cellXY(r, c) {
  return [margin + c * cellPx, margin + r * cellPx];
}

function patchColor(r, c) {
  return PATCH_COLORS[puzzle.letters.indexOf(puzzle.patch(r, c)) % PATCH_COLORS.length];
}

function drawX(cx, cy, half, weight, col) {
  stroke(col);
  strokeWeight(weight);
  strokeCap(ROUND);
  line(cx - half, cy - half, cx + half, cy + half);
  line(cx - half, cy + half, cx + half, cy - half);
}

// A small original duck drawn with p5 shapes, facing right.
function drawDuck(cx, cy, size) {
  push();
  translate(cx, cy);
  scale(size / 115);
  stroke("#3b2a05");
  strokeWeight(3);
  strokeJoin(ROUND);

  fill("#FFD23F");
  triangle(-42, -2, -22, 6, -26, 24);          // tail
  ellipse(-4, 14, 66, 44);                      // body
  fill("#F2B21B");
  ellipse(-8, 13, 34, 20);                      // wing
  fill("#FFD23F");
  ellipse(18, -14, 38, 36);                     // head
  fill("#F07E1A");
  beginShape();                                 // bill
  vertex(33, -15);
  vertex(52, -10);
  vertex(50, -5);
  vertex(33, -5);
  endShape(CLOSE);
  noStroke();
  fill("#1b1b1b");
  circle(24, -20, 7);                           // eye
  fill("#ffffff");
  circle(25.5, -21.5, 2.5);
  pop();
}

// Conflicts get a red dashed ring and a "!" badge, not just color.
function drawConflict(x, y) {
  noFill();
  stroke(CONFLICT);
  strokeWeight(4);
  drawingContext.setLineDash([6, 4]);
  circle(x + cellPx / 2, y + cellPx / 2, cellPx * 0.86);
  drawingContext.setLineDash([]);
  const bx = x + cellPx * 0.82, by = y + cellPx * 0.18, br = Math.max(16, cellPx * 0.22);
  noStroke();
  fill(CONFLICT);
  circle(bx, by, br);
  fill("#ffffff");
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(br * 0.7);
  text("!", bx, by + 1);
  textStyle(NORMAL);
}

// ---------- input: pointer (mouse, pen, touch) ----------

function cellAt(px, py) {
  const c = Math.floor((px - margin) / cellPx);
  const r = Math.floor((py - margin) / cellPx);
  if (r < 0 || c < 0 || r >= puzzle.size || c >= puzzle.size) return null;
  return { r, c };
}

function onPointerDown(e) {
  const cell = cellAt(e.offsetX, e.offsetY);
  if (!cell || e.button === 1) return;
  e.preventDefault();
  if (e.button === 2) {            // right-click: quick X
    cursor = cell;
    toggleCell(cell.r, cell.c, XMARK);
    return;
  }
  canvasEl.focus({ preventScroll: true });
  canvasEl.setPointerCapture(e.pointerId);
  cursor = cell;
  press = { start: cell, last: cell, painting: false, startEmpty: board[cell.r][cell.c] === EMPTY };
}

function onPointerMove(e) {
  if (!press) return;
  const cell = cellAt(e.offsetX, e.offsetY);
  if (!cell || (cell.r === press.last.r && cell.c === press.last.c)) return;
  press.last = cell;
  if (!press.startEmpty || solved) return;
  if (!press.painting) {
    press.painting = true;
    pushUndo();
    board[press.start.r][press.start.c] = XMARK;
  }
  if (board[cell.r][cell.c] === EMPTY) board[cell.r][cell.c] = XMARK;
  cursor = cell;
}

function onPointerUp() {
  if (!press) return;
  if (press.painting) {
    changed("Marked squares with X.");
  } else {
    cycleCell(press.start.r, press.start.c);
  }
  press = null;
}

// ---------- input: keyboard ----------

function onKey(e) {
  const n = puzzle.size;
  const k = e.key;
  let handled = true;
  if (k === "ArrowUp") moveCursor(-1, 0);
  else if (k === "ArrowDown") moveCursor(1, 0);
  else if (k === "ArrowLeft") moveCursor(0, -1);
  else if (k === "ArrowRight") moveCursor(0, 1);
  else if (k === "Home") { cursor.c = 0; announceCell(); }
  else if (k === "End") { cursor.c = n - 1; announceCell(); }
  else if (k === " " || k === "Enter") cycleCell(cursor.r, cursor.c);
  else if (k === "d" || k === "D") toggleCell(cursor.r, cursor.c, DUCK);
  else if (k === "x" || k === "X") toggleCell(cursor.r, cursor.c, XMARK);
  else if (k === "Delete" || k === "Backspace") setCell(cursor.r, cursor.c, EMPTY);
  else if ((k === "z" || k === "Z") && (e.ctrlKey || e.metaKey)) undo();
  else if (k === "u" || k === "U") undo();
  else if (k === "h" || k === "H") showHint();
  else if (k === "r" || k === "R") readBoard();
  else handled = false;
  if (handled) e.preventDefault();
}

function moveCursor(dr, dc) {
  cursor.r = constrain(cursor.r + dr, 0, puzzle.size - 1);
  cursor.c = constrain(cursor.c + dc, 0, puzzle.size - 1);
  announceCell();
}

// ---------- board changes ----------

function cycleCell(r, c) {
  cursor = { r, c };
  setCell(r, c, (board[r][c] + 1) % 3);   // empty -> X -> duck -> empty
}

function toggleCell(r, c, value) {
  setCell(r, c, board[r][c] === value ? EMPTY : value);
}

function setCell(r, c, value) {
  if (solved || board[r][c] === value) return;
  pushUndo();
  board[r][c] = value;
  changed(describeCell(r, c));
}

function pushUndo() {
  undoStack.push(board.map(row => [...row]));
  if (undoStack.length > 200) undoStack.shift();
  updateUndoButton();
}

function undo() {
  if (!undoStack.length || solved) return;
  board = undoStack.pop();
  changed("Undone. " + describeCell(cursor.r, cursor.c));
}

function changed(message) {
  hintCells = [];
  saveStore(`board-${levels[levelIndex].name}`, board);
  updateUndoButton();
  if (puzzle.isSolved(board)) {
    solved = true;
    solvedAt = millis();
    completed.add(levels[levelIndex].name);
    saveStore("completed", [...completed]);
    buildLevelSelect();
    showWin(true);
    return;
  }
  const ducks = puzzle.ducksOn(board).length;
  let extra = ` ${ducks} of ${puzzle.size} ducks placed.`;
  if (puzzle.conflictingDucks(board).size) extra += " Some ducks break a rule.";
  setStatus(message + extra);
}

function updateUndoButton() {
  select("#undo-btn").elt.disabled = undoStack.length === 0 || solved;
}

function showHint() {
  if (solved) return;
  const h = puzzle.hint(board);
  hintCells = h.cells;
  if (h.cells.length) cursor = { r: h.cells[0][0], c: h.cells[0][1] };
  setStatus("Hint: " + h.message);
}

function showWin(fresh) {
  const last = levelIndex === levels.length - 1;
  const msg = last
    ? `You solved ${puzzle.name}, the last level! Quack-tastic.`
    : `You solved level ${levelIndex + 1}, ${puzzle.name}!`;
  select("#win-text").html(msg);
  select("#win-next-btn").elt.hidden = last;
  select("#win-panel").elt.hidden = false;
  updateUndoButton();
  if (fresh) {
    setStatus(msg);
    (last ? select("#win-text").elt : select("#win-next-btn").elt).focus();
  }
}

// ---------- screen reader text ----------

function describeCell(r, c) {
  const v = board[r][c];
  let what = "empty";
  if (v === DUCK) what = puzzle.conflictingDucks(board).has(`${r},${c}`) ? "duck, breaks a rule" : "duck";
  else if (v === XMARK) what = "X";
  else if (select("#auto-x").elt.checked && puzzle.blockedSquares(board).has(`${r},${c}`)) what = "ruled out";
  return `Row ${r + 1}, column ${c + 1}, patch ${puzzle.patch(r, c)}: ${what}.`;
}

function announceCell() {
  setStatus(describeCell(cursor.r, cursor.c));
}

function readBoard() {
  const parts = [];
  for (let r = 0; r < puzzle.size; r++) {
    const row = [];
    for (let c = 0; c < puzzle.size; c++) {
      const v = board[r][c];
      row.push(puzzle.patch(r, c) + (v === DUCK ? " duck" : v === XMARK ? " X" : ""));
    }
    parts.push(`Row ${r + 1}: ${row.join(", ")}.`);
  }
  setStatus(parts.join(" "));
}

function setStatus(text) {
  select("#status").html("");
  // Re-setting on the next frame makes repeated messages get announced again.
  requestAnimationFrame(() => select("#status").elt.textContent = text);
}

// ---------- page controls ----------

function hookUpControls() {
  select("#prev-btn").mousePressed(() => goTo(levelIndex - 1));
  select("#next-btn").mousePressed(() => goTo(levelIndex + 1));
  select("#win-next-btn").mousePressed(() => goTo(levelIndex + 1, true));
  select("#level-select").changed(() => goTo(int(select("#level-select").value())));
  select("#hint-btn").mousePressed(showHint);
  select("#undo-btn").mousePressed(undo);
  select("#clear-btn").mousePressed(() => {
    if (board.every(row => row.every(v => v === EMPTY))) return;
    pushUndo();
    board = puzzle.newBoard();
    solved = false;
    select("#win-panel").elt.hidden = true;
    changed("Board cleared.");
  });
  window.addEventListener("hashchange", () => {
    const i = parseInt(location.hash.replace("#", ""), 10) - 1;
    if (Number.isInteger(i) && i !== levelIndex && i >= 0 && i < levels.length) loadLevel(i);
  });
}

function goTo(i, focusBoard = false) {
  if (i < 0 || i >= levels.length) return;
  loadLevel(i);
  if (focusBoard) canvasEl.focus();
}

function buildLevelSelect() {
  const sel = select("#level-select").elt;
  sel.innerHTML = "";
  levels.forEach((lv, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${i + 1}. ${lv.name} (${lv.size}×${lv.size})${completed.has(lv.name) ? " ✓ solved" : ""}`;
    sel.appendChild(opt);
  });
  sel.value = levelIndex;
}

// ---------- saving progress (browser only, optional) ----------

function loadStore(key, fallback) {
  try {
    const v = localStorage.getItem("soduckyou-" + key);
    return v === null ? fallback : JSON.parse(v);
  } catch (err) {
    return fallback;
  }
}

function saveStore(key, value) {
  try {
    localStorage.setItem("soduckyou-" + key, JSON.stringify(value));
  } catch (err) {
    // Storage unavailable (private window etc.): the game still works.
  }
}
