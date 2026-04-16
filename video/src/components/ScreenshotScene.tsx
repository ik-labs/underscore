import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const BG = "#050807";
const EMERALD = "#6ee7b7";

interface ScreenshotSceneProps {
  src: string;
  caption: string;
  label?: string;
}

export const ScreenshotScene: React.FC<ScreenshotSceneProps> = ({
  src,
  caption,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Ken Burns: subtle zoom out from 1.06 → 1.00
  const scale = interpolate(frame, [0, 180], [1.06, 1.0], {
    extrapolateRight: "clamp",
  });

  // Screenshot fades in
  const imgOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Caption slides up
  const captionProgress = spring({
    frame: frame - 10,
    fps,
    config: { damping: 22, stiffness: 100 },
  });

  const labelProgress = spring({
    frame: frame - 5,
    fps,
    config: { damping: 20, stiffness: 90 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Screenshot */}
      <AbsoluteFill
        style={{
          opacity: imgOpacity,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top center",
          }}
        />
      </AbsoluteFill>

      {/* Bottom gradient overlay */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(5,8,7,0.95) 0%, rgba(5,8,7,0.6) 28%, transparent 55%)",
        }}
      />

      {/* Label chip */}
      {label && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 72,
            opacity: labelProgress,
            transform: `translateY(${(1 - labelProgress) * -8}px)`,
            fontSize: 14,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: EMERALD,
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 600,
            background: "rgba(5,8,7,0.7)",
            padding: "6px 16px",
            borderRadius: 100,
            border: "1px solid rgba(110,231,183,0.3)",
          }}
        >
          {label}
        </div>
      )}

      {/* Caption */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 72,
          right: 72,
          opacity: captionProgress,
          transform: `translateY(${(1 - captionProgress) * 20}px)`,
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 600,
            color: "#fafaf9",
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            maxWidth: 900,
          }}
        >
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};
