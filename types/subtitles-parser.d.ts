declare module "subtitles-parser" {
  type SubtitleCue = {
    id: string;
    startTime: string | number;
    endTime: string | number;
    text: string;
  };

  const parser: {
    fromSrt(data: string, ms?: boolean): SubtitleCue[];
    toSrt(data: SubtitleCue[]): string;
  };

  export default parser;
}
