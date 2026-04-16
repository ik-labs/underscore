import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";

interface TextRevealProps {
  text: string;
  style?: React.CSSProperties;
  staggerFrames?: number;
  startFrom?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: string | number;
  letterSpacing?: string;
  textAlign?: React.CSSProperties["textAlign"];
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  style,
  staggerFrames = 3,
  startFrom = 0,
  color = "#fafaf9",
  fontSize = 72,
  fontWeight = 700,
  letterSpacing = "-0.03em",
  textAlign = "left",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        textAlign,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const wordFrame = frame - startFrom - i * staggerFrames;
        const progress = spring({
          frame: wordFrame,
          fps,
          config: { damping: 18, stiffness: 120 },
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: progress,
              transform: `translateY(${(1 - progress) * 24}px)`,
              color,
              fontSize,
              fontWeight,
              letterSpacing,
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              lineHeight: 1.15,
              marginRight: "0.28em",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
