export type DiffRow = {
  type: "same" | "added" | "removed";
  text: string;
};

// Simple line-by-line diff (no external library needed).
export function diffLines(original: string, proposed: string): DiffRow[] {
  const a = original ? original.split("\n") : [];
  const b = proposed ? proposed.split("\n") : [];

  // Safety guard for very large files: treat everything as replaced.
  if (a.length * b.length > 4_000_000) {
    return [
      ...a.map((text): DiffRow => ({ type: "removed", text })),
      ...b.map((text): DiffRow => ({ type: "added", text })),
    ];
  }

  const cols = b.length + 1;
  const table = new Uint32Array((a.length + 1) * cols);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + (j + 1)] + 1
          : Math.max(
              table[(i + 1) * cols + j],
              table[i * cols + (j + 1)]
            );
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (
      table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]
    ) {
      rows.push({ type: "removed", text: a[i] });
      i++;
    } else {
      rows.push({ type: "added", text: b[j] });
      j++;
    }
  }

  while (i < a.length) {
    rows.push({ type: "removed", text: a[i++] });
  }

  while (j < b.length) {
    rows.push({ type: "added", text: b[j++] });
  }

  return rows;
}