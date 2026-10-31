"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import {
  Camera,
  CameraOff,
  Hand,
  LoaderCircle,
} from "lucide-react";

type GestureCameraProps = {
  onZoom: (zoom: number) => void;
  onPan: (deltaX: number, deltaY: number) => void;
  onReset: () => void;
  onDismiss: () => void;
  onRecall: () => void;
};

type GestureName =
  | "PINCH"
  | "FIST"
  | "OPEN PALM"
  | "TWO HANDS"
  | "HANDS JOINED"
  | "CLAP"
  | "NO HAND";

export default function GestureCamera({
  onZoom,
  onPan,
  onReset,
  onDismiss,
  onRecall,
}: GestureCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const callbacksRef = useRef({
    onZoom,
    onPan,
    onReset,
    onDismiss,
    onRecall,
  });

  const previousPinchRef = useRef<{
    x: number;
    y: number;
  } | null>(null);

  const openPalmStartRef = useRef<number | null>(null);

  // Two-hand gesture tracking.
  const previousHandDistanceRef = useRef<number | null>(null);
  const joinedHandsStartRef = useRef<number | null>(null);
  const lastRecallRef = useRef(0);

  const lastGestureRef = useRef<GestureName>("NO HAND");
  const lastZoomRef = useRef(1);

  const [loading, setLoading] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [gesture, setGesture] = useState<GestureName>("NO HAND");
  const [error, setError] = useState("");

  useEffect(() => {
    callbacksRef.current = {
      onZoom,
      onPan,
      onReset,
      onDismiss,
      onRecall,
    };
  }, [onZoom, onPan, onReset, onDismiss, onRecall]);

  // Initialize MediaPipe with two-hand tracking.
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setLoading(true);
        setError("");

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const landmarker = await HandLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
          }
        );

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setLoading(false);
      } catch (err) {
        console.error("MediaPipe initialization error:", err);

        if (!cancelled) {
          setError(
            "Could not load hand tracking. Check your internet connection and refresh."
          );
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();

      streamRef.current = null;
      landmarkerRef.current = null;
    };
  }, []);

  const resetTracking = () => {
    previousPinchRef.current = null;
    previousHandDistanceRef.current = null;
    joinedHandsStartRef.current = null;
    openPalmStartRef.current = null;
  };

  const stopCamera = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    resetTracking();
    lastGestureRef.current = "NO HAND";

    setCameraActive(false);
    setGesture("NO HAND");
  }, []);

  const detectHands = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(detectHands);
      return;
    }

    try {
      const results = landmarker.detectForVideo(
        video,
        performance.now()
      );

      const hands = results.landmarks ?? [];
      const now = Date.now();

      // No hand detected.
      if (hands.length === 0) {
        resetTracking();
        lastGestureRef.current = "NO HAND";
        setGesture("NO HAND");
        animationRef.current = requestAnimationFrame(detectHands);
        return;
      }

      // TWO-HAND GESTURES: clap or join both hands.
      if (hands.length >= 2) {
        previousPinchRef.current = null;
        openPalmStartRef.current = null;

        const firstPalm = hands[0][9];
        const secondPalm = hands[1][9];

        // Distance between the two palm centers.
        const handDistance = Math.hypot(
          firstPalm.x - secondPalm.x,
          firstPalm.y - secondPalm.y
        );

        const previousDistance = previousHandDistanceRef.current;

        // Hands have rapidly come together: clap detection.
        const clapDetected =
          previousDistance !== null &&
          previousDistance > 0.28 &&
          handDistance < 0.17 &&
          previousDistance - handDistance > 0.10;

        if (
          clapDetected &&
          now - lastRecallRef.current > 1500
        ) {
          lastRecallRef.current = now;
          joinedHandsStartRef.current = null;

          callbacksRef.current.onRecall();

          lastGestureRef.current = "CLAP";
          setGesture("CLAP");
        } else if (handDistance < 0.18) {
          // Both hands held together: joined-hands detection.
          if (joinedHandsStartRef.current === null) {
            joinedHandsStartRef.current = now;
          }

          const heldFor = now - joinedHandsStartRef.current;

          if (
            heldFor >= 700 &&
            now - lastRecallRef.current > 1500
          ) {
            lastRecallRef.current = now;
            joinedHandsStartRef.current = now;

            callbacksRef.current.onRecall();

            lastGestureRef.current = "HANDS JOINED";
            setGesture("HANDS JOINED");
          } else if (lastGestureRef.current !== "CLAP") {
            setGesture("HANDS JOINED");
          }
        } else {
          joinedHandsStartRef.current = null;
          setGesture("TWO HANDS");
          lastGestureRef.current = "TWO HANDS";
        }

        previousHandDistanceRef.current = handDistance;

        animationRef.current = requestAnimationFrame(detectHands);
        return;
      }

      // ONE-HAND GESTURES.
      previousHandDistanceRef.current = null;
      joinedHandsStartRef.current = null;

      const landmarks = hands[0];

      const fingerPairs = [
        [8, 6],
        [12, 10],
        [16, 14],
        [20, 18],
      ];

      const extendedFingers = fingerPairs.filter(
        ([tip, pip]) => landmarks[tip].y < landmarks[pip].y
      ).length;

      const thumb = landmarks[4];
      const index = landmarks[8];

      const pinchDistance = Math.hypot(
        thumb.x - index.x,
        thumb.y - index.y
      );

      const midX = (thumb.x + index.x) / 2;
      const midY = (thumb.y + index.y) / 2;

      let currentGesture: GestureName = "NO HAND";

      // PINCH: drag and zoom.
      if (pinchDistance < 0.15 && extendedFingers >= 2) {
        currentGesture = "PINCH";
        openPalmStartRef.current = null;

        const previous = previousPinchRef.current;

        if (previous) {
          const deltaX = (previous.x - midX) * 700;
          const deltaY = (midY - previous.y) * 700;

          if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) {
            callbacksRef.current.onPan(deltaX, deltaY);
          }
        }

        const nextZoom = Math.max(
          1,
          Math.min(2.5, 1 + (0.15 - pinchDistance) * 12)
        );

        if (Math.abs(nextZoom - lastZoomRef.current) > 0.015) {
          lastZoomRef.current = nextZoom;
          callbacksRef.current.onZoom(nextZoom);
        }

        previousPinchRef.current = {
          x: midX,
          y: midY,
        };
      } else {
        previousPinchRef.current = null;

        // FIST: reset position and zoom.
        if (extendedFingers === 0) {
          currentGesture = "FIST";
          openPalmStartRef.current = null;

          if (lastGestureRef.current !== "FIST") {
            lastZoomRef.current = 1;
            callbacksRef.current.onReset();
          }
        }

        // OPEN PALM: dismiss after 900 ms.
        else if (extendedFingers === 4) {
          currentGesture = "OPEN PALM";

          if (openPalmStartRef.current === null) {
            openPalmStartRef.current = now;
          }

          const heldFor = now - openPalmStartRef.current;

          if (heldFor >= 900) {
            callbacksRef.current.onDismiss();
            openPalmStartRef.current = null;
          }
        } else {
          openPalmStartRef.current = null;
        }
      }

      lastGestureRef.current = currentGesture;
      setGesture(currentGesture);
    } catch (err) {
      console.error("Hand detection error:", err);
    }

    animationRef.current = requestAnimationFrame(detectHands);
  }, []);

  const startCamera = async () => {
    try {
      setError("");

      if (!landmarkerRef.current) {
        setError("Hand tracking is still loading. Please wait.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      resetTracking();
      lastZoomRef.current = 1;

      setCameraActive(true);
      animationRef.current = requestAnimationFrame(detectHands);
    } catch (err) {
      console.error("Camera error:", err);
      setError(
        "Camera access failed. Allow camera permission in your browser."
      );
      stopCamera();
    }
  };

  const gestureColor =
    gesture === "PINCH"
      ? "text-cyan-300"
      : gesture === "FIST"
        ? "text-purple-300"
        : gesture === "OPEN PALM"
          ? "text-emerald-300"
          : gesture === "CLAP" || gesture === "HANDS JOINED"
            ? "text-yellow-300"
            : "text-slate-400";

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#050c16]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${
            cameraActive ? "scale-x-[-1]" : "opacity-0"
          }`}
        />

        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Camera size={36} className="text-slate-600" />
            <p className="text-sm text-slate-500">Camera preview</p>
          </div>
        )}

        {cameraActive && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Camera active
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#050c16]/90 text-sm text-cyan-300">
            <LoaderCircle size={18} className="animate-spin" />
            Loading two-hand tracking...
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#071525] p-3">
        <div className="flex items-center gap-3">
          <Hand size={20} className={gestureColor} />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Detected gesture
            </p>
            <p className={`text-sm font-bold ${gestureColor}`}>
              {gesture}
            </p>
          </div>
        </div>

        <button
          onClick={cameraActive ? stopCamera : startCamera}
          disabled={loading}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            cameraActive
              ? "border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20"
              : "bg-cyan-400 text-black hover:bg-cyan-300"
          }`}
        >
          {cameraActive ? (
            <>
              <CameraOff size={15} />
              Stop Camera
            </>
          ) : (
            <>
              <Camera size={15} />
              Start Camera
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 text-center text-[10px] text-slate-400 sm:grid-cols-3">
        <div className="rounded-lg bg-white/5 p-2">
          <span className="block text-cyan-300">PINCH</span>
          Grab + Move + Zoom
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <span className="block text-purple-300">FIST</span>
          Reset
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <span className="block text-emerald-300">OPEN PALM</span>
          Dismiss
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <span className="block text-yellow-300">CLAP</span>
          Recall
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <span className="block text-yellow-300">JOIN HANDS</span>
          Recall
        </div>
      </div>
    </div>
  );
}