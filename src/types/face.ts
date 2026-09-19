// Face recognition types — ported from the IAG-face-recog-test prototype and
// adapted to reference church members instead of standalone test identities.

/**
 * A registered member's face template, as used by the recogniser.
 * `descriptor` is the mean of the good frames captured at registration —
 * the prototype averages on both sides (per-person and per-track), which is
 * what makes matching stable.
 */
export interface FaceTemplate {
  memberDocId: string; // Firestore members/{id}
  memberId: string; // IAG00001
  memberName: string;
  /** 128-D mean of all enrolment samples. Always present. */
  descriptor: Float32Array;
  /**
   * The individual enrolment samples (one per registration photo / kept frame).
   * Matching takes the best of "distance to mean" and "distance to any single
   * sample": the mean cancels noise when poses are alike, while the individual
   * samples let a distinctly different pose still match. Empty for profiles
   * registered before multi-sample matching existed.
   */
  samples: Float32Array[];
}

/** Firestore document shape for face_profiles/{memberDocId}. */
export interface FaceProfileDoc {
  memberDocId: string;
  memberId: string;
  memberName: string;
  template: number[]; // 128 floats — the mean descriptor
  /** Flattened enrolment samples, sampleSetCount x 128. Optional (legacy docs). */
  sampleSet?: number[];
  sampleSetCount?: number;
  sampleCount: number;
  registeredAt: string;
  updatedAt: string;
  registeredBy: string;
}

export type FaceRegistrationStatus =
  | 'registered'
  | 'not_registered'
  | 'failed'
  | 'checking';

/** Live tracking state for one person in front of the camera. */
/** One retained frame of a track, with the quality score used to rank it. */
export interface TrackSample {
  descriptor: Float32Array;
  quality: number;
}

export interface ActiveTrack {
  trackId: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  /** Best-quality frames retained for this track, worst evicted first. */
  samples: TrackSample[];
  bestQualityScore: number;
  historySize: number;
  firstSeenAt: number;
  lastSeenAt: number;

  // Recognition state
  isRecognized: boolean;
  recognizedTemplate?: FaceTemplate;
  recognizedConfidence?: number;
  recognitionFired: boolean;

  /** Best (lowest) match distance seen across the whole track so far. */
  bestDistance: number;
  bestTemplate?: FaceTemplate;
  /** Whether the best match also cleared the runner-up margin. */
  bestMarginOk: boolean;
}

export type RecognitionEventType =
  | 'DETECTED'
  | 'RECOGNIZED'
  | 'ALREADY_MARKED'
  | 'NOT_ELIGIBLE' // recognised, but not in a fellowship this event covers
  | 'UNKNOWN';

/** An event emitted by the recogniser for the live log. */
export interface RecognitionEvent {
  timestamp: number;
  trackId: string;
  type: RecognitionEventType;
  message: string;
  confidence?: number;
  memberDocId?: string;
  memberId?: string;
  memberName?: string;
}

/** Firestore document shape for recognition_events/{id} — the shared live log. */
export interface RecognitionEventDoc {
  id: string;
  eventId: string; // the ChurchEvent this session belongs to
  type: RecognitionEventType;
  memberDocId?: string;
  memberId?: string;
  memberName?: string;
  confidence?: number;
  at: string; // ISO timestamp
  recordedBy: string;
}
