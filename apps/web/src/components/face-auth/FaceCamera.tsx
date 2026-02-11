import { useRef, useState, useCallback, useEffect } from "react";

interface FaceCameraProps {
  onCapture: (base64: string) => void;
  onError?: (error: Error) => void;
  mirrored?: boolean;
  active?: boolean;
}

export default function FaceCamera({
  onCapture,
  onError,
  mirrored = true,
  active = true,
}: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startAttemptRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    const attemptId = ++startAttemptRef.current;
    try {
      setError(null);
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
        const playPromise = videoRef.current.play();
        if (playPromise) {
          playPromise.catch(() => {});
        }
      }

      if (attemptId !== startAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setIsReady(true);
    } catch (err) {
      if (attemptId !== startAttemptRef.current) return;

      const cameraError = err instanceof Error ? err : new Error(String(err));
      if (cameraError.name === "NotAllowedError") {
        setError("Camera access denied. Please allow camera permissions.");
      } else if (cameraError.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Unable to start camera. Please refresh and try again.");
      }
      onError?.(cameraError);
    }
  }, [onError]);

  const stopCamera = useCallback(() => {
    startAttemptRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  useEffect(() => {
    if (active) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [active, startCamera, stopCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isReady) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    onCapture(base64);
  }, [isReady, mirrored, onCapture]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative overflow-hidden rounded-xl border border-white/20 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-[360px] w-[480px] max-w-[90vw] object-cover"
          style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[260px] w-[200px] rounded-full border-2 border-dashed border-white/50" />
        </div>

        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="text-sm text-white">Starting camera...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="max-w-[320px] text-center text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <button
        type="button"
        onClick={capture}
        disabled={!isReady}
        className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
      >
        {isReady ? "Capture Face" : "Waiting for camera..."}
      </button>
    </div>
  );
}
