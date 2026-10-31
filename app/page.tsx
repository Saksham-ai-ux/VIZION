"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Brain,
  Maximize2,
  Image as ImageIcon,
  Radio,
  X,
  Sparkles,
  RotateCcw,
  Tags,
  LoaderCircle,
} from "lucide-react";

import VoiceConsole from "./components/VoiceConsole";
import GestureCamera from "./components/GestureCamera";

type Annotation = {
  label: string;
  description: string;
  x: number;
  y: number;
};

type ProjectionData = {
  keyword: string;
  imageUrl: string | null;
  isRelevant: boolean;
  imageAttribution: {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
  } | null;
  annotations: Annotation[];
};

type ProjectionView = {
  zoom: number;
  pan: {
    x: number;
    y: number;
  };
};

export default function Home() {
  const [sessionActive, setSessionActive] = useState(false);

  const [projection, setProjection] = useState<ProjectionData | null>(null);
  const [lastProjection, setLastProjection] =
    useState<ProjectionData | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [annotationError, setAnnotationError] = useState("");

  const [lastProjectionView, setLastProjectionView] =
    useState<ProjectionView>({
      zoom: 1,
      pan: { x: 0, y: 0 },
    });

  const projectionRef = useRef<HTMLDivElement>(null);

  // Generate annotations without blocking the initial projection.
  const handleAnalysis = async (data: {
    keyword: string;
    imageUrl: string | null;
    isRelevant: boolean;
    imageAttribution: ProjectionData["imageAttribution"];
  }) => {
    if (!data.imageUrl) return;

    const newProjection: ProjectionData = {
      ...data,
      annotations: [],
    };

    setProjection(newProjection);
    setLastProjection(newProjection);

    setZoom(1);
    setPan({ x: 0, y: 0 });
    setAnnotationsVisible(true);
    setAnnotationError("");
    setAnnotationLoading(true);

    try {
      const response = await fetch("/api/annotate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: data.imageUrl,
          keyword: data.keyword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Annotation generation failed."
        );
      }

      const annotations: Annotation[] = Array.isArray(
        result.annotations
      )
        ? result.annotations
        : [];

      setProjection((current) =>
        current?.imageUrl === data.imageUrl
          ? { ...current, annotations }
          : current
      );

      setLastProjection((current) =>
        current?.imageUrl === data.imageUrl
          ? { ...current, annotations }
          : current
      );
    } catch (error) {
      console.error("Annotation request failed:", error);
      setAnnotationError(
        error instanceof Error
          ? error.message
          : "Could not generate annotations."
      );
    } finally {
      setAnnotationLoading(false);
    }
  };

  const handleZoom = (newZoom: number) => {
    setZoom(Math.max(1, Math.min(2.5, newZoom)));
  };

  const handlePan = (deltaX: number, deltaY: number) => {
    setPan((current) => ({
      x: Math.max(-500, Math.min(500, current.x + deltaX)),
      y: Math.max(-350, Math.min(350, current.y + deltaY)),
    }));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Dismiss but preserve the visual and its annotations.
  const handleDismiss = () => {
    if (projection) {
      setLastProjection(projection);
      setLastProjectionView({
        zoom,
        pan: { ...pan },
      });
    }

    setProjection(null);
  };

  // Recall the previous visual with its annotations and position.
  const handleRecall = () => {
    if (!lastProjection?.imageUrl) return;

    setProjection(lastProjection);
    setZoom(lastProjectionView.zoom);
    setPan({ ...lastProjectionView.pan });
    setAnnotationsVisible(true);
    setAnnotationError("");
  };

  const clearProjection = () => {
    handleDismiss();
  };

  const toggleFullscreen = async () => {
    if (!projectionRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await projectionRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  };

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="flex min-h-screen">

        {/* SIDEBAR */}
        <aside className="hidden w-20 flex-col items-center border-r border-white/10 bg-[#091525] py-8 md:flex">
          <div className="mb-12 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400 text-black">
            <Brain size={26} />
          </div>

          <div className="flex flex-col gap-8 text-slate-500">
            <Activity size={22} className="text-cyan-400" />
            <Radio size={22} />
            <ImageIcon size={22} />
          </div>

          <div className="mt-auto text-xs font-bold tracking-widest text-cyan-400">
            VZ
          </div>
        </aside>

        {/* MAIN DASHBOARD */}
        <div className="flex-1 p-5 md:p-8">

          {/* HEADER */}
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">
                  VIZION
                </h1>

                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
                  AI CLASSROOM
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-400">
                Intelligent visual learning, powered by AI.
              </p>
            </div>

            <button
              onClick={() => setSessionActive(!sessionActive)}
              className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${
                sessionActive
                  ? "border border-red-400/30 bg-red-500/15 text-red-300"
                  : "bg-cyan-400 text-black hover:bg-cyan-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  sessionActive ? "bg-red-400" : "bg-black"
                }`}
              />

              {sessionActive ? "End Session" : "Start Session"}
            </button>
          </header>

          {/* STATUS CARDS */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatusCard
              icon={<Activity size={19} />}
              title="AI Engine"
              value="Ready"
              color="text-emerald-400"
            />

            <StatusCard
              icon={<Radio size={19} />}
              title="Voice Recognition"
              value="Browser Speech API"
              color="text-cyan-400"
            />

            <StatusCard
              icon={<Sparkles size={19} />}
              title="Visual Intelligence"
              value="Groq + Unsplash + Vision"
              color="text-purple-400"
            />
          </div>

          {/* MAIN CONTENT */}
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">

            {/* PROJECTION PANEL */}
            <section className="min-w-0 rounded-2xl border border-white/10 bg-[#0c1b2d] p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    Interactive Projection
                  </h2>

                  <p className="mt-1 text-xs text-slate-400">
                    Explore educational diagrams with AI-powered annotations.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {projection?.imageUrl && (
                    <>
                      <span className="rounded-full bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-300">
                        {Math.round(zoom * 100)}%
                      </span>

                      <button
                        onClick={() =>
                          setAnnotationsVisible((visible) => !visible)
                        }
                        title="Toggle annotations"
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                          annotationsVisible
                            ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                            : "border-white/10 text-slate-400 hover:bg-white/10"
                        }`}
                      >
                        <Tags size={15} />
                        Labels
                      </button>

                      <button
                        onClick={clearProjection}
                        title="Dismiss visual"
                        className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                      >
                        <X size={17} />
                      </button>

                      <button
                        onClick={toggleFullscreen}
                        title="Fullscreen"
                        className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                      >
                        <Maximize2 size={17} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* PROJECTION CANVAS */}
              <div
                ref={projectionRef}
                className="relative flex h-[430px] items-center justify-center overflow-hidden rounded-xl border border-cyan-400/10 bg-[#050c16]"
              >
                {projection?.imageUrl ? (
                  <>
                    {/* Image and annotation overlay share the same transform. */}
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: "center center",
                        transition: "transform 50ms linear",
                      }}
                    >
                      <img
                        src={projection.imageUrl}
                        alt={projection.keyword}
                        draggable={false}
                        className="absolute inset-0 h-full w-full select-none object-contain p-3"
                      />

                      {annotationsVisible &&
                        projection.annotations.length > 0 && (
                          <svg
                            viewBox="0 0 100 100"
                            preserveAspectRatio="xMidYMid meet"
                            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                          >
                            {projection.annotations.map((item, index) => {
                              const labelX =
                                item.x > 65
                                  ? item.x - 3
                                  : item.x + 3;

                              const anchor =
                                item.x > 65 ? "end" : "start";

                              return (
                                <g key={`${item.label}-${index}`}>
                                  <title>
                                    {item.label}: {item.description}
                                  </title>

                                  <circle
                                    cx={item.x}
                                    cy={item.y}
                                    r="2.1"
                                    fill="#22d3ee"
                                    stroke="#082f49"
                                    strokeWidth="0.8"
                                  />

                                  <circle
                                    cx={item.x}
                                    cy={item.y}
                                    r="4"
                                    fill="none"
                                    stroke="#22d3ee"
                                    strokeWidth="0.45"
                                    opacity="0.8"
                                  />

                                  <line
                                    x1={item.x}
                                    y1={item.y}
                                    x2={labelX}
                                    y2={Math.max(5, item.y - 5)}
                                    stroke="#22d3ee"
                                    strokeWidth="0.35"
                                    opacity="0.9"
                                  />

                                  <text
                                    x={labelX}
                                    y={Math.max(4, item.y - 6)}
                                    textAnchor={anchor}
                                    fontSize="3.2"
                                    fontWeight="700"
                                    fill="#67e8f9"
                                    stroke="#020617"
                                    strokeWidth="0.9"
                                    paintOrder="stroke"
                                  >
                                    {item.label.length > 25
                                      ? `${item.label.slice(0, 23)}…`
                                      : item.label}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        )}
                    </div>

                    {/* IMAGE INFORMATION */}
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-black/90 to-transparent p-5 pt-12">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-cyan-300">
                          AI Visual Result
                        </p>

                        <h3 className="mt-1 text-xl font-bold">
                          {projection.keyword}
                        </h3>

                        {projection.annotations.length > 0 && (
                          <p className="mt-1 text-xs text-cyan-200/80">
                            {projection.annotations.length} AI annotations
                          </p>
                        )}
                      </div>

                      {projection.imageAttribution && (
                        <a
                          href={projection.imageAttribution.unsplashUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="pointer-events-auto text-xs text-slate-300 hover:text-cyan-300"
                        >
                          Photo by{" "}
                          {projection.imageAttribution.photographerName}
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="px-6 text-center">
                    <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-400/20 bg-cyan-400/5">
                      {lastProjection?.imageUrl ? (
                        <RotateCcw size={35} className="text-yellow-300" />
                      ) : (
                        <ImageIcon size={35} className="text-cyan-300" />
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-slate-200">
                      {lastProjection?.imageUrl
                        ? "Visual Dismissed"
                        : "Projection Canvas"}
                    </h3>

                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                      {lastProjection?.imageUrl
                        ? "Your previous visual and annotations are saved. Clap or join both hands to restore."
                        : "Speak about a topic. VIZION will find a relevant visual and annotate its important components."}
                    </p>

                    {lastProjection?.imageUrl && (
                      <button
                        onClick={handleRecall}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-cyan-300"
                      >
                        <RotateCcw size={16} />
                        Restore Previous Visual
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ANNOTATION STATUS */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  {annotationLoading && projection?.imageUrl && (
                    <>
                      <LoaderCircle
                        size={14}
                        className="animate-spin text-cyan-300"
                      />
                      <span>AI is identifying diagram components...</span>
                    </>
                  )}

                  {!annotationLoading &&
                    projection?.imageUrl &&
                    projection.annotations.length > 0 && (
                      <span className="text-emerald-300">
                        <Tags size={13} className="mr-1 inline" />
                        AI annotations ready
                      </span>
                    )}

                  {!annotationLoading &&
                    projection?.imageUrl &&
                    projection.annotations.length === 0 &&
                    !annotationError && (
                      <span className="text-slate-500">
                        Waiting for annotations...
                      </span>
                    )}

                  {annotationError && (
                    <span className="text-amber-300">
                      Annotation unavailable: {annotationError}
                    </span>
                  )}
                </div>

                <span className="text-slate-500">
                  Pinch: Move + Zoom · Fist: Reset · Palm: Dismiss · Clap: Recall
                </span>
              </div>
            </section>

            {/* RIGHT PANEL */}
            <div className="flex min-w-0 flex-col gap-6">

              {/* GESTURE CAMERA */}
              <section className="rounded-2xl border border-white/10 bg-[#0c1b2d] p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">
                    Gesture Recognition
                  </h2>

                  <p className="mt-1 text-xs text-slate-400">
                    Control your projection using hand movements.
                  </p>
                </div>

                <GestureCamera
                  onZoom={handleZoom}
                  onPan={handlePan}
                  onReset={handleReset}
                  onDismiss={handleDismiss}
                  onRecall={handleRecall}
                />
              </section>

              {/* VOICE CONSOLE */}
              <section className="rounded-2xl border border-white/10 bg-[#0c1b2d] p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">
                    Voice Intelligence
                  </h2>

                  <p className="mt-1 text-xs text-slate-400">
                    Speak naturally. VIZION finds the visual and annotates it.
                  </p>
                </div>

                <VoiceConsole onAnalysis={handleAnalysis} />
              </section>

              {/* ANNOTATION LEGEND */}
              <section className="rounded-2xl border border-white/10 bg-[#0c1b2d] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Tags size={18} className="text-cyan-300" />
                  <h2 className="text-sm font-semibold">
                    Smart Annotation Engine
                  </h2>
                </div>

                <p className="text-xs leading-6 text-slate-400">
                  Groq Vision analyzes the projected image, identifies
                  visible components and places explanatory labels over
                  the diagram. Toggle labels from the projection panel.
                </p>

                <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Annotation engine available
                </div>
              </section>
            </div>
          </div>

          {/* FOOTER */}
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500">
            <span>VIZION · Intelligent Classroom Assistant</span>
            <span>Built for GRAVITON Hackathon 2026</span>
          </footer>
        </div>
      </div>
    </main>
  );
}

function StatusCard({
  icon,
  title,
  value,
  color,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1b2d] p-4">
      <div className="flex items-center gap-3">
        <div className={color}>{icon}</div>

        <div>
          <p className="text-xs text-slate-500">{title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}