import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { TextReveal } from "./TextReveal";

const BG = "#050807";
const EMERALD = "#6ee7b7";
const DIM = "rgba(214,211,209,0.55)";

interface TitleCardProps {
  headline: string;
  subline?: string;
  label?: string;
  isHero?: boolean; // bigger, centered
  fadeOutStart?: number;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  headline,
  subline,
  label,
  isHero = false,
  fadeOutStart,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeOut =
    fadeOutStart !== undefined
      ? interpolate(frame, [fadeOutStart, fadeOutStart + 15], [1, 0], {
          extrapolateRight: "clamp",
        })
      : 1;

  const labelProgress = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: isHero ? "center" : "flex-start",
        padding: isHero ? "0 120px" : "0 120px",
        opacity: fadeOut,
      }}
    >
      {label && (
        <div
          style={{
            opacity: labelProgress,
            transform: `translateY(${(1 - labelProgress) * 12}px)`,
            fontSize: 18,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: EMERALD,
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 500,
            marginBottom: 28,
          }}
        >
          {label}
        </div>
      )}

      <TextReveal
        text={headline}
        fontSize={isHero ? 96 : 72}
        fontWeight={700}
        color="#fafaf9"
        letterSpacing="-0.04em"
        textAlign={isHero ? "center" : "left"}
        staggerFrames={3}
        startFrom={label ? 5 : 0}
        style={{ maxWidth: 1200 }}
      />

      {subline && (
        <div
          style={{
            marginTop: 32,
            opacity: interpolate(
              frame,
              [20, 45],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
            fontSize: 28,
            color: DIM,
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            maxWidth: 860,
            lineHeight: 1.5,
          }}
        >
          {subline}
        </div>
      )}
    </AbsoluteFill>
  );
};
