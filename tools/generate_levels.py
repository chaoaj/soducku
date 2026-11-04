"""Generate SoDuckYou levels in the PA4 levels.json format.

Each level is a dict with "name", "size", and "grid" (a list of strings,
one letter per square; squares with the same letter form one patch).
Optional "draft": true marks a level the game should skip.

Every generated level is checked to have exactly one solution and to be
solvable by the same step-by-step logic the in-game hint button uses.

Levels 1-50 (4x4 to 6x6) grow random patches and keep the boards that happen
to have one solution. Levels 51-150 (harder 6x6, then 7x7 and 8x8) use
"repair": when a board has a second solution, a square of that solution is
moved into a neighboring patch until only the intended solution is left.

Usage:
    python3 tools/generate_levels.py            # writes levels.json (150 levels)
    python3 tools/generate_levels.py --seed 7   # different puzzles
"""

import argparse
import json
import random

LETTERS = "ABCDEFGHIJ"

# The three sample levels from the PA4 handout, kept at the front of the file.
PA4_SAMPLES = [
    {"name": "Puddle", "size": 4, "grid": ["ABBC", "ABBC", "ABBD", "ADDD"]},
    {"name": "Mud Hole", "size": 4, "draft": True,
     "grid": ["AABB", "AABB", "CCDD", "CCDD"]},
    {"name": "Pond", "size": 5,
     "grid": ["AAAAA", "AAABC", "DEBBB", "DDBBB", "DDBBB"]},
]

NAMES = [
    "Splash", "Dabble", "Waddle", "Quackers", "Paddle", "Ripple", "Bill",
    "Feather", "Puddle Jump", "Mallard", "Duckweed", "Reed Bed", "Lily Pad",
    "Cattail", "Drake", "Duckling", "Teal", "Wigeon", "Pintail", "Bufflehead",
    "Goldeneye", "Merganser", "Eider", "Shoveler", "Gadwall", "Canvasback",
    "Redhead", "Scaup", "Pochard", "Mandarin", "Muscovy", "Pekin", "Runner",
    "Rouen", "Cayuga", "Wood Duck", "Harlequin", "Smew", "Garganey", "Ruddy",
    "Mill Pond", "Marsh", "Bayou", "Oxbow", "Estuary", "Lagoon", "Delta",
    "Backwater", "Fen", "Great Lake",
]


# Names for levels 51-150: 99 adjective + water pairs, then a finale.
_ADJ = ["Misty", "Sunny", "Quiet", "Mossy", "Breezy", "Hidden", "Golden",
        "Silver", "Frosty", "Muddy"]
_WATER = ["Cove", "Creek", "Inlet", "Brook", "Slough", "Shallows", "Rapids",
          "Reeds", "Spring", "Bay"]
EXTRA_NAMES = [f"{a} {w}" for a in _ADJ for w in _WATER]
FINAL_NAME = "Great Lake"


def neighbors8(r, c, n):
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if (dr or dc) and 0 <= r + dr < n and 0 <= c + dc < n:
                yield r + dr, c + dc


def count_solutions(grid, limit=2):
    """Backtracking count of valid duck placements (stops at limit)."""
    n = len(grid)
    used_cols, used_regions = set(), set()
    placed = []
    count = 0

    def go(r):
        nonlocal count
        if count >= limit:
            return
        if r == n:
            count += 1
            return
        for c in range(n):
            reg = grid[r][c]
            if c in used_cols or reg in used_regions:
                continue
            if placed and abs(placed[-1] - c) <= 1:
                continue
            used_cols.add(c)
            used_regions.add(reg)
            placed.append(c)
            go(r + 1)
            placed.pop()
            used_cols.discard(c)
            used_regions.discard(reg)

    go(0)
    return count


def logic_solve(grid):
    """Solve with the hint logic. Returns (solved, steps, hard_steps).

    Rule 1 (single): a row, column, or patch with one open square gets a duck.
    Rule 2 (block): a square whose duck would leave some row, column, or
    patch with no open squares gets an X. Rule 2 counts as a "hard" step.
    """
    n = len(grid)
    open_ = {(r, c) for r in range(n) for c in range(n)}
    ducks = set()
    steps = hard = 0

    def groups():
        for r in range(n):
            yield [(r, c) for c in range(n)]
        for c in range(n):
            yield [(r, c) for r in range(n)]
        for letter in sorted({ch for row in grid for ch in row}):
            yield [(r, c) for r in range(n) for c in range(n)
                   if grid[r][c] == letter]

    def attacked(cell):
        r, c = cell
        out = set()
        for (rr, cc) in open_:
            if rr == r or cc == c or grid[rr][cc] == grid[r][c]:
                out.add((rr, cc))
        for nb in neighbors8(r, c, n):
            out.add(nb)
        out.discard(cell)
        return out

    def place(cell):
        ducks.add(cell)
        open_.difference_update(attacked(cell))
        open_.discard(cell)

    while len(ducks) < n:
        progress = False
        for g in groups():
            if any(cell in ducks for cell in g):
                continue
            cand = [cell for cell in g if cell in open_]
            if not cand:
                return False, steps, hard
            if len(cand) == 1:
                place(cand[0])
                steps += 1
                progress = True
                break
        if progress:
            continue
        for cell in sorted(open_):
            kill = attacked(cell) | {cell}
            for g in groups():
                if any(x in ducks for x in g):
                    continue
                cand = [x for x in g if x in open_]
                if cand and all(x in kill for x in cand) and cell not in g:
                    open_.discard(cell)
                    steps += 1
                    hard += 1
                    progress = True
                    break
            if progress:
                break
        if not progress:
            return False, steps, hard
    return True, steps, hard


def random_solution(n, rng):
    while True:
        perm = list(range(n))
        rng.shuffle(perm)
        if all(abs(perm[i] - perm[i + 1]) > 1 for i in range(n - 1)):
            return perm


def random_regions(n, perm, rng):
    owner = [[-1] * n for _ in range(n)]
    for r, c in enumerate(perm):
        owner[r][c] = r
    left = n * n - n
    while left:
        reg = rng.randrange(n)
        frontier = [
            (rr, cc)
            for r in range(n) for c in range(n) if owner[r][c] == reg
            for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1))
            if 0 <= rr < n and 0 <= cc < n and owner[rr][cc] == -1
        ]
        if frontier:
            rr, cc = rng.choice(frontier)
            owner[rr][cc] = reg
            left -= 1
    # Relabel A, B, C... in reading order, like the PA4 samples.
    mapping = {}
    rows = []
    for r in range(n):
        row = ""
        for c in range(n):
            o = owner[r][c]
            if o not in mapping:
                mapping[o] = LETTERS[len(mapping)]
            row += mapping[o]
        rows.append(row)
    return rows


def generate(n, how_many, rng, seen):
    found = []
    tries = 0
    while len(found) < how_many:
        tries += 1
        grid = random_regions(n, random_solution(n, rng), rng)
        key = "".join(grid)
        if key in seen:
            continue
        if count_solutions(grid) != 1:
            continue
        ok, steps, hard = logic_solve(grid)
        if not ok:
            continue
        seen.add(key)
        found.append((hard, steps, grid))
    return found


def _connected_without(owner, n, reg, skip):
    """True if patch `reg` stays connected (and non-empty) without `skip`."""
    cells = [(r, c) for r in range(n) for c in range(n)
             if owner[r][c] == reg and (r, c) != skip]
    if not cells:
        return False
    keep = set(cells)
    seen = {cells[0]}
    stack = [cells[0]]
    while stack:
        r, c = stack.pop()
        for q in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if q in keep and q not in seen:
                seen.add(q)
                stack.append(q)
    return len(seen) == len(cells)


def _solutions(owner, n, limit=2):
    grid = ["".join(LETTERS[o] for o in row) for row in owner]
    out = []
    cols, regs, placed = set(), set(), []

    def go(r):
        if len(out) >= limit:
            return
        if r == n:
            out.append(list(placed))
            return
        for c in range(n):
            g = grid[r][c]
            if c in cols or g in regs or (placed and abs(placed[-1] - c) <= 1):
                continue
            cols.add(c)
            regs.add(g)
            placed.append(c)
            go(r + 1)
            placed.pop()
            cols.discard(c)
            regs.discard(g)

    go(0)
    return out


def repaired_regions(n, rng, max_repairs=300):
    """Grow random patches, then repair until exactly one solution remains."""
    perm = random_solution(n, rng)
    owner = [[-1] * n for _ in range(n)]
    for r, c in enumerate(perm):
        owner[r][c] = r
    left = n * n - n
    while left:
        reg = rng.randrange(n)
        frontier = [
            (rr, cc)
            for r in range(n) for c in range(n) if owner[r][c] == reg
            for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1))
            if 0 <= rr < n and 0 <= cc < n and owner[rr][cc] == -1
        ]
        if frontier:
            rr, cc = rng.choice(frontier)
            owner[rr][cc] = reg
            left -= 1

    target = set(enumerate(perm))
    for _ in range(max_repairs):
        sols = _solutions(owner, n)
        if len(sols) == 1:
            break
        alt = [s for s in sols if s != perm][0]
        alt_regs = {owner[r][c] for r, c in enumerate(alt)}
        moves = []
        for r, c in enumerate(alt):
            if (r, c) in target:
                continue
            for q in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= q[0] < n and 0 <= q[1] < n and owner[q[0]][q[1]] != owner[r][c]:
                    new = owner[q[0]][q[1]]
                    # Best moves put two of the other solution's ducks in one patch.
                    moves.append((new not in alt_regs, (r, c), new))
        rng.shuffle(moves)
        moves.sort(key=lambda m: m[0])
        for _, (r, c), new in moves:
            if _connected_without(owner, n, owner[r][c], (r, c)):
                owner[r][c] = new
                break
        else:
            return None
    else:
        return None

    mapping = {}
    rows = []
    for r in range(n):
        row = ""
        for c in range(n):
            o = owner[r][c]
            if o not in mapping:
                mapping[o] = LETTERS[len(mapping)]
            row += mapping[o]
        rows.append(row)
    return rows


def generate_repaired(n, how_many, rng, seen, min_hard=0, pool_factor=3):
    """Make a pool of repaired boards and keep an even spread, easier first."""
    pool = []
    while len(pool) < how_many * pool_factor:
        grid = repaired_regions(n, rng)
        if grid is None or "".join(grid) in seen:
            continue
        if count_solutions(grid) != 1:
            continue
        ok, steps, hard = logic_solve(grid)
        if not ok or hard < min_hard:
            continue
        seen.add("".join(grid))
        pool.append((hard, steps, grid))
    pool.sort(key=lambda t: (t[0], t[1]))
    # Take evenly spaced picks so difficulty climbs steadily.
    picks = [pool[round(i * (len(pool) - 1) / (how_many - 1))] for i in range(how_many)]
    for t in pool:
        if t not in picks:
            seen.discard("".join(t[2]))
    return picks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=149)
    ap.add_argument("--out", default="levels.json")
    args = ap.parse_args()
    rng = random.Random(args.seed)

    playable = [lv for lv in PA4_SAMPLES if not lv.get("draft")]
    for lv in playable:
        assert count_solutions(lv["grid"]) == 1, lv["name"]
    seen = {"".join(lv["grid"]) for lv in PA4_SAMPLES}

    # 50 playable levels: 2 samples + 48 generated (10x4, 18x5, 20x6).
    plan = {4: 9, 5: 18, 6: 21}
    levels = PA4_SAMPLES[:2]
    names = iter(NAMES)
    for n, k in plan.items():
        if n == 5:
            levels.append(PA4_SAMPLES[2])
        batch = generate(n, k, rng, seen)
        batch.sort(key=lambda t: (t[0], t[1]))  # easier first
        for hard, steps, grid in batch:
            levels.append({"name": next(names), "size": n, "grid": grid})

    # Levels 51-150: 15 harder 6x6, 40 7x7, 45 8x8.
    rng2 = random.Random(args.seed + 1)
    shuffled = list(EXTRA_NAMES)
    rng2.shuffle(shuffled)
    extra_names = iter(shuffled[:99] + [FINAL_NAME])
    plan2 = [(6, 15, 16), (7, 40, 6), (8, 45, 12)]   # size, count, min hard steps
    for n, k, min_hard in plan2:
        for hard, steps, grid in generate_repaired(n, k, rng2, seen, min_hard):
            levels.append({"name": next(extra_names), "size": n, "grid": grid})

    with open(args.out, "w") as f:
        f.write("[\n")
        f.write(",\n".join("    " + json.dumps(lv) for lv in levels))
        f.write("\n]\n")
    count = sum(1 for lv in levels if not lv.get("draft"))
    print(f"wrote {len(levels)} levels ({count} playable) to {args.out}")


if __name__ == "__main__":
    main()
