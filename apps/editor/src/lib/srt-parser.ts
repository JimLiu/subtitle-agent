import { parseSync } from "subtitle";
import { CreateTimelineElement } from "@/types/timeline";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";

export interface ParsedSubtitle {
  id: string;
  start: number; // seconds
  end: number; // seconds  
  text: string;
}

export function parseSrtFile(file: File): Promise<ParsedSubtitle[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = parseSync(content);

        const cues = parsed.filter(entry => entry.type === 'cue');

        const subtitles: ParsedSubtitle[] = cues.map((entry, index) => ({
          id: `${index}` || String(Math.random()),
          start: entry.data.start / 1000, // Convert ms to seconds
          end: entry.data.end / 1000,
          text: entry.data.text || ""
        }));
        
        resolve(subtitles);
      } catch (error) {
        reject(new Error(`Failed to parse SRT file: ${error instanceof Error ? error.message : "Unknown error"}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read SRT file"));
    };
    
    reader.readAsText(file);
  });
}

export function convertSubtitlesToTimelineElements(subtitles: ParsedSubtitle[]): CreateTimelineElement[] {
  return subtitles.map((subtitle) => ({
    type: "text" as const,
    name: `Subtitle ${subtitle.id}`,
    content: subtitle.text,
    duration: subtitle.end - subtitle.start,
    startTime: subtitle.start,
    trimStart: 0,
    trimEnd: 0,
    fontSize: DEFAULT_TEXT_ELEMENT.fontSize,
    fontFamily: DEFAULT_TEXT_ELEMENT.fontFamily,
    color: DEFAULT_TEXT_ELEMENT.color,
    backgroundColor: DEFAULT_TEXT_ELEMENT.backgroundColor,
    textAlign: DEFAULT_TEXT_ELEMENT.textAlign,
    fontWeight: DEFAULT_TEXT_ELEMENT.fontWeight,
    fontStyle: DEFAULT_TEXT_ELEMENT.fontStyle,
    textDecoration: DEFAULT_TEXT_ELEMENT.textDecoration,
    x: DEFAULT_TEXT_ELEMENT.x,
    y: DEFAULT_TEXT_ELEMENT.y + 200, // Position subtitles lower on screen
    rotation: DEFAULT_TEXT_ELEMENT.rotation,
    opacity: DEFAULT_TEXT_ELEMENT.opacity,
  }));
}