"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RecorderState =
  | "idle"
  | "recording"
  | "stopped"
  | "uploading"
  | "done"
  | "failed";

type SonicIngestResult = {
  sonicChunkCountAdded: number;
  sonicChunkCountTotal: number;
  warnings: string[];
};

const MAX_RECORDING_SECONDS = 180; // 3 minutes

function formatSeconds(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function AudioRecorder({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<SonicIngestResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopWaveform() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }

  function drawWaveform() {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 40;
      const barWidth = canvas.width / barCount - 2;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] ?? 0;
        const barHeight = (value / 255) * canvas.height;
        const x = i * (barWidth + 2);
        const y = canvas.height - barHeight;

        const alpha = 0.4 + (value / 255) * 0.6;
        ctx.fillStyle = `rgba(110,231,183,${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    };

    draw();
  }

  async function startRecording() {
    setError(null);
    setWarnings([]);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "Microphone access denied. Please allow microphone access and try again."
      );
      return;
    }

    streamRef.current = stream;
    dataChunksRef.current = [];
    const mimeType = getSupportedMimeType();
    mimeTypeRef.current = mimeType;

    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) dataChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(dataChunksRef.current, {
        type: mimeTypeRef.current || "audio/webm",
      });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      stopWaveform();
    };

    // Set up waveform analyser
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    mediaRecorder.start(100); // collect data every 100ms
    setRecorderState("recording");
    setElapsedSeconds(0);

    // Timer
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    // Auto-stop at max duration
    autoStopRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_SECONDS * 1000);

    drawWaveform();
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    stopStream();
    setRecorderState("stopped");
  }

  async function uploadRecording() {
    if (!blobRef.current) return;

    setRecorderState("uploading");
    setError(null);

    const ext = mimeTypeRef.current.includes("mp4") ? "mp4" : "webm";
    const fileName = `voice-memo-${Date.now()}.${ext}`;
    const file = new File([blobRef.current], fileName, {
      type: blobRef.current.type,
    });

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("files", file);
    formData.append(`sourceTypeByFile:${fileName}`, "voice_memo");

    try {
      const response = await fetch("/api/ingest-audio", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Upload failed.");
        setWarnings(data.warnings ?? []);
        setRecorderState("failed");
        return;
      }

      if (data.warnings?.length) setWarnings(data.warnings);
      setResult(data as SonicIngestResult);
      setRecorderState("done");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setRecorderState("failed");
    }
  }

  function onReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setRecorderState("idle");
    setElapsedSeconds(0);
    setError(null);
    setWarnings([]);
    setResult(null);
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "1.5rem",
        padding: "1.5rem",
      }}
    >
      <p
        className="text-xs uppercase tracking-widest text-emerald-200/70 mb-4"
        style={{ letterSpacing: "0.15em" }}
      >
        Voice Direction
      </p>

      {(recorderState === "idle" || recorderState === "recording") && (
        <canvas
          ref={canvasRef}
          width={300}
          height={48}
          style={{
            width: "100%",
            height: "48px",
            borderRadius: "0.5rem",
            background: "rgba(0,0,0,0.2)",
            display: recorderState === "recording" ? "block" : "none",
            marginBottom: "0.75rem",
          }}
        />
      )}

      {recorderState === "idle" && (
        <div className="space-y-3">
          <p className="text-stone-200/60 text-sm">
            Describe the mood of your scene with your voice — hum, speak, or
            vocalize.
          </p>
          <button
            onClick={startRecording}
            style={{
              width: "100%",
              padding: "0.625rem 1rem",
              borderRadius: "9999px",
              background: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(248,113,113,0.25)",
              color: "rgb(254,202,202)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Start Recording
          </button>
        </div>
      )}

      {recorderState === "recording" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                style={{
                  width: "0.5rem",
                  height: "0.5rem",
                  borderRadius: "9999px",
                  background: "rgb(248,113,113)",
                  boxShadow: "0 0 6px rgba(248,113,113,0.8)",
                  animation: "pulse 1s infinite",
                }}
              />
              <span className="text-sm text-stone-100">Recording</span>
            </div>
            <span className="text-sm text-stone-200/60 tabular-nums">
              {formatSeconds(elapsedSeconds)} / {formatSeconds(MAX_RECORDING_SECONDS)}
            </span>
          </div>
          <button
            onClick={stopRecording}
            style={{
              width: "100%",
              padding: "0.625rem 1rem",
              borderRadius: "9999px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.8)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Stop Recording
          </button>
        </div>
      )}

      {recorderState === "stopped" && (
        <div className="space-y-3">
          {previewUrl && (
            <audio
              controls
              src={previewUrl}
              style={{ width: "100%", height: "36px" }}
            />
          )}
          <p className="text-xs text-stone-200/50 tabular-nums">
            Duration: {formatSeconds(elapsedSeconds)}
          </p>
          <div className="flex gap-2">
            <button
              onClick={uploadRecording}
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: "9999px",
                background: "rgba(110,231,183,0.15)",
                border: "1px solid rgba(110,231,183,0.3)",
                color: "rgb(167,243,208)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Index Voice Memo
            </button>
            <button
              onClick={onReset}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "9999px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Re-record
            </button>
          </div>
        </div>
      )}

      {recorderState === "uploading" && (
        <div className="space-y-2">
          <p className="text-sm text-stone-100">Uploading and indexing voice memo…</p>
          <p className="text-xs text-stone-200/50">
            Generating CLAP embedding — this may take a moment if the model is
            cold.
          </p>
        </div>
      )}

      {recorderState === "done" && result && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-300">
            Voice memo indexed — {result.sonicChunkCountAdded} sonic chunk
            {result.sonicChunkCountAdded !== 1 ? "s" : ""} added
          </p>
          <button
            onClick={onReset}
            style={{
              padding: "0.375rem 0.875rem",
              borderRadius: "9999px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            Record another
          </button>
        </div>
      )}

      {error && (
        <div
          className="mt-3 text-xs text-rose-200"
          style={{
            background: "rgba(251,113,133,0.08)",
            border: "1px solid rgba(251,113,133,0.2)",
            borderRadius: "0.75rem",
            padding: "0.75rem",
          }}
        >
          {error}
          {recorderState === "failed" && (
            <button
              onClick={onReset}
              className="block mt-2 text-rose-200/60 hover:text-rose-200 underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          className="mt-3 text-xs text-amber-200/80 space-y-1"
          style={{
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.15)",
            borderRadius: "0.75rem",
            padding: "0.75rem",
          }}
        >
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
