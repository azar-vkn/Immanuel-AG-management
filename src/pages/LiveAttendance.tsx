import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getFaceTemplates } from '@/services/faceService';
import { loadModels } from '@/vision/models';
import {
  setTemplates,
  resetSession,
  getTemplateCount,
  MIN_CONFIDENCE,
} from '@/vision/tracker';
import type { RecognitionEvent, RecognitionEventType } from '@/types/face';
import { useAuth } from '@/contexts/AuthContext';
import { CameraControl } from '@/components/face/CameraControl';
import { FaceCanvas } from '@/components/face/FaceCanvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScanFace, Loader2, UserCheck, ShieldAlert, RotateCcw, Radio, FlaskConical } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const STATUS_LABELS: Record<RecognitionEventType, string> = {
  RECOGNIZED: 'Recognised',
  ALREADY_MARKED: 'Seen Again',
  NOT_ELIGIBLE: 'Not Eligible',
  UNKNOWN: 'Not Recognised',
  DETECTED: 'Face Detected',
};

const STATUS_STYLES: Record<RecognitionEventType, string> = {
  RECOGNIZED: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  ALREADY_MARKED: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  NOT_ELIGIBLE: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  UNKNOWN: 'bg-red-500/15 text-red-500 border-red-500/30',
  DETECTED: 'bg-muted text-muted-foreground',
};

interface LogEntry {
  key: string;
  at: number;
  type: RecognitionEventType;
  memberName?: string;
  memberId?: string;
  confidence?: number;
}

/**
 * Entrance Camera — a recognition test harness.
 *
 * This page deliberately records nothing: no attendance, no Firestore logs.
 * It exists to check how the camera and the recogniser behave at the real
 * entrance (framing, lighting, distance, confidence) without touching live
 * data. Attendance is marked on the Attendance page.
 */
const LiveAttendance: React.FC = () => {
  const { hasPermission } = useAuth();
  const canControl = hasPermission('attendance.live.control');

  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastRecognized, setLastRecognized] = useState<LogEntry | null>(null);

  // ---- Load recognition models ----
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

  // ---- Load registered faces ----
  useEffect(() => {
    let cancelled = false;
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
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Start each visit with a clean session, and release the camera on exit ----
  useEffect(() => {
    resetSession();
    return () => {
      resetSession();
      setStream((current) => {
        current?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, []);

  const handleRecognitionEvent = useCallback((event: RecognitionEvent) => {
    if (event.type === 'DETECTED') return; // too noisy for the log

    const entry: LogEntry = {
      key: `${event.timestamp}-${event.trackId}-${Math.random()}`,
      at: event.timestamp,
      type: event.type,
      memberName: event.memberName,
      memberId: event.memberId,
      confidence: event.confidence,
    };

    setLog((prev) => [entry, ...prev].slice(0, 100));
    if (event.type === 'RECOGNIZED' || event.type === 'ALREADY_MARKED') {
      setLastRecognized(entry);
    }
  }, []);

  const handleStream = useCallback((next: MediaStream | null) => {
    setStream(next);
    if (!next) setFaceCount(0);
  }, []);

  const handleReset = () => {
    resetSession();
    setLog([]);
    setLastRecognized(null);
    toast.success('Test session reset');
  };

  const recognisedCount = useMemo(
    () => new Set(log.filter((l) => l.type === 'RECOGNIZED').map((l) => l.memberId)).size,
    [log],
  );

  const unknownCount = useMemo(() => log.filter((l) => l.type === 'UNKNOWN').length, [log]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <h1 className="font-serif text-3xl font-bold text-gold-gradient">Entrance Camera</h1>
        <p className="text-muted-foreground">
          Test face recognition at the entrance — nothing is recorded
        </p>
      </div>

      {/* Test-mode notice: this page must never be mistaken for real marking. */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-500 animate-fade-in">
        <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Test mode.</strong> Recognitions here are for checking camera placement and
          accuracy only — no attendance is recorded. Use the Attendance page to mark attendance.
        </span>
      </div>

      {!canControl && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          You can view results, but only administrators can control the camera.
        </div>
      )}

      {templateError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{templateError}</span>
        </div>
      )}

      {!templateError && templateCount === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-500">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            No member faces are registered yet. Register faces from a member's profile on the
            Members page before testing.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-xl p-6 space-y-4 animate-fade-in [animation-delay:100ms]">
            <h3 className="font-semibold flex items-center gap-2">
              <ScanFace className="w-5 h-5 text-primary" />
              Live Entrance Feed
            </h3>

            {modelError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
                Failed to load face recognition models. Check that the model files exist in
                <code className="mx-1 px-1 rounded bg-black/20">/models</code> and reload.
              </div>
            ) : !modelsReady ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading recognition models...
              </div>
            ) : (
              <>
                <FaceCanvas
                  stream={stream}
                  mode="recognition"
                  onEventFired={handleRecognitionEvent}
                  onDetectionStateChange={setFaceCount}
                  idleMessage="Entrance camera is off"
                />

                <CameraControl
                  onStream={handleStream}
                  isActive={!!stream}
                  disabled={!canControl}
                  label="Entrance Camera"
                  helpText={`Matches at ${Math.round(MIN_CONFIDENCE * 100)}% confidence or above would be marked on the Attendance page.`}
                />
              </>
            )}
          </div>

          {/* Status strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in [animation-delay:200ms]">
            <div className="glass rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Camera</p>
              <p className={`text-lg font-bold ${stream ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {stream ? 'Connected' : 'Offline'}
              </p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Face Detection</p>
              <p className={`text-lg font-bold ${faceCount > 0 ? 'text-blue-500' : 'text-muted-foreground'}`}>
                {!stream ? 'Idle' : faceCount > 0 ? `${faceCount} in view` : 'Watching'}
              </p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Registered Faces</p>
              <p className="text-lg font-bold text-primary">{templateCount}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Recognised</p>
              <p className="text-lg font-bold text-emerald-500">{recognisedCount}</p>
            </div>
          </div>
        </div>

        {/* Results column */}
        <div className="space-y-6">
          <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:100ms]">
            <p className="text-xs text-muted-foreground mb-2">Latest Recognition</p>
            {lastRecognized ? (
              <div className="space-y-1">
                <p className="text-xl font-bold text-foreground">{lastRecognized.memberName}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(lastRecognized.at), 'hh:mm:ss a')}
                  {lastRecognized.confidence !== undefined &&
                    ` · ${(lastRecognized.confidence * 100).toFixed(0)}% confidence`}
                </p>
                <Badge variant="outline" className={STATUS_STYLES[lastRecognized.type]}>
                  {STATUS_LABELS[lastRecognized.type]}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No recognitions yet</p>
            )}
          </div>

          <div className="glass rounded-xl p-6 space-y-4 animate-fade-in [animation-delay:200ms]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                Recognition Log
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-7 px-2 text-xs gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            </div>

            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                {recognisedCount} recognised
              </span>
              <span>{unknownCount} unrecognised</span>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  No activity yet. Turn on the entrance camera to begin.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Time</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead className="w-16 text-right">Conf.</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.map((entry) => (
                      <TableRow key={entry.key}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {format(new Date(entry.at), 'hh:mm:ss')}
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.memberName ?? 'Unknown'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.confidence !== undefined
                            ? `${(entry.confidence * 100).toFixed(0)}%`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs whitespace-nowrap ${STATUS_STYLES[entry.type]}`}
                          >
                            {STATUS_LABELS[entry.type]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveAttendance;
