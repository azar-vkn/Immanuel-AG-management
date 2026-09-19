import * as faceapi from '@vladmandic/face-api';
import type { ActiveTrack, FaceTemplate, RecognitionEvent, TrackSample } from '@/types/face';
import { euclidean, meanDescriptor } from './faceMath';

// ============================================================================
// Walk-through recognition.
//
// Tuned for people walking TOWARDS the camera without stopping or posing.
// The defining property of that situation: evidence gets BETTER over time.
// A person entering starts far away (small, blurry, off-angle) and ends close
// (large, sharp, frontal). Every decision below is shaped by that.
// ============================================================================

// ---- Tracking ----
const IOU_THRESHOLD = 0.3;      // Min box overlap to treat as the same person
const TRACK_TIMEOUT_MS = 2000;  // Keep a track alive this long without a sighting

// ---- Frame quality gate ----
// Frames below this bar never enter a template. Garbage frames produce garbage
// embeddings and are the main source of both false matches and misses.
const MIN_SCORE = 0.4;   // Detector confidence. TinyFaceDetector scores lower
                         // than SSD for the same face, so this sits below the
                         // old SSD-era 0.6 to avoid silently starving tracks.
const MIN_AREA = 9000;   // ~95x95px face; rejects distant/tiny faces
const YAW_LIMIT = 0.45;  // Frontality: |nose offset| / eye-distance.
                         // Loosened from 0.35 because a walking person is
                         // rarely square-on to the lens.

// ---- Recognition ----
const MAX_SAMPLES = 12;       // Best frames retained per track

/**
 * Distance calibration.
 *
 * face-api's own FaceMatcher treats 0.6 as the same-person boundary for these
 * 128-D embeddings. The confidence scale below is anchored to that boundary so
 * the percentage means something real rather than being an arbitrary remap:
 *
 *   distance <= 0.30  -> 100%  (comfortably the same person)
 *   distance == 0.45  ->  50%
 *   distance >= 0.60  ->   0%  (at the same/different decision boundary)
 */
const CONFIDENCE_CEILING = 0.30; // distance at/below which confidence reads 100%
const SAME_PERSON_LIMIT = 0.60;  // distance at which confidence reads 0%

/** Never accept a match looser than this, whatever the confidence gate says. */
const RECOG_THRESHOLD = 0.55;
/** A single frame this close confirms immediately — doorway speed. */
const STRONG_THRESHOLD = 0.35;
/** Best match must beat the runner-up by this much, to avoid look-alike swaps. */
const MATCH_MARGIN = 0.06;
/** A borderline match needs this many good frames agreeing before it fires. */
const MIN_CONFIRM_FRAMES = 3;

/**
 * Attendance is only marked at this confidence or above.
 * On the calibrated scale above, 70% corresponds to a match distance of 0.39 —
 * comfortably inside same-person territory, and reachable by someone walking
 * past without posing.
 */
export const MIN_CONFIDENCE = 0.7;

/** Map match distance -> confidence against the calibration above. */
export function confidenceFromDistance(distance: number): number {
  return Math.max(
    0,
    Math.min(1, (SAME_PERSON_LIMIT - distance) / (SAME_PERSON_LIMIT - CONFIDENCE_CEILING)),
  );
}

/** The match distance a given confidence corresponds to. Used for diagnostics. */
export function distanceForConfidence(confidence: number): number {
  return SAME_PERSON_LIMIT - confidence * (SAME_PERSON_LIMIT - CONFIDENCE_CEILING);
}

let tracks: ActiveTrack[] = [];
let nextTrackId = 1;
let templates: FaceTemplate[] = [];

// Members already marked this session. Attendance fires ONCE per member no
// matter how many times their track is lost and re-acquired at the doorway.
// Seeded from Firestore so a page reload doesn't re-mark everyone.
const markedMembers = new Set<string>();

export function setTemplates(next: FaceTemplate[]) {
  templates = next.filter((t) => t.descriptor.length > 0);
}

export function getTemplateCount() {
  return templates.length;
}

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
 * `quality` ranks frames against each other so the best ones are kept; `good`
 * is the hard pass/fail gate.
 */
export function assessDetectionQuality(det: {
  detection: faceapi.FaceDetection;
  landmarks: faceapi.FaceLandmarks68;
}): { good: boolean; score: number; area: number; frontal: boolean; quality: number } {
  const score = det.detection.score;
  const box = det.detection.box;
  const area = box.width * box.height;

  const leftEye = det.landmarks.getLeftEye();
  const rightEye = det.landmarks.getRightEye();
  const nose = det.landmarks.getNose();
  const eyeMidX = (centerX(leftEye) + centerX(rightEye)) / 2;
  const eyeDist = Math.abs(centerX(rightEye) - centerX(leftEye)) || 1;
  const yaw = Math.abs((centerX(nose) - eyeMidX) / eyeDist); // 0 = straight on
  const frontal = yaw < YAW_LIMIT;

  // Rank by size (a closer face carries more detail), tempered by detector
  // confidence and how square-on the head is. Size is capped so one very close
  // frame can't dominate purely on scale.
  const sizeTerm = Math.sqrt(Math.min(area, 60000));
  const frontalTerm = 1 - Math.min(1, yaw / YAW_LIMIT) * 0.5;
  const quality = sizeTerm * score * frontalTerm;

  return { good: score >= MIN_SCORE && area >= MIN_AREA && frontal, score, area, frontal, quality };
}

/**
 * Add a frame to a track, keeping only the best MAX_SAMPLES.
 *
 * This matters more than it looks. Walking towards a camera, the LAST frames
 * are the best ones — closest and sharpest. A naive "keep the first N" buffer
 * fills up with the distant early frames and then throws the good ones away,
 * which is precisely backwards for a doorway.
 */
function retainSample(track: ActiveTrack, descriptor: Float32Array, quality: number) {
  if (track.samples.length < MAX_SAMPLES) {
    track.samples.push({ descriptor, quality });
    return;
  }
  let worstIdx = 0;
  for (let i = 1; i < track.samples.length; i++) {
    if (track.samples[i].quality < track.samples[worstIdx].quality) worstIdx = i;
  }
  if (quality > track.samples[worstIdx].quality) {
    track.samples[worstIdx] = { descriptor, quality };
  }
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

/**
 * Distance from one query embedding to a registered person.
 *
 * Takes the better of the mean template and the closest individual enrolment
 * sample. Averaging cancels noise when the enrolment poses are similar; the
 * per-sample check rescues the case where the person is walking past at an
 * angle that matches one enrolment photo but not the average of them all.
 */
function distanceToTemplate(query: Float32Array, template: FaceTemplate): number {
  let best = euclidean(query, template.descriptor);
  for (const sample of template.samples) {
    const d = euclidean(query, sample);
    if (d < best) best = d;
  }
  return best;
}

export function processDetections(
  detections: Detection[],
  onEvent?: (event: RecognitionEvent) => void,
) {
  const now = Date.now();

  // Retire stale tracks. A track that ends without ever being confirmed is the
  // ONLY place an "unknown" verdict is reached — see finaliseTrack.
  const surviving: ActiveTrack[] = [];
  for (const track of tracks) {
    if (now - track.lastSeenAt < TRACK_TIMEOUT_MS) {
      surviving.push(track);
    } else {
      finaliseTrack(track, onEvent);
    }
  }
  tracks = surviving;

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

      const quality = assessDetectionQuality(detection);
      if (quality.good) {
        retainSample(track, detection.descriptor, quality.quality);
        track.bestQualityScore = Math.max(track.bestQualityScore, quality.area);
      }

      // Keep evaluating even after a match fires: the confidence reported
      // should be the best the track ever achieved, not the first value that
      // happened to clear the bar.
      if (track.samples.length >= 1) {
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
      samples: [],
      bestQualityScore: quality.area,
      historySize: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      isRecognized: false,
      recognitionFired: false,
      bestDistance: Infinity,
      bestMarginOk: false,
    };
    if (quality.good) retainSample(newTrack, detection.descriptor, quality.quality);
    tracks.push(newTrack);

    // Try to confirm on the very first frame — a crisp, close, frontal face can
    // resolve immediately without waiting for the person to walk further in.
    if (newTrack.samples.length >= 1) {
      attemptRecognition(newTrack, onEvent);
    }

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

  // Query embedding: the mean of the best frames retained so far. Because the
  // buffer keeps the highest-quality frames, this mean improves as the person
  // approaches rather than being anchored to their distant first sighting.
  const query = meanDescriptor(track.samples.map((s: TrackSample) => s.descriptor));

  let best = { template: null as FaceTemplate | null, dist: Infinity };
  let secondDist = Infinity;

  for (const t of templates) {
    const dist = distanceToTemplate(query, t);
    if (dist < best.dist) {
      secondDist = best.dist;
      best = { template: t, dist };
    } else if (dist < secondDist) {
      secondDist = dist;
    }
  }

  const marginOk = secondDist - best.dist > MATCH_MARGIN;

  // Remember the best evidence this track has produced, for the final verdict
  // and for honest confidence reporting.
  if (best.template && best.dist < track.bestDistance) {
    track.bestDistance = best.dist;
    track.bestTemplate = best.template;
    track.bestMarginOk = marginOk;
  }

  const confidence = confidenceFromDistance(best.dist);
  const confidentEnough = confidence >= MIN_CONFIDENCE;
  const strong = best.dist < STRONG_THRESHOLD && marginOk && confidentEnough;
  const confirmed =
    best.dist < RECOG_THRESHOLD &&
    marginOk &&
    confidentEnough &&
    track.samples.length >= MIN_CONFIRM_FRAMES;

  if (!best.template || !(strong || confirmed)) return;

  // Keep the on-screen label showing the best confidence achieved.
  if (!track.isRecognized || confidence > (track.recognizedConfidence ?? 0)) {
    track.isRecognized = true;
    track.recognizedTemplate = best.template;
    track.recognizedConfidence = confidence;
  }

  if (track.recognitionFired) return;
  track.recognitionFired = true;

  const identified = best.template;
  const shared = {
    timestamp: Date.now(),
    trackId: track.trackId,
    confidence,
    memberDocId: identified.memberDocId,
    memberId: identified.memberId,
    memberName: identified.memberName,
  };

  // Attendance dedup: mark only the first time this member is seen this
  // session. Re-acquired tracks still show green, but report "Already Marked"
  // instead of creating a second attendance record.
  if (markedMembers.has(identified.memberDocId)) {
    onEvent?.({ ...shared, type: 'ALREADY_MARKED', message: `${identified.memberName} — already marked` });
  } else {
    markedMembers.add(identified.memberDocId);
    onEvent?.({ ...shared, type: 'RECOGNIZED', message: `Matched: ${identified.memberName}` });
  }
}

/**
 * Reach a verdict on a track that has left the frame.
 *
 * Deciding "unknown" only at track end is the core walk-through fix. The old
 * behaviour gave up as soon as the frame buffer filled — which, for someone
 * still approaching, was exactly when their best frames were about to arrive.
 * Now a person gets the entire walk to be identified, and is only declared
 * unknown once they are actually gone.
 */
function finaliseTrack(track: ActiveTrack, onEvent?: (event: RecognitionEvent) => void) {
  if (track.recognitionFired) return;
  // Never seen well enough to judge — stay silent rather than cry wolf.
  if (track.samples.length === 0) return;

  track.recognitionFired = true;

  const confidence =
    track.bestTemplate && track.bestDistance < Infinity
      ? confidenceFromDistance(track.bestDistance)
      : 0;

  // Distinguish a genuine stranger from a registered member we simply could not
  // confirm — the operator needs to tell those apart to decide what to do.
  const nearMiss =
    !!track.bestTemplate && track.bestMarginOk && track.bestDistance < RECOG_THRESHOLD;

  onEvent?.({
    timestamp: Date.now(),
    trackId: track.trackId,
    type: 'UNKNOWN',
    message: nearMiss
      ? `${track.bestTemplate!.memberName}? — only ${Math.round(confidence * 100)}% confident, not marked`
      : 'Unknown / Not registered',
    confidence: nearMiss ? confidence : undefined,
    memberDocId: nearMiss ? track.bestTemplate!.memberDocId : undefined,
    memberId: nearMiss ? track.bestTemplate!.memberId : undefined,
  });
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
