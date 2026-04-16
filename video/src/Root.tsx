import React from "react";
import { Composition } from "remotion";
import { Underscore } from "./Underscore";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Underscore"
      component={Underscore}
      durationInFrames={1800}
      fps={45}
      width={1920}
      height={1080}
    />
  );
};
