import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaceCanvas } from '@/components/face/FaceCanvas';
import { CameraControl } from '@/components/face/CameraControl';
import { loadModels } from '@/vision/models';
import {
  setTemplates,
  seedMarkedMembers,
  resetSession,
  getTemplateCount,
  MIN_CONFIDENCE,
} from '@/vision/tracker';
import { getFaceTemplates } from '@/services/faceService';
import type { RecognitionEvent } from '@/types/face';
import { Badge } from '@/components/ui/badge';
import { Loader2, ScanFace, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

interface FaceAttendancePanelProps {
  /** Church event being marked. Re-seeds the session when it changes. */
  eventId: string;
  /** Members already present, so re-crossings report "already marked". */
  markedMemberIds: string[];
  /** Fired only for matches at or above MIN_CONFIDENCE. */
  onRecognized: (memberDocId: string, confidence: number) => void;
  showPreview: boolean;
}

interface FeedLine {
  key: string;
  at: number;
  text: string;
  tone: 'ok' | 'info' | 'warn';
}

/**
 * Face recognition for the Attendance page.
 *
 * Self-contained on purpose: every face concern (models, templates, camera,
 * tracking) lives here, so the Attendance page only supplies an event id and
 * receives confirmed matches. It marks nothing itself — the page's existing
 * marking logic stays the single path that writes attendance.
 */
export const FaceAttendancePanel: React.FC<FaceAttendancePanelProps> = ({
  eventId,
  markedMemberIds,
  onRecognized,
  showPreview,
}) => {
  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [templateCount, setTemplateCount] = useState(0);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedLine[]>([]);

  // Keeps the recognition callback stable so the detection loop is never
  // torn down and rebuilt mid-session (which would drop frames).
  const onRecognizedRef = useRef(onRecognized);
  useEffect(() => {
    onRecognizedRef.current = onRecognized;
  }, [onRecognized]);

  // ---- Load models on mount (the panel only mounts when face mode is on) ----
  useEffect(() => {
    let cancelled = false;
    loadModels()
      .then(() => !cancelled && setModelsReady(true))
      .catch((err) => {
        console.error('Model load failed:', err);
        if (!cancelled) setModelError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Load registered faces for this event ----
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setTemplateError(null);

    getFaceTemplates()
      .then((templates) => {
        if (cancelled) return;
        setTemplates(templates);
        setTemplateCount(getTemplateCount());
      })
      .catch((err) => {
        console.error('Error loading face templates:', err);
        if (cancelled) return;
        setTemplates([]);
        setTemplateCount(0);
        const denied =
          typeof err === 'object' && err !== null && 'code' in err &&
          (err as { code?: string }).code === 'permission-denied';
        setTemplateError(
          denied
            ? 'Permission denied reading registered faces. Sign in as an administrator.'
            : 'Could not load registered faces.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // ---- Keep the tracker's dedup set in step with what's already marked ----
  useEffect(() => {
    seedMarkedMembers(markedMemberIds);
  }, [markedMemberIds]);

  // ---- Release camera and clear tracking when the panel unmounts ----
  useEffect(() => {
    return () => {
      resetSession();
      setStream((current) => {
        current?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, []);

  const pushFeed = useCallback((text: string, tone: FeedLine['tone']) => {
    setFeed((prev) =>
      [{ key: `${Date.now()}-${Math.random()}`, at: Date.now(), text, tone }, ...prev].slice(0, 6),
    );
  }, []);

  const handleEvent = useCallback(
    (event: RecognitionEvent) => {
      switch (event.type) {
        case 'RECOGNIZED':
          // The tracker only emits this at or above MIN_CONFIDENCE.
          if (event.memberDocId) {
            pushFeed(
              `${event.memberName} — ${((event.confidence ?? 0) * 100).toFixed(0)}% match`,
              'ok',
            );
            onRecognizedRef.current(event.memberDocId, event.confidence ?? 0);
          }
          break;
        case 'ALREADY_MARKED':
          pushFeed(`${event.memberName} — already marked`, 'info');
          break;
        case 'UNKNOWN':
          pushFeed(event.message, 'warn');
          break;
        default:
          break; // plain DETECTED is too noisy for this compact feed
      }
    },
    [pushFeed],
  );

  const handleStream = useCallback((next: MediaStream | null) => {
    setStream(next);
    if (!next) {
      setFaceCount(0);
      resetSession();
      seedMarkedMembers(markedMemberIds);
    }
  }, [markedMemberIds]);

  if (modelError) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
        Failed to load face recognition models. Check that the model files exist in
        <code className="mx-1 px-1 rounded bg-black/20">/models</code> and reload the page.
      </div>
    );
  }

  if (!modelsReady) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading face recognition models...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templateError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-500">
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{templateError}</span>
        </div>
      )}

      {!templateError && templateCount === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs text-blue-500">
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            No member faces are registered yet. Register faces from a member's profile on the
            Members page before using face attendance.
          </span>
        </div>
      )}

      <FaceCanvas
        stream={stream}
        mode="recognition"
        showPreview={showPreview}
        onEventFired={handleEvent}
        onDetectionStateChange={setFaceCount}
        idleMessage="Camera is off — turn it on to recognise faces"
      />

      <CameraControl
        onStream={handleStream}
        isActive={!!stream}
        label="Face Recognition Camera"
        helpText={`Members are marked automatically at ${Math.round(MIN_CONFIDENCE * 100)}% confidence or above.`}
      />

      {/* Compact status strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge
          variant="outline"
          className={
            stream
              ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
              : 'bg-muted text-muted-foreground'
          }
        >
          {stream ? 'Camera live' : 'Camera off'}
        </Badge>
        <Badge variant="outline" className="bg-secondary/50">
          {!stream ? 'Idle' : faceCount > 0 ? `${faceCount} face(s) in view` : 'Watching'}
        </Badge>
        <Badge variant="outline" className="bg-secondary/50">
          {templateCount} registered face{templateCount === 1 ? '' : 's'}
        </Badge>
      </div>

      {/* Recent recognition feed */}
      {feed.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-secondary/20 p-2.5 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <ScanFace className="w-3.5 h-3.5" />
            Recent recognitions
          </p>
          {feed.map((line) => (
            <p
              key={line.key}
              className={`text-xs flex items-center gap-2 ${
                line.tone === 'ok'
                  ? 'text-emerald-500'
                  : line.tone === 'info'
                    ? 'text-blue-500'
                    : 'text-amber-500'
              }`}
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {format(new Date(line.at), 'hh:mm:ss')}
              </span>
              {line.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

export default FaceAttendancePanel;
