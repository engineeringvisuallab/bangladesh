/** Sorting algorithms that RECORD what they do (compare / swap / write), so the 3D board can replay them step by step. Pure TypeScript. */
export interface SortOp {
  t: 'cmp' | 'swap' | 'set';
  i: number;
  j: number; // for 'set': the new value
}
export type SortName = 'Bubble Sort' | 'Insertion Sort' | 'Merge Sort' | 'Quick Sort';
export const SORTS: { name: SortName; big: string; run: (a: number[]) => SortOp[] }[] = [
  { name: 'Bubble Sort', big: 'O(n²)', run: bubble },
  { name: 'Insertion Sort', big: 'O(n²)', run: insertion },
  { name: 'Merge Sort', big: 'O(n log n)', run: merge },
  { name: 'Quick Sort', big: 'O(n log n)', run: quick },
];

/** Deterministic shuffled array of 1..n (same every run). */
export function shuffled(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bubble(src: number[]): SortOp[] {
  const a = src.slice();
  const ops: SortOp[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < a.length - 1 - i; j++) {
      ops.push({ t: 'cmp', i: j, j: j + 1 });
      if (a[j] > a[j + 1]) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        ops.push({ t: 'swap', i: j, j: j + 1 });
      }
    }
  }
  return ops;
}
function insertion(src: number[]): SortOp[] {
  const a = src.slice();
  const ops: SortOp[] = [];
  for (let i = 1; i < a.length; i++) {
    let j = i;
    while (j > 0) {
      ops.push({ t: 'cmp', i: j - 1, j });
      if (a[j - 1] > a[j]) {
        [a[j - 1], a[j]] = [a[j], a[j - 1]];
        ops.push({ t: 'swap', i: j - 1, j });
        j--;
      } else break;
    }
  }
  return ops;
}
function merge(src: number[]): SortOp[] {
  const a = src.slice();
  const ops: SortOp[] = [];
  const rec = (lo: number, hi: number): void => {
    if (hi - lo < 1) return;
    const mid = (lo + hi) >> 1;
    rec(lo, mid);
    rec(mid + 1, hi);
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    let i = 0;
    let j = 0;
    let k = lo;
    while (i < left.length && j < right.length) {
      ops.push({ t: 'cmp', i: lo + i, j: mid + 1 + j });
      if (left[i] <= right[j]) a[k] = left[i++];
      else a[k] = right[j++];
      ops.push({ t: 'set', i: k, j: a[k] });
      k++;
    }
    while (i < left.length) {
      a[k] = left[i++];
      ops.push({ t: 'set', i: k, j: a[k] });
      k++;
    }
    while (j < right.length) {
      a[k] = right[j++];
      ops.push({ t: 'set', i: k, j: a[k] });
      k++;
    }
  };
  rec(0, a.length - 1);
  return ops;
}
function quick(src: number[]): SortOp[] {
  const a = src.slice();
  const ops: SortOp[] = [];
  const rec = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const p = a[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
      ops.push({ t: 'cmp', i: j, j: hi });
      if (a[j] < p) {
        if (i !== j) {
          [a[i], a[j]] = [a[j], a[i]];
          ops.push({ t: 'swap', i, j });
        }
        i++;
      }
    }
    if (i !== hi) {
      [a[i], a[hi]] = [a[hi], a[i]];
      ops.push({ t: 'swap', i, j: hi });
    }
    rec(lo, i - 1);
    rec(i + 1, hi);
  };
  rec(0, a.length - 1);
  return ops;
}

/** Linear search vs binary search for a target in a sorted array: the cells each one looks at, in order. */
export function searchSteps(sorted: number[], target: number): { linear: number[]; binary: number[] } {
  const linear: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    linear.push(i);
    if (sorted[i] === target) break;
  }
  const binary: number[] = [];
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    binary.push(mid);
    if (sorted[mid] === target) break;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return { linear, binary };
}
