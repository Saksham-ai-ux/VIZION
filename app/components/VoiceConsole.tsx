
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  AudioLines,
  Trash2,
  BrainCircuit,
  Image as ImageIcon,
  LoaderCircle,
  ExternalLink,
} from "lucide-react";

type SpeechResult = {
  isFinal: boolean;
  [index: number]: { transcript: string };
};

type SpeechEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionConstructor = new () => Recognition;

type Analysis = {
  keyword: string;
  imageUrl: string | null;
  isRelevant: boolean;
  imageAttribution: {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
  } | null;
};

type VoiceConsoleProps = {
  onAnalysis: (data: Analysis) => void;
};

export default function VoiceConsole({
  onAnalysis,
}: VoiceConsoleProps) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState("Microphone ready");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const recognitionRef = useRef<Recognition | null>(null);
  const listeningRef = useRef(false);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  // PHASE 3: TRANSCRIPT BATCHING
  const pendingTranscriptRef = useRef("");
  const debounceTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  // GROQ + UNSPLASH API CONNECTION
  const analyzeSpeech = async (spokenText: string) => {
    if (!spokenText.trim()) return;

    const requestId = ++requestIdRef.current;

    setAnalyzing(true);
    setAnalysisError("");

    try {
      const response = await fetch("/api/analyze-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: spokenText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed.");
      }

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      const result = data as Analysis;

      // Update voice console
      setAnalysis(result);

      // SEND RESULT TO MAIN PROJECTION CANVAS
      onAnalysis(result);

      setStatus(
        result.isRelevant
          ? "Concept identified · Visual retrieved"
          : "No educational concept detected"
      );
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      if (
        mountedRef.current &&
        requestId === requestIdRef.current
      ) {
        setAnalyzing(false);
      }
    }
  };

  // PHASE 3: FLUSH PENDING TRANSCRIPT
  const flushPendingTranscript = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const textToAnalyze = pendingTranscriptRef.current.trim();
    pendingTranscriptRef.current = "";

    if (textToAnalyze) {
      analyzeSpeech(textToAnalyze);
    }
  };

  // PHASE 3: BATCH SPEECH EVERY 3 SECONDS
  const queueSpeechForAnalysis = (spokenText: string) => {
    pendingTranscriptRef.current = [
      pendingTranscriptRef.current,
      spokenText,
    ]
      .filter(Boolean)
      .join(" ");

    // Keep the existing timer instead of creating
    // a new API request for every speech result.
    if (debounceTimerRef.current) return;

    debounceTimerRef.current = setTimeout(() => {
      flushPendingTranscript();
    }, 3000);
  };

  // SPEECH RECOGNITION
  useEffect(() => {
    mountedRef.current = true;

    const browserWindow = window as unknown as {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };

    const SpeechAPI =
      browserWindow.SpeechRecognition ||
      browserWindow.webkitSpeechRecognition;

    if (!SpeechAPI) {
      setSupported(false);
      setStatus("Speech recognition is not supported. Use Chrome.");
      return;
    }

    const recognition = new SpeechAPI();

    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      if (!mountedRef.current) return;

      setListening(true);
      setStatus("Microphone active");
    };

    recognition.onresult = (event: SpeechEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const spokenText = result[0]?.transcript || "";

        if (result.isFinal) {
          finalText += spokenText;
        } else {
          interimText += spokenText;
        }
      }

      if (!mountedRef.current) return;

      if (finalText.trim()) {
        setTranscript((previous) =>
          `${previous} ${finalText}`.trim()
        );

        // PHASE 3: QUEUE FINAL SPEECH FOR ANALYSIS
        queueSpeechForAnalysis(finalText.trim());
      }

      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      if (!mountedRef.current) return;

      if (event.error === "not-allowed") {
        listeningRef.current = false;
        setListening(false);
        setStatus("Microphone permission denied");
      } else if (event.error === "no-speech") {
        setStatus("No speech detected. Keep speaking.");
      } else {
        setStatus(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;

      listeningRef.current = false;
      setListening(false);

      setStatus((previous) =>
        previous === "Microphone active"
          ? "Microphone stopped"
          : previous
      );
    };

    recognitionRef.current = recognition;

    return () => {
      mountedRef.current = false;
      listeningRef.current = false;
      requestIdRef.current++;

      // Clear pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      pendingTranscriptRef.current = "";

      recognition.onresult = null;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;

      try {
        recognition.abort();
      } catch {}

      recognitionRef.current = null;
    };
  }, []);

  // START MICROPHONE
  const startListening = () => {
    const recognition = recognitionRef.current;

    if (!recognition || listeningRef.current) return;

    try {
      listeningRef.current = true;
      setInterim("");
      setStatus("Starting microphone...");
      recognition.start();
    } catch {
      listeningRef.current = false;
      setListening(false);
      setStatus("Could not start microphone. Try again.");
    }
  };

  // STOP MICROPHONE
  const stopListening = () => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);

    // Send any remaining speech immediately
    flushPendingTranscript();

    setStatus("Microphone stopped");
  };

  // CLEAR TRANSCRIPT
  const clearTranscript = () => {
    requestIdRef.current++;

    // Cancel pending API request timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    pendingTranscriptRef.current = "";

    setTranscript("");
    setInterim("");
    setAnalysis(null);
    setAnalyzing(false);
    setAnalysisError("");
    setStatus("Transcript cleared");
  };

  return (
    <div className="glass-panel flex-1 rounded-2xl p-5">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Voice Console</p>
          <p className="mt-1 text-xs text-slate-500">
            Speech recognition + Groq intelligence
          </p>
        </div>

        <AudioLines
          size={20}
          className={
            listening
              ? "animate-pulse text-cyan-300"
              : "text-slate-500"
          }
        />
      </div>

      {/* LIVE TRANSCRIPT */}
      <div className="mt-5 rounded-xl border border-white/[0.06] bg-[#070d18] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] tracking-[0.2em] text-slate-600">
            LIVE TRANSCRIPT
          </p>

          <span
            className={`text-[10px] ${
              listening ? "text-emerald-400" : "text-slate-500"
            }`}
          >
            {listening ? "LISTENING" : "STANDBY"}
          </span>
        </div>

        <div className="mt-4 min-h-[90px] text-sm leading-7 text-slate-200">
          {transcript || (
            <span className="text-slate-600">
              Your recognized speech will appear here...
            </span>
          )}

          {interim && (
            <span className="text-cyan-300"> {interim}</span>
          )}
        </div>
      </div>

      {/* MICROPHONE CONTROLS */}
      <div className="mt-4 flex flex-wrap gap-2">
        {!listening ? (
          <button
            disabled={!supported}
            onClick={startListening}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40"
          >
            <Mic size={16} />
            Start listening
          </button>
        ) : (
          <button
            onClick={stopListening}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400"
          >
            <MicOff size={16} />
            Stop listening
          </button>
        )}

        <button
          onClick={clearTranscript}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-3 text-xs text-slate-400 hover:text-white"
        >
          <Trash2 size={15} />
          Clear
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {status}
      </p>

      {/* AI ANALYSIS */}
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <BrainCircuit size={17} className="text-cyan-300" />

          <p className="text-xs font-semibold tracking-wider text-slate-300">
            GROQ + UNSPLASH ANALYSIS
          </p>
        </div>

        {analyzing && (
          <div className="flex items-center gap-2 text-sm text-cyan-300">
            <LoaderCircle size={16} className="animate-spin" />
            Identifying concept and retrieving visual...
          </div>
        )}

        {analysisError && (
          <p className="text-xs text-red-400">
            {analysisError}
          </p>
        )}

        {analysis && (
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
            <p className="text-[10px] tracking-widest text-cyan-300">
              IDENTIFIED CONCEPT
            </p>

            {analysis.isRelevant && analysis.keyword ? (
              <>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  {analysis.keyword}
                </h3>

                {analysis.imageUrl ? (
                  <div className="mt-4 overflow-hidden rounded-xl">
                    <img
                      src={analysis.imageUrl}
                      alt={analysis.keyword}
                      className="h-48 w-full object-cover"
                    />

                    <div className="flex flex-wrap items-center gap-2 bg-black/30 p-3">
                      <ImageIcon
                        size={14}
                        className="text-cyan-300"
                      />

                      <span className="text-[10px] text-slate-300">
                        Unsplash visual
                      </span>

                      {analysis.imageAttribution && (
                        <a
                          href={analysis.imageAttribution.unsplashUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto flex items-center gap-1 text-[10px] text-cyan-300 underline"
                        >
                          Photo by{" "}
                          {analysis.imageAttribution.photographerName}
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-amber-300">
                    Concept identified, but no matching image was found.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                No educational concept detected. Keep teaching!
              </p>
            )}
          </div>
        )}

        {!analysis && !analyzing && !analysisError && (
          <p className="text-xs text-slate-600">
            Speak an educational concept to see its visual here.
          </p>
        )}
      </div>
    </div>
  );
}
