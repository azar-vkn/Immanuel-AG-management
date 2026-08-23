import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { processDetections, assessDetectionQuality } from '@/vision/tracker';
import { getDetectorOptions } from '@/vision/models';
import type { ActiveTrack, RecognitionEvent } from '@/types/face';
import { Button } from '@/components/ui/button';
import { RotateCcw, VideoOff } from 'lucide-react';

interface FaceCanvasProps {
  stream: MediaStream | null;
  mode: 'registration' | 'recognition';
  onEventFired?: (event: RecognitionEvent) => void;
  onFramesCollected?: (descriptor: Float32Array) => void;
  /** Reports whether a face is currently visible, for the status panel. */
  onDetectionStateChange?: (faceCount: number) => void;
  idleMessage?: string;
  /**
   * When false the video is hidden but detection keeps running. A hidden
   * element still plays and still paints to the canvas, so recognition is
   * unaffected — this only removes the picture from the page.
   */
  showPreview?: boolean;
}

/**
 * Live camera canvas with the prototype's two-loop architecture:
 *  - a render loop at screen refresh rate that only draws video + boxes
 *  - an AI loop throttled to ~10 FPS that runs detection off the critical path
 *
 * This split is what keeps the preview smooth while inference is running.
 */
export const FaceCanvas: React.FC<FaceCanvasProps> = ({
  stream,
  mode,
  onEventFired,
  onFramesCollected,
  onDetectionStateChange,
  idleMessage = 'Camera is off',
  showPreview = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLDivElement>(null);

  const [rotation, setRotation] = useState<number>(0);

  // Refs hold mutable per-frame state without triggering React re-renders.
  const latestTracksRef = useRef<ActiveTrack[]>([]);
  const latestDetectionsRef = useRef<faceapi.WithFaceDescriptor<
    faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<object>>
  >[]>([]);
  const isDetectingRef = useRef(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!stream || !videoRef.current || !canvasRef.current) return;

    let animationFrameId: number;
    let detectionInterval: ReturnType<typeof setInterval>;
    let lastFrameTime = performance.now();
    let frameCount = 0;

    // 1. Render loop — draws video and the current boxes only. No inference.
    const renderLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.paused || video.ended) {
        animationFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      const now = performance.now();
      frameCount++;
      if (now - lastFrameTime >= 1000) {
        if (fpsRef.current) {
          fpsRef.current.innerText = `${Math.round((frameCount * 1000) / (now - lastFrameTime))} FPS`;
        }
        frameCount = 0;
        lastFrameTime = now;
      }

      const isVertical = rotation === 90 || rotation === 270;
      const drawWidth = isVertical ? video.videoHeight : video.videoWidth;
      const drawHeight = isVertical ? video.videoWidth : video.videoHeight;

      if (canvas.width !== drawWidth || canvas.height !== drawHeight) {
        canvas.width = drawWidth;
        canvas.height = drawHeight;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(
        video,
        -video.videoWidth / 2,
        -video.videoHeight / 2,
        video.videoWidth,
        video.videoHeight,
      );
      ctx.restore();

      if (mode === 'registration') {
        const detections = latestDetectionsRef.current;
        if (detections && detections.length > 0) {
          faceapi.draw.drawDetections(canvas, detections);
        }
      } else {
        latestTracksRef.current.forEach((track) => {
          const { x, y, width, height } = track.boundingBox;
          let color = '#3b82f6';
          let label = track.trackId;
          let subLabel = 'Processing...';

          if (track.isRecognized) {
            if (track.recognizedTemplate) {
              color = '#10b981';
              label = `✓ ${track.recognizedTemplate.memberName}`;
              subLabel = `Confidence: ${((track.recognizedConfidence ?? 0) * 100).toFixed(0)}%`;
            } else {
              color = '#ef4444';
              label = 'Unknown';
              subLabel = 'Not registered';
            }
          } else {
            subLabel = `Frames: ${track.historySize}`;
          }

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, width, height);

          ctx.fillStyle = color;
          ctx.fillRect(x, y - 45, Math.max(width, 150), 45);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText(label, x + 6, y - 25);

          ctx.font = '12px sans-serif';
          ctx.fillText(subLabel, x + 6, y - 8);
        });
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    // 2. AI loop — async so it never blocks rendering.
    const runAI = async () => {
      const canvas = canvasRef.current;
      if (!canvas || isDetectingRef.current) return;

      isDetectingRef.current = true;
      try {
        const detections = await faceapi
          .detectAllFaces(canvas, getDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();

        onDetectionStateChange?.(detections.length);

        if (mode === 'registration') {
          latestDetectionsRef.current = detections;
          // Collect only when exactly one clear, frontal face is present,
          // using the same quality bar the recogniser applies.
          if (detections.length === 1 && onFramesCollected) {
            if (assessDetectionQuality(detections[0]).good) {
              onFramesCollected(detections[0].descriptor);
            }
          }
        } else {
          latestTracksRef.current = processDetections(detections, onEventFired);
        }
      } catch (err) {
        console.error('Face detection error:', err);
      } finally {
        isDetectingRef.current = false;
      }
    };

    videoRef.current
      .play()
      .then(() => {
        renderLoop();
        detectionInterval = setInterval(runAI, 100); // ~10 FPS inference
      })
      .catch((e) => console.error('Video play error:', e));

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(detectionInterval);
    };
  }, [stream, mode, onEventFired, onFramesCollected, onDetectionStateChange, rotation]);

  if (!stream) {
    if (!showPreview) return null;
    return (
      <div className="w-full aspect-video bg-secondary/30 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-2">
        <VideoOff className="w-8 h-8" />
        <span className="text-sm">{idleMessage}</span>
      </div>
    );
  }

  return (
    <div
      className={
        showPreview
          ? 'relative w-full overflow-hidden rounded-xl bg-black border border-border flex items-center justify-center min-h-[320px]'
          : 'sr-only'
      }
    >
      <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted />
      <canvas ref={canvasRef} className="w-full h-auto max-h-[70vh] object-contain" />

      <div
        ref={fpsRef}
        className="absolute top-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-mono text-white backdrop-blur-sm"
      >
        0 FPS
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setRotation((prev) => (prev + 90) % 360)}
        className="absolute top-3 right-3 gap-2 bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm border-0"
        title="Rotate camera view"
      >
        <RotateCcw className="w-4 h-4" />
        Rotate
      </Button>
    </div>
  );
};
