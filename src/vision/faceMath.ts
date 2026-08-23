// Pure numeric helpers for working with 128-D face embeddings.
// Kept dependency-free so it is trivial to unit-test and reuse server-side later.

export const DESCRIPTOR_SIZE = 128;

/** Euclidean (L2) distance between two descriptors. Lower = more similar. */
export function euclidean(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Average a set of descriptors into a single "template" embedding.
 * Averaging cancels per-frame noise, which is the single biggest accuracy win
 * over matching against individual raw frames.
 */
export function meanDescriptor(list: Float32Array[]): Float32Array {
  const out = new Float32Array(DESCRIPTOR_SIZE);
  if (list.length === 0) return out;
  for (const d of list) {
    for (let i = 0; i < DESCRIPTOR_SIZE; i++) out[i] += d[i];
  }
  for (let i = 0; i < DESCRIPTOR_SIZE; i++) out[i] /= list.length;
  return out;
}

/**
 * Greedily pick a diverse subset: keep a descriptor only if it is at least
 * `minDist` away from everything already kept. This drops near-duplicate frames
 * (same static pose held for a second) so the stored template covers real
 * angle/expression variation instead of over-weighting one instant.
 */
export function selectDiverse(
  list: Float32Array[],
  maxCount: number,
  minDist = 0.2,
): Float32Array[] {
  const kept: Float32Array[] = [];
  for (const d of list) {
    if (kept.length >= maxCount) break;
    const tooClose = kept.some((k) => euclidean(k, d) < minDist);
    if (!tooClose) kept.push(d);
  }
  // If diversity filtering was too aggressive, top up with the raw frames
  // so we still have a usable number of samples.
  if (kept.length < Math.min(maxCount, 5)) {
    for (const d of list) {
      if (kept.length >= maxCount) break;
      if (!kept.includes(d)) kept.push(d);
    }
  }
  return kept;
}
