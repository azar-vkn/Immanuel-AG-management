import * as faceapi from '@vladmandic/face-api';

let isLoaded = false;
let loadedFor: DetectorKind | null = null;

/**
 * Which face detector to run.
 *
 * 'tiny' — TinyFaceDetector. ~189 KB of weights and markedly cheaper per
 *          frame, which matters a lot on integrated GPUs (e.g. Intel HD 620)
 *          where WebGL shader work dominates. Boxes are looser than SSD's.
 * 'ssd'  — SSD MobileNetV1. ~5.6 MB and heavier, but localises more tightly,
 *          which gives the recognition net a better-aligned crop and so
 *          slightly better embeddings.
 *
 * Flip this one constant to switch back and compare confidence figures on the
 * same faces. Both model sets are shipped in /models.
 */
export type DetectorKind = 'tiny' | 'ssd';
export const DETECTOR: DetectorKind = 'tiny';

// --- TinyFaceDetector tuning ---
// 416 is the library default and the most accurate of the standard sizes.
// Dropping to 320 or 224 is the next speed lever if frames are still slow.
const TINY_INPUT_SIZE = 416;
const TINY_SCORE_THRESHOLD = 0.5;

// --- SSD MobileNetV1 tuning (used when DETECTOR is 'ssd') ---
const SSD_MIN_CONFIDENCE = 0.5;

export async function loadModels() {
  // Reload if the detector changed since the last load.
  if (isLoaded && loadedFor === DETECTOR) return;

  const MODEL_URL = '/models';

  try {
    console.log(`Loading face-api models (detector: ${DETECTOR})...`);

    const detectorNet =
      DETECTOR === 'tiny'
        ? faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
        : faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);

    await Promise.all([
      detectorNet,
      // Full 68-point landmark net either way: the detector is the only thing
      // being traded for speed here, so the alignment quality feeding the
      // recognition net stays as it was.
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    isLoaded = true;
    loadedFor = DETECTOR;
    console.log('Models loaded successfully.');
  } catch (error) {
    console.error('Error loading face-api models:', error);
    throw error;
  }
}

/** Shared detector options so registration and walk-through stay in sync. */
export function getDetectorOptions() {
  return DETECTOR === 'tiny'
    ? new faceapi.TinyFaceDetectorOptions({
        inputSize: TINY_INPUT_SIZE,
        scoreThreshold: TINY_SCORE_THRESHOLD,
      })
    : new faceapi.SsdMobilenetv1Options({ minConfidence: SSD_MIN_CONFIDENCE });
}

export function areModelsLoaded() {
  return isLoaded;
}
