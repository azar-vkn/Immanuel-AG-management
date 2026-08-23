import * as faceapi from '@vladmandic/face-api';
import type { ActiveTrack, FaceTemplate, RecognitionEvent } from '@/types/face';
import { euclidean, meanDescriptor } from './faceMath';

// ---- Tracking ----
const IOU_THRESHOLD = 0.3;      // Min box overlap to treat as the same person
const TRACK_TIMEOUT_MS = 2000;  // Keep a track alive this long without a sighting

// ---- Frame quality gate ----
// Only high-quality frames feed the template. Garbage frames (tiny, blurry,
// turned away) produce garbage embeddings and are the main source of both
// false matches and misses.
const MIN_SCORE = 0.6;          // Detector confidence
const MIN_AREA = 9000;          // ~95x95px face; rejects distant/tiny faces
const YAW_LIMIT = 0.35;         // Frontality: |nose offset| / eye-distance

// ---- Recognition ----
const MAX_DESCRIPTORS = 20;      // Cap good frames accumulated per track
const MIN_CONFIRM_FRAMES = 3;    // Frames of agreement to confirm a borderline match
const RECOG_THRESHOLD = 0.5;     // Max mean-to-mean distance to accept a match
const STRONG_THRESHOLD = 0.42;   // A single frame this close confirms instantly (doorway speed)
const MATCH_MARGIN = 0.06;       // Best must beat 2nd-best person by this much
const CONFIDENCE_FLOOR = 0.2;    // Distance mapped to ~100% confidence for display

// Attendance is only marked at this confidence or above. With the mapping
// below this corresponds to a match distance of 0.29 or closer, which is
// stricter than RECOG_THRESHOLD — so this gate, not the distance thresholds,
// is what decides whether a member is marked.
export const MIN_CONFIDENCE = 0.7;

/** Map match distance -> confidence. CONFIDENCE_FLOOR or closer reads as ~100%. */
function confidenceFromDistance(distance: number): number {
  return Math.max(
    0,
    Math.min(1, (RECOG_THRESHOLD - distance) / (RECOG_THRESHOLD - CONFIDENCE_FLOOR)),
  );
}

let tracks: ActiveTrack[] = [];
let nextTrackId = 1;
let templates: FaceTemplate[] = [];

// Members already marked this session. Attendance fires ONCE per member no
// matter how many times their track is lost and re-acquired at the doorway.
// Seeded from Firestore so a page reload doesn't re-mark everyone.
const markedMembers = new Set<string>();

/**
 * Load the registered member templates the recogniser matches against.
 * Replaces the prototype's localStorage-backed `updateMatcher()`; the matching
 * maths below is unchanged.
 */
export function setTemplates(next: FaceTemplate[]) {
  templates = next.filter((t) => t.descriptor.length > 0);
}

export function getTemplateCount() {
  return templates.length;
}

/**
 * Seed the already-marked set from existing attendance records, so members
 * marked earlier in this service (or before a page refresh) are reported as
 * "Already Marked" rather than being marked twice.
 */
export function seedMarkedMembers(memberDocIds: string[]) {
  markedMembers.clear();
  memberDocIds.forEach((id) => markedMembers.add(id));
}

export function isMemberMarked(memberDocId: string) {
  return markedMembers.has(memberDocId);
}

function centerX(points: faceapi.Point[]): number {
  return points.reduce((s, p) => s + p.x, 0) / points.length;
}

/**
 * Score a detection for template suitability: confident, large, and frontal.
 * Shared by registration and walk-through so both learn/match on the same
 * standard of frame.
 */
export function assessDetectionQuality(det: {
  detection: faceapi.FaceDetection;
  landmarks: faceapi.FaceLandmarks68;
}): { good: boolean; score: number; area: number; frontal: boolean } {
  const score = det.detection.score;
  const box = det.detection.box;
  const area = box.width * box.height;

  const leftEye = det.landmarks.getLeftEye();
  const rightEye = det.landmarks.getRightEye();
  const nose = det.landmarks.getNose();
  const eyeMidX = (centerX(leftEye) + centerX(rightEye)) / 2;
  const eyeDist = Math.abs(centerX(rightEye) - centerX(leftEye)) || 1;
  const yaw = (centerX(nose) - eyeMidX) / eyeDist; // 0 = looking straight on
  const frontal = Math.abs(yaw) < YAW_LIMIT;

  return { good: score >= MIN_SCORE && area >= MIN_AREA && frontal, score, area, frontal };
}

function calculateIoU(box1: faceapi.IRect, box2: faceapi.IRect) {
  const xA = Math.max(box1.x, box2.x);
  const yA = Math.max(box1.y, box2.y);
  const xB = Math.min(box1.x + box1.width, box2.x + box2.width);
  const yB = Math.min(box1.y + box1.height, box2.y + box2.height);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;

  return interArea / (box1Area + box2Area - interArea);
}

type Detection = faceapi.WithFaceDescriptor<
  faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<object>>
>;

export function processDetections(
  detections: Detection[],
  onEvent?: (event: RecognitionEvent) => void,
) {
  const now = Date.now();

  tracks = tracks.filter((t) => now - t.lastSeenAt < TRACK_TIMEOUT_MS);

  const matchedDetections = new Set<number>();

  for (const track of tracks) {
    let bestMatchIdx = -1;
    let bestIoU = 0;

    for (let i = 0; i < detections.length; i++) {
      if (matchedDetections.has(i)) continue;
      const iou = calculateIoU(track.boundingBox, detections[i].detection.box);
      if (iou > bestIoU && iou > IOU_THRESHOLD) {
        bestIoU = iou;
        bestMatchIdx = i;
      }
    }

    if (bestMatchIdx !== -1) {
      matchedDetections.add(bestMatchIdx);
      const detection = detections[bestMatchIdx];

      track.boundingBox = detection.detection.box;
      track.lastSeenAt = now;
      track.historySize++;

      // Only accumulate GOOD frames into the template.
      const quality = assessDetectionQuality(detection);
      if (quality.good && track.descriptors.length < MAX_DESCRIPTORS) {
        track.descriptors.push(detection.descriptor);
        track.bestQualityScore = Math.max(track.bestQualityScore, quality.area);
      }

      // Evaluate every frame; attemptRecognition decides when it's sure enough
      // (a single strong frame confirms instantly; borderline waits for more).
      if (!track.isRecognized && track.descriptors.length >= 1) {
        attemptRecognition(track, onEvent);
      }
    }
  }

  for (let i = 0; i < detections.length; i++) {
    if (matchedDetections.has(i)) continue;
    const detection = detections[i];
    const quality = assessDetectionQuality(detection);
    const newTrack: ActiveTrack = {
      trackId: `Person #${nextTrackId++}`,
      boundingBox: detection.detection.box,
      descriptors: quality.good ? [detection.descriptor] : [],
      bestQualityScore: quality.area,
      historySize: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      isRecognized: false,
      recognitionFired: false,
    };
    tracks.push(newTrack);

    // Try to confirm on the very first frame (doorway speed). A crisp, close,
    // frontal face — or an already-marked member re-crossing — resolves here.
    if (newTrack.descriptors.length >= 1) {
      attemptRecognition(newTrack, onEvent);
    }

    // Announce a plain DETECTED only if it didn't just resolve, and only for
    // candidates close/large enough to be a real entrant — so distant faces
    // and instant re-crossings don't flood the log with phantom detections.
    if (!newTrack.isRecognized && quality.area >= MIN_AREA) {
      onEvent?.({
        timestamp: now,
        trackId: newTrack.trackId,
        type: 'DETECTED',
        message: 'Face detected',
      });
    }
  }

  return tracks;
}

function attemptRecognition(track: ActiveTrack, onEvent?: (event: RecognitionEvent) => void) {
  if (templates.length === 0) return;

  // Match the track's AVERAGE embedding against each person's AVERAGE embedding.
  // Two layers of averaging (per-person at registration, per-track here) makes
  // the comparison far more stable than a min-of-min over raw frames.
  const query = meanDescriptor(track.descriptors);

  let best = { template: null as FaceTemplate | null, dist: Infinity };
  let secondDist = Infinity;

  for (const t of templates) {
    const dist = euclidean(query, t.descriptor);
    if (dist < best.dist) {
      secondDist = best.dist;
      best = { template: t, dist };
    } else if (dist < secondDist) {
      secondDist = dist;
    }
  }

  // Must clearly beat the runner-up (or be the only registered member).
  const marginOk = secondDist - best.dist > MATCH_MARGIN;
  // Confidence gate: nobody is marked below MIN_CONFIDENCE, no matter what the
  // distance thresholds allow. This is the binding constraint.
  const confidence = confidenceFromDistance(best.dist);
  const confidentEnough = confidence >= MIN_CONFIDENCE;
  // Fast path: one very close frame is enough to confirm at the doorway.
  const strong = best.dist < STRONG_THRESHOLD && marginOk && confidentEnough;
  // Slow path: a merely-acceptable match needs several frames of agreement.
  const confirmed =
    best.dist < RECOG_THRESHOLD &&
    marginOk &&
    confidentEnough &&
    track.descriptors.length >= MIN_CONFIRM_FRAMES;

  if (best.template && (strong || confirmed)) {
    track.isRecognized = true;
    track.recognizedTemplate = best.template;
    track.recognizedConfidence = confidence;

    if (!track.recognitionFired) {
      track.recognitionFired = true;
      const identified = best.template;

      // Attendance dedup: mark only the first time this member is seen this
      // session. Re-acquired tracks still show green, but report "Already
      // Marked" instead of creating a second attendance record.
      if (markedMembers.has(identified.memberDocId)) {
        onEvent?.({
          timestamp: Date.now(),
          trackId: track.trackId,
          type: 'ALREADY_MARKED',
          message: `${identified.memberName} — already marked`,
          confidence: track.recognizedConfidence,
          memberDocId: identified.memberDocId,
          memberId: identified.memberId,
          memberName: identified.memberName,
        });
      } else {
        markedMembers.add(identified.memberDocId);
        onEvent?.({
          timestamp: Date.now(),
          trackId: track.trackId,
          type: 'RECOGNIZED',
          message: `Matched: ${identified.memberName}`,
          confidence: track.recognizedConfidence,
          memberDocId: identified.memberDocId,
          memberId: identified.memberId,
          memberName: identified.memberName,
        });
      }
    }
  } else if (track.descriptors.length >= MAX_DESCRIPTORS) {
    // Enough good frames and still no confident match -> declare unknown once.
    if (!track.recognitionFired) {
      track.recognitionFired = true;
      track.isRecognized = true; // stop retrying this track
      // Distinguish a genuine stranger from a registered member we simply
      // could not confirm to MIN_CONFIDENCE — the operator needs to tell those
      // apart to decide what to do.
      const nearMiss = best.template !== null && marginOk && best.dist < RECOG_THRESHOLD;
      onEvent?.({
        timestamp: Date.now(),
        trackId: track.trackId,
        type: 'UNKNOWN',
        message: nearMiss
          ? `Low confidence (${Math.round(confidence * 100)}%) — not marked`
          : 'Unknown / Not registered',
        confidence: nearMiss ? confidence : undefined,
      });
    }
  }
}

export function getActiveTracks() {
  return tracks;
}

/** Clear tracking state. Does NOT clear the marked set — use resetSession(). */
export function resetTracks() {
  tracks = [];
  nextTrackId = 1;
}

/** Start a fresh attendance session: forget tracks and who's been marked. */
export function resetSession() {
  resetTracks();
  markedMembers.clear();
}
