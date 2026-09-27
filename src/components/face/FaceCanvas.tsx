import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { processDetections, assessDetectionQuality } from '@/vision/tracker';
import { getDetectorOptions } from '@/vision/models';
import type { ActiveTrack, RecognitionEvent } from '@/types/face';
import { Button } from '@/components/ui/button';
import { RotateCcw, VideoOff, Loader2 } from 'lucide-react';

/**
 * Preview frame rate. A camera preview reads as smooth well below the monitor's
 * refresh rate, and every frame drawn is a full-resolution copy competing with
 * React for the main thread. 25fps looks fine and costs less than half of 60.
 */
const RENDER_INTERVAL_MS = 40;

/**
 * Minimum gap between inference passes. Not a throttle so much as a yield: it
 * hands the main thread back to the browser between passes so the page can
 * paint and stay responsive instead of being monopolised by back-to-back
 * inference.
 */
const AI_YIELD_MS = 16;

/**
 * Absolute ceiling on how long a box may remain on screen.
 *
 * Normally boxes are retired by the "seen in one of the last two passes" rule
 * below, which needs no timing constant. This is the backstop for the case
 * that rule cannot catch: if inference stalls completely, both the pass clock
 * and the track clock freeze together, and boxes would otherwise hang on
 * screen indefinitely.
 *
 * Set well above any realistic pass time. If it were near the pass interval,
 * a heavily loaded machine — several faces at once on integrated graphics —
 * would blink boxes off between passes. It costs a second longer to clear a
 * frozen box after a total stall, which is the right trade.
 */
const BOX_CEILING_MS = 2500;

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
   * element still plays and still feeds the inference canvas, so recognition is
   * unaffected — this only removes the picture from the page.
   */
  showPreview?: boolean;
  /**
   * Tallest the preview may be, as a percentage of viewport height. The box is
   * then sized to the video's own shape, so there is no black letterboxing.
   */
  previewMaxHeightVh?: number;
}

/**
 * Live camera canvas with two independent loops:
 *
 *  - a preview loop (~25fps) that only draws video and boxes for the operator
 *  - an inference loop that draws into its OWN offscreen canvas and runs the
 *    recognition pipeline
 *
 * Keeping them separate is what stops the UI juddering. The preview canvas is
 * GPU-backed and cheap; the expensive full-resolution copy now happens once per
 * inference pass (a few times a second) rather than on every displayed frame.
 */
export const FaceCanvas: React.FC<FaceCanvasProps> = ({
  stream,
  mode,
  onEventFired,
  onFramesCollected,
  onDetectionStateChange,
  idleMessage = 'Camera is off',
  showPreview = true,
  previewMaxHeightVh = 70,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLDivElement>(null);

  const [rotation, setRotation] = useState<number>(0);
  const [warmingUp, setWarmingUp] = useState(false);
  // Width/height of the frame as displayed. Drives the box's aspect ratio, so
  // the box hugs the video instead of stretching into black letterbox bars.
  const [frameAspect, setFrameAspect] = useState(16 / 9);
  const frameAspectRef = useRef(16 / 9);

  // Refs hold mutable per-frame state without triggering React re-renders.
  const latestTracksRef = useRef<ActiveTrack[]>([]);
  const latestDetectionsRef = useRef<faceapi.WithFaceDescriptor<
    faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<object>>
  >[]>([]);
  const isDetectingRef = useRef(false);
  const lastFaceCountRef = useRef(-1);
  // Start times of the two most recent completed inference passes. A track is
  // drawn only if it was matched in one of them.
  const latestPassAtRef = useRef(0);
  const previousPassAtRef = useRef(0);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!stream || !videoRef.current) return;

    let animationFrameId = 0;
    let aiTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let lastRenderAt = 0;
    let lastFpsAt = performance.now();
    let frameCount = 0;

    // Dedicated offscreen canvas for inference. Never displayed, never styled,
    // and written only when a pass is about to run.
    const inferenceCanvas = document.createElement('canvas');
    const inferenceCtx = inferenceCanvas.getContext('2d');

    // No `willReadFrequently`: that flag forces a CPU-backed canvas, which made
    // every drawImage a large main-thread memory copy and then forced
    // TensorFlow.js to upload it back to the GPU. Left GPU-backed, the frame
    // stays on the GPU the whole way through.
    const displayCtx = canvasRef.current?.getContext('2d') ?? null;

    /** Paint the current video frame, honouring rotation, into a canvas. */
    const paintFrame = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const video = videoRef.current;
      if (!video) return;

      const isVertical = rotation === 90 || rotation === 270;
      const drawWidth = isVertical ? video.videoHeight : video.videoWidth;
      const drawHeight = isVertical ? video.videoWidth : video.videoHeight;
      if (drawWidth === 0 || drawHeight === 0) return;

      if (canvas.width !== drawWidth || canvas.height !== drawHeight) {
        canvas.width = drawWidth;
        canvas.height = drawHeight;
      }

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
    };

    // ---- 1. Preview loop: display only, throttled, skipped when hidden ----
    const renderLoop = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(renderLoop);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !displayCtx || video.paused || video.ended) return;

      // Throttle to RENDER_INTERVAL_MS rather than the monitor's refresh rate.
      if (timestamp - lastRenderAt < RENDER_INTERVAL_MS) return;
      lastRenderAt = timestamp;

      frameCount++;
      const now = performance.now();
      if (now - lastFpsAt >= 1000) {
        if (fpsRef.current) {
          fpsRef.current.innerText = `${Math.round((frameCount * 1000) / (now - lastFpsAt))} FPS`;
        }
        frameCount = 0;
        lastFpsAt = now;
      }

      paintFrame(displayCtx, canvas);

      // Update the box's shape only when the frame's shape actually changes
      // (first frame, or a rotation) — never every frame.
      if (canvas.width > 0 && canvas.height > 0) {
        const aspect = canvas.width / canvas.height;
        if (Math.abs(aspect - frameAspectRef.current) > 0.01) {
          frameAspectRef.current = aspect;
          setFrameAspect(aspect);
        }
      }

      if (mode === 'registration') {
        const detections = latestDetectionsRef.current;
        if (detections && detections.length > 0) {
          faceapi.draw.drawDetections(canvas, detections);
        }
      } else {
        const drawnAt = Date.now();
        latestTracksRef.current.forEach((track) => {
          // Draw only what the camera can currently see.
          //
          // The tracker deliberately keeps a track alive for a couple of
          // seconds after its last sighting, so a face briefly turning away or
          // being blocked doesn't restart recognition. That is right for
          // tracking but wrong for drawing: it left a green box parked over
          // empty background after the person had walked on.
          //
          // The test is "was this track matched in one of the last two
          // inference passes", which needs no timing constant and so adapts to
          // however fast this machine happens to be running. Allowing two
          // passes rather than one keeps a box steady when a face is missed in
          // a single frame, instead of flickering.
          if (track.lastSeenAt < previousPassAtRef.current) return;
          if (drawnAt - track.lastSeenAt > BOX_CEILING_MS) return;

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

          displayCtx.strokeStyle = color;
          displayCtx.lineWidth = 3;
          displayCtx.strokeRect(x, y, width, height);

          displayCtx.fillStyle = color;
          displayCtx.fillRect(x, y - 45, Math.max(width, 150), 45);

          displayCtx.fillStyle = '#ffffff';
          displayCtx.font = 'bold 16px sans-serif';
          displayCtx.fillText(label, x + 6, y - 25);

          displayCtx.font = '12px sans-serif';
          displayCtx.fillText(subLabel, x + 6, y - 8);
        });
      }
    };

    // ---- 2. Inference loop: own canvas, self-scheduling ----
    const runAI = async () => {
      const video = videoRef.current;
      if (!video || !inferenceCtx || isDetectingRef.current) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;

      isDetectingRef.current = true;
      try {
        // One full-resolution copy per inference pass, instead of one per
        // displayed frame. Same pixels the recogniser always saw, so face sizes
        // and the quality gate are unaffected.
        paintFrame(inferenceCtx, inferenceCanvas);

        const detections = await faceapi
          .detectAllFaces(inferenceCanvas, getDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();

        // Only notify React when the count actually changes — this used to fire
        // a state update, and so a re-render, on every single pass.
        if (detections.length !== lastFaceCountRef.current) {
          lastFaceCountRef.current = detections.length;
          onDetectionStateChange?.(detections.length);
        }

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
          // Stamp the pass before processing, so every track matched in it has
          // lastSeenAt >= this value.
          const passAt = Date.now();
          latestTracksRef.current = processDetections(detections, onEventFired);
          previousPassAtRef.current = latestPassAtRef.current;
          latestPassAtRef.current = passAt;
        }
      } catch (err) {
        console.error('Face detection error:', err);
        // Drop the boxes rather than leave the last ones frozen on screen. A
        // failing pass used to leave stale rectangles painted indefinitely,
        // because nothing else clears them.
        latestTracksRef.current = [];
        latestDetectionsRef.current = [];
      } finally {
        isDetectingRef.current = false;
      }
    };

    /**
     * Schedule passes back-to-back with a short yield, rather than on a fixed
     * interval. A fixed 100ms interval wasted the remainder of the slot when a
     * pass ran long, and fired pointlessly when it ran short.
     */
    const scheduleAI = () => {
      if (cancelled) return;
      aiTimeout = setTimeout(async () => {
        await runAI();
        scheduleAI();
      }, AI_YIELD_MS);
    };

    /**
     * Wait until the camera reports a settled frame size.
     *
     * Webcam streams (virtual cameras especially) report 0x0 first, then often
     * a placeholder size, before settling on the real resolution. TensorFlow.js
     * compiles its WebGL shaders per input SHAPE — so starting detection early
     * makes it compile the entire program set once per transient size. That
     * repeated recompilation, not inference itself, is what makes the first
     * minute crawl.
     */
    const waitForStableSize = async () => {
      let lastWidth = -1;
      let stableTicks = 0;
      // ~3s ceiling so a quirky camera can never block startup entirely.
      for (let i = 0; i < 30 && !cancelled && stableTicks < 3; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const w = videoRef.current?.videoWidth ?? 0;
        if (w > 0 && w === lastWidth) {
          stableTicks++;
        } else {
          stableTicks = 0;
          lastWidth = w;
        }
      }
    };

    const startPipeline = async () => {
      try {
        await videoRef.current?.play();
      } catch (e) {
        console.error('Video play error:', e);
        return;
      }
      if (cancelled) return;

      await waitForStableSize();
      if (cancelled) return;

      // Only run the preview loop when the preview is actually visible.
      // Hidden, it was still drawing every frame for nobody to see.
      if (showPreview) {
        animationFrameId = requestAnimationFrame(renderLoop);
      }

      // Compile shaders once, up front, with the preview already visible and a
      // "warming up" badge showing — instead of stalling the first ~100 frames.
      setWarmingUp(true);
      await runAI();
      if (cancelled) return;
      setWarmingUp(false);

      scheduleAI();
    };

    startPipeline();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrameId);
      clearTimeout(aiTimeout);
      lastFaceCountRef.current = -1;
      // Release the offscreen frame buffer promptly.
      inferenceCanvas.width = 0;
      inferenceCanvas.height = 0;
    };
  }, [
    stream,
    mode,
    onEventFired,
    onFramesCollected,
    onDetectionStateChange,
    rotation,
    showPreview,
  ]);

  if (!stream) {
    if (!showPreview) return null;
    return (
      <div
        className="mx-auto bg-secondary/30 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-2"
        style={{
          aspectRatio: '16 / 9',
          width: `calc(${previewMaxHeightVh}vh * ${16 / 9})`,
          maxWidth: '100%',
        }}
      >
        <VideoOff className="w-8 h-8" />
        <span className="text-sm">{idleMessage}</span>
      </div>
    );
  }

  return (
    <div
      className={
        showPreview
          ? 'relative mx-auto overflow-hidden rounded-xl bg-black border border-border'
          : 'sr-only'
      }
      // Width follows the height cap through the video's own aspect ratio, so
      // the box is exactly the shape of the picture — no black side bars.
      style={
        showPreview
          ? {
              aspectRatio: `${frameAspect}`,
              width: `calc(${previewMaxHeightVh}vh * ${frameAspect})`,
              maxWidth: '100%',
            }
          : undefined
      }
    >
      <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted />
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      <div
        ref={fpsRef}
        className="absolute top-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-mono text-white backdrop-blur-sm"
      >
        0 FPS
      </div>

      {warmingUp && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-lg bg-black/70 px-4 py-2.5 text-sm text-white">
            <Loader2 className="w-4 h-4 animate-spin" />
            Warming up recognition — first run only
          </div>
        </div>
      )}

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
