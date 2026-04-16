import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { TitleCard } from "./components/TitleCard";
import { ScreenshotScene } from "./components/ScreenshotScene";
import { TextReveal } from "./components/TextReveal";
import bgMusic from "./assets/bg-music.mp3";

import scLanding from "./assets/sc-landing.png";
import scCorpus from "./assets/sc-corpus.png";
import scWorkspace from "./assets/sc-workspace.png";
import scResults from "./assets/sc-results.png";

const BG = "#050807";
const EMERALD = "#6ee7b7";
const DIM = "rgba(214,211,209,0.55)";

// ── Hero reveal scene (UNDERSCORE branding) ──────────────────────────────────

const HeroReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineWidth = interpolate(frame, [30, 80], [0, 420], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subtitleProgress = spring({
    frame: frame - 50,
    fps,
    config: { damping: 20, stiffness: 90 },
  });

  const labelProgress = spring({
    frame: frame - 80,
    fps,
    config: { damping: 20, stiffness: 90 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 120px",
      }}
    >
      {/* UNDERSCORE wordmark */}
      <TextReveal
        text="UNDERSCORE"
        fontSize={108}
        fontWeight={800}
        letterSpacing="-0.05em"
        color="#fafaf9"
        staggerFrames={4}
        startFrom={0}
      />

      {/* Emerald underline sweep */}
      <div
        style={{
          width: lineWidth,
          height: 4,
          backgroundColor: EMERALD,
          borderRadius: 2,
          marginTop: 20,
        }}
      />

      {/* Tagline */}
      <div
        style={{
          marginTop: 40,
          opacity: subtitleProgress,
          transform: `translateY(${(1 - subtitleProgress) * 16}px)`,
          fontSize: 36,
          fontWeight: 500,
          color: DIM,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        Your corpus. Your score.
      </div>

      {/* Sub-label */}
      <div
        style={{
          marginTop: 16,
          opacity: labelProgress,
          transform: `translateY(${(1 - labelProgress) * 12}px)`,
          fontSize: 22,
          fontWeight: 400,
          color: "rgba(214,211,209,0.35)",
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          letterSpacing: "0",
        }}
      >
        Upload your creative materials. Underscore reads them all.
      </div>
    </AbsoluteFill>
  );
};

// ── CTA scene ─────────────────────────────────────────────────────────────────

const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const line2Progress = spring({
    frame: frame - 25,
    fps,
    config: { damping: 18, stiffness: 110 },
  });

  const urlProgress = spring({
    frame: frame - 55,
    fps,
    config: { damping: 20, stiffness: 90 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 120px",
      }}
    >
      <TextReveal
        text="Your film has a voice."
        fontSize={80}
        fontWeight={700}
        letterSpacing="-0.04em"
        color="#fafaf9"
        staggerFrames={3}
        textAlign="center"
        style={{ justifyContent: "center" }}
      />

      <div
        style={{
          marginTop: 24,
          opacity: line2Progress,
          transform: `translateY(${(1 - line2Progress) * 16}px)`,
          fontSize: 80,
          fontWeight: 700,
          color: EMERALD,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          letterSpacing: "-0.04em",
          textAlign: "center",
        }}
      >
        Now give it a score.
      </div>

      <div
        style={{
          marginTop: 48,
          opacity: urlProgress,
          fontSize: 22,
          color: "rgba(110,231,183,0.6)",
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          letterSpacing: "0.05em",
          textTransform: "lowercase",
        }}
      >
        underscore-film.vercel.app
      </div>
    </AbsoluteFill>
  );
};

// ── Main composition ──────────────────────────────────────────────────────────

export const Underscore: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Background music — 40s track covers the full 40s video, fade out last 1.5s */}
      <Audio
        src={bgMusic}
        volume={(f) =>
          interpolate(f, [1732, 1800], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Act 1 — Problem */}
      <Sequence from={0} durationInFrames={150}>
        <TitleCard
          headline="Every filmmaker has a vision for how their film should sound."
          fadeOutStart={130}
        />
      </Sequence>

      <Sequence from={140} durationInFrames={165}>
        <TitleCard
          headline="But scoring a film means describing that vision to a stranger."
          fadeOutStart={148}
        />
      </Sequence>

      <Sequence from={275} durationInFrames={165}>
        <TitleCard
          headline="Generic music knows nothing about your story."
          fadeOutStart={152}
        />
      </Sequence>

      {/* Act 2 — Solution reveal */}
      <Sequence from={420} durationInFrames={300}>
        <HeroReveal />
      </Sequence>

      {/* Act 3 — Product demo (6 screenshot scenes × ~150 frames each) */}
      <Sequence from={700} durationInFrames={165}>
        <ScreenshotScene
          src={scLanding}
          label="Step 1"
          caption="Upload scripts, director notes, subtitles, moodboards."
        />
      </Sequence>

      <Sequence from={850} durationInFrames={165}>
        <ScreenshotScene
          src={scCorpus}
          label="Step 2"
          caption="Every chunk embedded and indexed — in your own words."
        />
      </Sequence>

      <Sequence from={1000} durationInFrames={165}>
        <ScreenshotScene
          src={scWorkspace}
          label="Step 3"
          caption="Describe a scene. Claude retrieves matching evidence."
        />
      </Sequence>

      <Sequence from={1150} durationInFrames={165}>
        <ScreenshotScene
          src={scWorkspace}
          label="Step 4"
          caption="A cue brief synthesized directly from your corpus."
        />
      </Sequence>

      <Sequence from={1300} durationInFrames={165}>
        <ScreenshotScene
          src={scResults}
          label="Step 5"
          caption="3 score variations. 2 SFX clips. Generated in parallel."
        />
      </Sequence>

      <Sequence from={1450} durationInFrames={165}>
        <ScreenshotScene
          src={scWorkspace}
          label="Step 6"
          caption="Plus a 120-second title track for the whole film."
        />
      </Sequence>

      {/* Act 4 — CTA */}
      <Sequence from={1600} durationInFrames={200}>
        <CtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
