import * as faceapi from '@vladmandic/face-api';

let isLoaded = false;

// SSD MobileNetV1 is meaningfully more accurate than TinyFaceDetector at
// localising faces. Tighter, better-centred boxes mean the recognition net
// gets a cleaner aligned crop, which directly improves embedding quality.
const MIN_DETECTION_CONFIDENCE = 0.5;

export async function loadModels() {
  if (isLoaded) return;

  const MODEL_URL = '/models';

  try {
    console.log('Loading face-api models...');
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    isLoaded = true;
    console.log('Models loaded successfully.');
  } catch (error) {
    console.error('Error loading face-api models:', error);
    throw error;
  }
}

/** Shared detector options so registration and walk-through stay in sync. */
export function getDetectorOptions() {
  return new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_DETECTION_CONFIDENCE });
}

export function areModelsLoaded() {
  return isLoaded;
}
