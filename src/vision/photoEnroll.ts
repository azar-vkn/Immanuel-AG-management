// Enrol a face from a still photograph.
//
// This reuses the live pipeline exactly: the same SSD MobileNetV1 detector
// options, the same 68-point landmarks, the same 128-D recognition net, and the
// same `assessDetectionQuality` bar the camera path applies. A photo simply
// contributes one descriptor instead of a stream of them.
import * as faceapi from '@vladmandic/face-api';
import { getDetectorOptions } from './models';
import { assessDetectionQuality } from './tracker';

/**
 * Large photos are downscaled before detection: it keeps inference fast and
 * puts faces at a pixel scale comparable to the webcam frames the quality gate
 * was tuned against. A typical portrait still lands far above the size floor.
 */
const MAX_DIMENSION = 1280;

const ACCEPTED_TYPES = /^image\/(jpeg|jpg|png|webp|bmp)$/i;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Result of scanning one photo. Follows the same shape as the project's other
 * service results (`{ success, ...payload, error }`) — a flat object with
 * optional fields, rather than a discriminated union, because this project
 * compiles with `strict: false` where union narrowing is unreliable.
 */
export interface PhotoEnrollResult {
  ok: boolean;
  /** Present when ok is true. */
  descriptor?: Float32Array;
  detectionScore?: number;
  faceArea?: number;
  /** Present when ok is false. */
  reason?: string;
}

/** Load a File into an HTMLImageElement, downscaled onto a canvas. */
async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create an image canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Detect exactly one usable face in a photo and return its 128-D descriptor.
 *
 * Rejects photos with no face, more than one face, or a face that fails the
 * shared quality gate — the same standard applied to live frames, so a photo
 * can never inject a weaker template than the camera would.
 */
export async function extractDescriptorFromPhoto(file: File): Promise<PhotoEnrollResult> {
  if (!ACCEPTED_TYPES.test(file.type)) {
    return { ok: false, reason: 'Unsupported file type. Use a JPG, PNG or WebP image.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: 'Image is too large (maximum 15 MB).' };
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = await fileToCanvas(file);
  } catch {
    return { ok: false, reason: 'Could not read this image file.' };
  }

  let detections;
  try {
    detections = await faceapi
      .detectAllFaces(canvas, getDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();
  } catch (err) {
    console.error('Photo detection error:', err);
    return { ok: false, reason: 'Face detection failed on this image.' };
  }

  if (detections.length === 0) {
    return { ok: false, reason: 'No face found in this photo.' };
  }
  if (detections.length > 1) {
    return {
      ok: false,
      reason: `${detections.length} faces found. Use a photo containing only this member.`,
    };
  }

  const detection = detections[0];
  const quality = assessDetectionQuality(detection);

  if (!quality.good) {
    // Report the specific failing criterion so the operator knows what to fix.
    if (!quality.frontal) {
      return { ok: false, reason: 'Face is turned away. Use a front-facing photo.' };
    }
    if (quality.area < 9000) {
      return { ok: false, reason: 'Face is too small or blurry. Use a closer, sharper photo.' };
    }
    return { ok: false, reason: 'Face is unclear. Try a better-lit, sharper photo.' };
  }

  return {
    ok: true,
    descriptor: detection.descriptor,
    detectionScore: quality.score,
    faceArea: quality.area,
  };
}
