import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Member } from '@/types';
import type { FaceProfileDoc } from '@/types/face';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { CameraControl } from '@/components/face/CameraControl';
import { FaceCanvas } from '@/components/face/FaceCanvas';
import { loadModels } from '@/vision/models';
import { extractDescriptorFromPhoto } from '@/vision/photoEnroll';
import { saveFaceProfile, getFaceProfile, deleteFaceProfile } from '@/services/faceService';
import { useAuth } from '@/contexts/AuthContext';
import {
  ScanFace,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ShieldCheck,
  Upload,
  ImageIcon,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Matches the prototype: 20 good frames is a complete capture, 8 is the floor.
const TARGET_FRAMES = 20;
const MIN_FRAMES_TO_SAVE = 8;

// A still photo is sharper than a webcam frame, so a single accepted photo is
// enough to enrol. Two or three from slightly different angles are better.
const MIN_PHOTOS_TO_SAVE = 1;
const RECOMMENDED_PHOTOS = 3;

interface PhotoItem {
  id: string;
  name: string;
  previewUrl: string;
  status: 'processing' | 'accepted' | 'rejected';
  descriptor?: Float32Array;
  reason?: string;
}

interface FaceRegistrationDialogProps {
  member: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fires after face data changes. `action` distinguishes a save from a
   * removal so callers can react only to a successful registration.
   */
  onRegistered?: (action: 'saved' | 'removed') => void;
}

export const FaceRegistrationDialog: React.FC<FaceRegistrationDialogProps> = ({
  member,
  open,
  onOpenChange,
  onRegistered,
}) => {
  const { user } = useAuth();
  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [descriptors, setDescriptors] = useState<Float32Array[]>([]);
  const [profile, setProfile] = useState<FaceProfileDoc | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load the recognition models once the dialog is first opened.
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  // Fetch the member's existing registration status.
  useEffect(() => {
    if (!open || !member) return;
    let cancelled = false;
    setLoadingProfile(true);
    getFaceProfile(member.id)
      .then((p) => !cancelled && setProfile(p))
      .catch((err) => {
        console.error('Error loading face profile:', err);
        if (!cancelled) setProfile(null);
      })
      .finally(() => !cancelled && setLoadingProfile(false));
    return () => {
      cancelled = true;
    };
  }, [open, member]);

  // Release the camera and clear captured data whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setStream((current) => {
        current?.getTracks().forEach((t) => t.stop());
        return null;
      });
      setDescriptors([]);
      setFailed(false);
      setFailReason(null);
      setPhotos((prev) => {
        prev.forEach((ph) => URL.revokeObjectURL(ph.previewUrl));
        return [];
      });
    }
  }, [open]);

  const handleFrameCollected = useCallback((descriptor: Float32Array) => {
    setDescriptors((prev) => (prev.length < TARGET_FRAMES ? [...prev, descriptor] : prev));
  }, []);

  const handleStream = useCallback((next: MediaStream | null) => {
    setStream(next);
    if (!next) setDescriptors([]);
  }, []);

  /** Run the shared detector over each chosen photo and keep the good ones. */
  const handlePhotosSelected = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const pending: PhotoItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      status: 'processing',
    }));
    setPhotos((prev) => [...prev, ...pending]);

    // Sequential: face detection is CPU-heavy, and parallel runs would fight
    // over the same backend and slow each other down.
    for (let i = 0; i < files.length; i++) {
      const result = await extractDescriptorFromPhoto(files[i]);
      const id = pending[i].id;

      // Narrow the union here rather than inside the updater, so the resolved
      // fields are captured concretely by the closure.
      let patch: Partial<PhotoItem>;
      if (result.ok && result.descriptor) {
        patch = { status: 'accepted', descriptor: result.descriptor };
      } else {
        const reason = result.reason ?? 'Could not read a face from this photo.';
        patch = { status: 'rejected', reason };
        toast.error(`${files[i].name}: ${reason}`);
      }

      setPhotos((prev) => prev.map((ph) => (ph.id === id ? { ...ph, ...patch } : ph)));
    }
  }, []);

  const handleRemovePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const target = prev.find((ph) => ph.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((ph) => ph.id !== id);
    });
  }, []);

  const handleSave = async () => {
    if (!member || !user) return;

    const photoDescriptors = photos
      .filter((ph) => ph.status === 'accepted' && ph.descriptor)
      .map((ph) => ph.descriptor as Float32Array);

    // Either source is sufficient on its own, and they combine freely — the
    // template is the average of whatever good samples we have.
    const hasEnoughFrames = descriptors.length >= MIN_FRAMES_TO_SAVE;
    const hasEnoughPhotos = photoDescriptors.length >= MIN_PHOTOS_TO_SAVE;
    if (!hasEnoughFrames && !hasEnoughPhotos) {
      toast.error(
        `Capture at least ${MIN_FRAMES_TO_SAVE} good camera frames, or upload at least ${MIN_PHOTOS_TO_SAVE} usable photo.`,
      );
      return;
    }

    const allDescriptors = [...descriptors, ...photoDescriptors];

    setSaving(true);
    setFailed(false);
    setFailReason(null);
    try {
      await saveFaceProfile(
        { id: member.id, memberId: member.memberId, name: member.name },
        allDescriptors,
        user.id,
      );
      toast.success(`Face registered for ${member.name}`);
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setDescriptors([]);
      setPhotos((prev) => {
        prev.forEach((ph) => URL.revokeObjectURL(ph.previewUrl));
        return [];
      });
      const refreshed = await getFaceProfile(member.id);
      setProfile(refreshed);
      onRegistered?.('saved');
    } catch (err) {
      console.error('Face registration failed:', err);
      setFailed(true);
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'permission-denied') {
        setFailReason(
          'Permission denied by Firestore. The face recognition security rules have not been deployed yet — run "firebase deploy --only firestore:rules". You must also be signed in as an administrator.',
        );
        toast.error('Permission denied — Firestore rules not deployed');
      } else if (code === 'unavailable' || code === 'deadline-exceeded') {
        setFailReason('Could not reach Firestore. Check the internet connection and try again.');
        toast.error('Network error');
      } else {
        setFailReason(err instanceof Error ? err.message : 'Unknown error while saving.');
        toast.error('Registration failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!member) return;
    if (!window.confirm(`Remove face data for ${member.name}? They will no longer be recognised at the entrance.`)) {
      return;
    }
    try {
      await deleteFaceProfile(member.id);
      setProfile(null);
      toast.success('Face data removed');
      onRegistered?.('removed');
    } catch (err) {
      console.error('Error removing face data:', err);
      toast.error('Failed to remove face data');
    }
  };

  if (!member) return null;

  const progress = Math.min(100, (descriptors.length / TARGET_FRAMES) * 100);
  const acceptedPhotos = photos.filter((ph) => ph.status === 'accepted').length;
  const processingPhotos = photos.some((ph) => ph.status === 'processing');
  const totalSamples = descriptors.length + acceptedPhotos;
  const canSave =
    !saving &&
    !processingPhotos &&
    (descriptors.length >= MIN_FRAMES_TO_SAVE || acceptedPhotos >= MIN_PHOTOS_TO_SAVE);

  const statusBadge = () => {
    if (loadingProfile) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Checking...</Badge>;
    }
    if (failed) {
      return (
        <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
          <XCircle className="w-3 h-3" /> Registration Failed
        </Badge>
      );
    }
    if (profile) {
      return (
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
          <CheckCircle2 className="w-3 h-3" /> Face Registered
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
        Face Not Registered
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <ScanFace className="w-5 h-5 text-primary" />
            Face Registration
          </DialogTitle>
          <DialogDescription>
            {member.name} · {member.memberId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between glass rounded-lg p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Registration Status</p>
              {profile && (
                <p className="text-xs text-muted-foreground">
                  Registered {format(new Date(profile.registeredAt), 'dd MMM yyyy')} ·{' '}
                  {profile.sampleCount} samples
                </p>
              )}
            </div>
            {statusBadge()}
          </div>

          {failReason && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {failReason}
            </div>
          )}

          {modelError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              Failed to load face recognition models. Check that the model files are present in
              <code className="mx-1 px-1 rounded bg-black/30">/models</code> and reload the page.
            </div>
          ) : !modelsReady ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading face recognition models...
            </div>
          ) : (
            <>
              <FaceCanvas
                stream={stream}
                mode="registration"
                onFramesCollected={handleFrameCollected}
                idleMessage="Turn the camera on to begin registration"
              />

              <CameraControl
                onStream={handleStream}
                isActive={!!stream}
                autoStart
                label="Registration Camera"
                helpText="Camera starts automatically on the last one you used. Look at it and slowly turn your head left, right, up and down."
              />

              {/* Capture progress */}
              <div className="glass rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Face Data Collection</span>
                  <span
                    className={
                      descriptors.length >= TARGET_FRAMES
                        ? 'text-emerald-400'
                        : descriptors.length >= MIN_FRAMES_TO_SAVE
                          ? 'text-amber-400'
                          : 'text-muted-foreground'
                    }
                  >
                    {descriptors.length} / {TARGET_FRAMES} good frames
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {!stream
                    ? 'Camera is off.'
                    : descriptors.length >= TARGET_FRAMES
                      ? 'Capture complete — you can save now.'
                      : `Only clear, close, front-facing frames are counted. At least ${MIN_FRAMES_TO_SAVE} are required.`}
                </p>
              </div>

              <Separator className="bg-border/50" />

              {/* Photo upload — an alternative to live capture that runs the
                  same detector and the same quality gate. */}
              <div className="glass rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-primary" />
                      Register from a Photo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      No camera needed. Use {RECOMMENDED_PHOTOS} clear, front-facing photos for best
                      results — one is enough to register.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/bmp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handlePhotosSelected(e.target.files);
                      e.target.value = ''; // allow re-picking the same file
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={processingPhotos}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {processingPhotos ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {processingPhotos ? 'Scanning...' : 'Upload Photo'}
                  </Button>
                </div>

                {photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {photos.map((photo) => (
                      <div
                        key={photo.id}
                        className={`relative rounded-lg overflow-hidden border ${
                          photo.status === 'accepted'
                            ? 'border-emerald-500/40'
                            : photo.status === 'rejected'
                              ? 'border-red-500/40'
                              : 'border-border'
                        }`}
                      >
                        <img
                          src={photo.previewUrl}
                          alt={photo.name}
                          className="w-full h-24 object-cover"
                        />

                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(photo.id)}
                          className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors"
                          title="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>

                        <div className="p-1.5 bg-background/80">
                          {photo.status === 'processing' && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Scanning...
                            </span>
                          )}
                          {photo.status === 'accepted' && (
                            <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Face accepted
                            </span>
                          )}
                          {photo.status === 'rejected' && (
                            <span
                              className="text-[10px] text-red-500 flex items-start gap-1"
                              title={photo.reason}
                            >
                              <XCircle className="w-3 h-3 flex-shrink-0 mt-px" />
                              <span className="line-clamp-2">{photo.reason}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {acceptedPhotos > 0 && (
                  <p className="text-xs text-emerald-500">
                    {acceptedPhotos} photo{acceptedPhotos === 1 ? '' : 's'} accepted
                    {descriptors.length > 0 &&
                      ` · combined with ${descriptors.length} camera frame${descriptors.length === 1 ? '' : 's'}`}
                    {' · '}
                    {totalSamples} sample{totalSamples === 1 ? '' : 's'} total
                  </p>
                )}
              </div>

              <Separator className="bg-border/50" />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Only a numeric face signature is stored — never a photo or video.
                </p>
                <div className="flex gap-2">
                  {profile && (
                    <Button type="button" variant="outline" onClick={handleRemove} className="gap-2">
                      <Trash2 className="w-4 h-4" />
                      Remove Face Data
                    </Button>
                  )}
                  <Button type="button" onClick={handleSave} disabled={!canSave} className="gap-2">
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {profile ? 'Update Face' : 'Save Registration'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
