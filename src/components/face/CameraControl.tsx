import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, PlayCircle, StopCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CameraControlProps {
  onStream: (stream: MediaStream | null) => void;
  isActive: boolean;
  /** Disables the controls entirely (e.g. for non-admin viewers). */
  disabled?: boolean;
  label?: string;
  helpText?: string;
}

/**
 * Camera selection and ON/OFF control.
 *
 * Enumerates every video input the operating system exposes, so the entrance
 * camera can be a dedicated USB camera, a capture device, or an IP camera
 * bridged to a virtual webcam — not just the machine's built-in webcam.
 */
export const CameraControl: React.FC<CameraControlProps> = ({
  onStream,
  isActive,
  disabled = false,
  label = 'Camera',
  helpText,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [starting, setStarting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    // Camera APIs only exist in a secure context (https:// or localhost).
    if (!navigator.mediaDevices?.enumerateDevices) {
      setHint(
        'Camera access needs a secure connection. Open this page on https:// or on localhost.',
      );
      return;
    }

    const listVideoInputs = async () => {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'videoinput');
    };

    try {
      // Enumerate first: devices are listed even before permission is granted
      // (labels are blank until then). Doing this up front means a failing
      // probe below can never leave the list empty.
      let videoDevices = await listVideoInputs();

      // Probe for permission so device labels become readable. This is
      // best-effort and deliberately non-fatal: on machines with an infrared
      // Windows Hello camera the default-device probe often fails, which must
      // not prevent the working cameras from being listed.
      if (videoDevices.some((d) => !d.label)) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ video: true });
          probe.getTracks().forEach((t) => t.stop());
          videoDevices = await listVideoInputs();
        } catch (probeErr) {
          console.warn('Camera label probe failed (continuing anyway):', probeErr);
        }
      }

      setDevices(videoDevices);
      setSelectedDeviceId((prev) => {
        if (prev && videoDevices.some((d) => d.deviceId === prev)) return prev;
        return videoDevices[0]?.deviceId ?? '';
      });

      if (videoDevices.length === 0) {
        setHint('No cameras found. Connect a camera and press Refresh.');
      } else if (videoDevices.every((d) => !d.label)) {
        setHint(
          'Camera names are hidden until you allow camera access. Press Camera ON, then allow the browser prompt.',
        );
      } else {
        setHint(null);
      }
    } catch (err) {
      console.error('Error enumerating cameras:', err);
      setHint('Could not list cameras. Check the browser camera permission for this site.');
      toast.error('Could not list cameras');
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const startCamera = async () => {
    if (!selectedDeviceId) {
      toast.error('Select a camera first');
      return;
    }
    setStarting(true);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedDeviceId } },
      });
      streamRef.current = stream;
      onStream(stream);
      setHint(null);
      // Labels become readable once permission is granted — refresh so the
      // dropdown shows real camera names instead of placeholders.
      if (devices.some((d) => !d.label)) {
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === 'videoinput'));
      }
    } catch (err) {
      console.error('Error starting camera:', err);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError') {
        setHint('Camera permission was blocked. Allow camera access for this site, then try again.');
        toast.error('Camera permission denied');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setHint('This camera is in use by another application. Close it and try again.');
        toast.error('Camera is busy');
      } else if (name === 'OverconstrainedError' || name === 'NotFoundError') {
        setHint('That camera is no longer available. Press Refresh and pick it again.');
        toast.error('Camera not available');
      } else {
        toast.error('Failed to start camera');
      }
    } finally {
      setStarting(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      // Properly release the hardware so other software can use the camera.
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    onStream(null);
  }, [onStream]);

  // Release the camera if this control unmounts while running.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              isActive
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-muted text-muted-foreground'
            }
          >
            {isActive ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refreshDevices}
            disabled={isActive || disabled}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Select
          value={selectedDeviceId}
          onValueChange={setSelectedDeviceId}
          disabled={isActive || disabled}
        >
          <SelectTrigger className="bg-secondary/50 flex-1">
            <SelectValue placeholder="Choose a camera..." />
          </SelectTrigger>
          <SelectContent>
            {devices.map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.substring(0, 6)}...`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isActive ? (
          <Button type="button" onClick={startCamera} disabled={disabled || starting} className="gap-2">
            <PlayCircle className="w-4 h-4" />
            {starting ? 'Starting...' : 'Camera ON'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            onClick={stopCamera}
            disabled={disabled}
            className="gap-2"
          >
            <StopCircle className="w-4 h-4" />
            Camera OFF
          </Button>
        )}
      </div>

      {hint && (
        <p className="text-xs text-amber-400 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {hint}
        </p>
      )}

      {devices.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {devices.length} camera{devices.length === 1 ? '' : 's'} detected
        </p>
      )}

      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
};
