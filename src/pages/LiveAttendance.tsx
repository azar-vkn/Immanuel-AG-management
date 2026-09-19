import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getFaceTemplates, getRegisteredFaceIds } from '@/services/faceService';
import {
  getMembers,
  getEvents,
  getAttendanceByEvent,
  markAttendance,
} from '@/services/firestore';
import type { Member, ChurchEvent } from '@/types';
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
import { FaceRosterDialog } from '@/components/face/FaceRosterDialog';
import { FaceRegistrationDialog } from '@/components/members/FaceRegistrationDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScanFace, Loader2, UserCheck, ShieldAlert, RotateCcw, Radio, FlaskConical, ClipboardCheck } from 'lucide-react';
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

/** Whether "mark attendance on registration" is switched on, across reloads. */
const MARK_ON_REGISTER_KEY = 'iag_mark_attendance_on_register';

const readMarkOnRegister = (): boolean => {
  try {
    return localStorage.getItem(MARK_ON_REGISTER_KEY) === '1';
  } catch {
    return false;
  }
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
 * Face Configuration — face registration plus a recognition test harness.
 *
 * This page deliberately records nothing: no attendance, no Firestore logs.
 * It exists to check how the camera and the recogniser behave at the real
 * entrance (framing, lighting, distance, confidence) without touching live
 * data. Attendance is marked on the Attendance page.
 */
const LiveAttendance: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const canControl = hasPermission('attendance.live.control');
  const canRegisterFace = hasPermission('face.register');

  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastRecognized, setLastRecognized] = useState<LogEntry | null>(null);

  // Roster: who has face data and who doesn't
  const [members, setMembers] = useState<Member[]>([]);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [showRegistered, setShowRegistered] = useState(false);
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [faceDialogMember, setFaceDialogMember] = useState<Member | null>(null);

  // Mark attendance as each member registers at the door
  const [markOnRegister, setMarkOnRegister] = useState(readMarkOnRegister);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());

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

  // Events are needed only for attendance marking, so a failure here never
  // touches the camera or the roster.
  useEffect(() => {
    getEvents()
      .then((list) => {
        setEvents(list);
        const active = list.find((e) => e.status === 'active');
        setSelectedEventId((prev) => prev || active?.id || list[0]?.id || '');
      })
      .catch((e) => console.error('Error loading events:', e));
  }, []);

  // Who is already present for the chosen event, so we never double-mark.
  useEffect(() => {
    if (!selectedEventId) {
      setMarkedIds(new Set());
      return;
    }
    let cancelled = false;
    getAttendanceByEvent(selectedEventId)
      .then((records) => {
        if (!cancelled) setMarkedIds(new Set(records.map((r) => r.memberId)));
      })
      .catch((e) => console.error('Error loading attendance:', e));
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  const toggleMarkOnRegister = useCallback((next: boolean) => {
    setMarkOnRegister(next);
    try {
      localStorage.setItem(MARK_ON_REGISTER_KEY, next ? '1' : '0');
    } catch {
      /* non-fatal */
    }
  }, []);

  /** Reload templates + roster. Called on mount and after a registration. */
  const loadRoster = useCallback(async () => {
    const [ids, memberList] = await Promise.all([getRegisteredFaceIds(), getMembers()]);
    setRegisteredIds(ids);
    setMembers(memberList);
  }, []);

  // ---- Load registered faces ----
  useEffect(() => {
    let cancelled = false;
    getFaceTemplates()
      .then((templates) => {
        if (cancelled) return;
        setTemplates(templates);
        setTemplateCount(getTemplateCount());
        // Roster is supporting information — a failure here must not stop the
        // camera, so it is loaded separately and its error swallowed.
        loadRoster().catch((e) => console.error('Error loading roster:', e));
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
  }, [loadRoster]);

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

  // Expired and left members are excluded: registering a face for someone who
  // has gone is noise, and it would bury the people who actually need doing.
  const rosterMembers = useMemo(
    () => members.filter((m) => m.status !== 'expired' && m.status !== 'left'),
    [members],
  );

  const registeredMembers = useMemo(
    () => rosterMembers.filter((m) => registeredIds.has(m.id)),
    [rosterMembers, registeredIds],
  );

  const unregisteredMembers = useMemo(
    () => rosterMembers.filter((m) => !registeredIds.has(m.id)),
    [rosterMembers, registeredIds],
  );

  /**
   * Family head name by familyId, built from every member — including expired
   * and left ones, since a head may have left while their family remains.
   */
  const familyHeadNames = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      if (m.isHeadOfFamily && m.familyId) map.set(m.familyId, m.name);
    });
    return map;
  }, [members]);

  const familyHeadFor = useCallback(
    (member: Member) => {
      if (member.isHeadOfFamily) return member.name; // they are the head
      return familyHeadNames.get(member.familyId ?? '') ?? '';
    },
    [familyHeadNames],
  );

  const openRegistration = useCallback((member: Member) => {
    setShowRegistered(false);
    setShowUnregistered(false);
    setFaceDialogMember(member);
  }, []);

  /**
   * After registering, refresh the roster and matcher — and, when enabled,
   * mark the member present in the same step. That is the whole point of
   * registering at the door: they are standing right there.
   */
  const handleRegistered = useCallback(
    async (action: 'saved' | 'removed') => {
      const member = faceDialogMember;

      try {
        const [templates] = await Promise.all([getFaceTemplates(), loadRoster()]);
        setTemplates(templates);
        setTemplateCount(getTemplateCount());
      } catch (e) {
        console.error('Error refreshing after registration:', e);
      }

      // Only a successful save marks attendance — never a removal.
      if (action !== 'saved' || !markOnRegister || !member) return;

      if (!selectedEventId) {
        toast.error('No event selected — attendance not marked');
        return;
      }
      if (markedIds.has(member.id)) {
        toast.info(`${member.name} was already marked present`);
        return;
      }

      // Fellowship scope is deliberately NOT checked here. Anyone registered at
      // the door is physically present, so they are marked regardless of which
      // fellowships the event nominally covers.
      try {
        await markAttendance({
          eventId: selectedEventId,
          memberId: member.id,
          markedAt: new Date().toISOString(),
          markedBy: user?.id ?? 'unknown',
        });
        setMarkedIds((prev) => new Set(prev).add(member.id));
        toast.success(`Registered and marked present: ${member.name}`);
      } catch (e) {
        console.error('Error marking attendance after registration:', e);
        toast.error(`Face saved, but attendance could not be marked for ${member.name}`);
      }
    },
    [faceDialogMember, loadRoster, markOnRegister, selectedEventId, markedIds, user],
  );

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
        <h1 className="font-serif text-3xl font-bold text-gold-gradient">Face Configuration</h1>
        <p className="text-muted-foreground">
          Register member faces and test recognition at the entrance
        </p>
      </div>

      {/* Test-mode notice: this page must never be mistaken for real marking. */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-500 animate-fade-in">
        <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Camera recognition is test-only.</strong> Walk-throughs here check placement and
          accuracy without recording anything — mark attendance by camera on the Attendance page.
          The switch below is separate: it marks attendance as you register faces.
        </span>
      </div>

      {/* Mark attendance as members register at the door. Off by default, so
          the page stays a write-nothing test harness unless asked otherwise. */}
      {canRegisterFace && (
        <div className="glass rounded-xl p-4 space-y-3 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label
                htmlFor="markOnRegister"
                className="flex items-center gap-2 text-sm font-medium cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4 text-primary" />
                Mark attendance when a face is registered
              </Label>
              <p className="text-xs text-muted-foreground">
                For registering members as they arrive — saves their face and marks them
                present in one step.
              </p>
            </div>
            <Switch
              id="markOnRegister"
              checked={markOnRegister}
              onCheckedChange={toggleMarkOnRegister}
            />
          </div>

          {markOnRegister && (
            <div className="pt-3 border-t border-border/30 space-y-2">
              <Label className="text-xs text-muted-foreground">Mark attendance for</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="bg-secondary/50 max-w-md">
                  <SelectValue placeholder="Choose an event..." />
                </SelectTrigger>
                <SelectContent>
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.name} - {format(new Date(ev.date), 'MMM dd, yyyy')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {events.length === 0 ? (
                <p className="text-xs text-amber-500">
                  No events exist yet — create one on the Events page first.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {markedIds.size} already marked present for this event.
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in [animation-delay:200ms]">
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
            <button
              type="button"
              onClick={() => setShowRegistered(true)}
              className="glass rounded-xl p-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="View members with face data"
            >
              <p className="text-xs text-muted-foreground mb-1">Registered Faces</p>
              <p className="text-lg font-bold text-primary">{templateCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Click to view</p>
            </button>
            <button
              type="button"
              onClick={() => setShowUnregistered(true)}
              className="glass rounded-xl p-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="View members without face data"
            >
              <p className="text-xs text-muted-foreground mb-1">Not Registered</p>
              <p className="text-lg font-bold text-amber-500">{unregisteredMembers.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Click to register</p>
            </button>
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

      {/* Roster: who has face data, who still needs it */}
      <FaceRosterDialog
        open={showRegistered}
        onOpenChange={setShowRegistered}
        title="Registered Faces"
        description="Members whose face data the entrance camera can match."
        members={registeredMembers}
        variant="registered"
        onRegister={canRegisterFace ? openRegistration : undefined}
        familyHeadFor={familyHeadFor}
        exportFileName="registered-faces"
      />

      <FaceRosterDialog
        open={showUnregistered}
        onOpenChange={setShowUnregistered}
        title="Not Registered"
        description="Members with no face data yet — they cannot be recognised at the entrance."
        members={unregisteredMembers}
        variant="unregistered"
        onRegister={canRegisterFace ? openRegistration : undefined}
        familyHeadFor={familyHeadFor}
        exportFileName="not-registered-faces"
      />

      {faceDialogMember && (
        <FaceRegistrationDialog
          member={faceDialogMember}
          open={!!faceDialogMember}
          onOpenChange={(open) => !open && setFaceDialogMember(null)}
          onRegistered={handleRegistered}
        />
      )}
    </div>
  );
};

export default LiveAttendance;
