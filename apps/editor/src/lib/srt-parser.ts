import { TextElement } from "@/types/timeline";
import { generateId } from "@/lib/ids";

export interface SRTEntry {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(/[:,]/);
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  const milliseconds = parseInt(parts[3], 10);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function parseSRT(content: string): SRTEntry[] {
  const entries: SRTEntry[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeParts = lines[1].split(" --> ");
    if (timeParts.length !== 2) continue;

    const startTime = parseTimestamp(timeParts[0].trim());
    const endTime = parseTimestamp(timeParts[1].trim());
    const text = lines.slice(2).join("\n");

    entries.push({
      index,
      startTime,
      endTime,
      text,
    });
  }

  return entries.sort((a, b) => a.startTime - b.startTime);
}

export function srtToTextElements(srtEntries: SRTEntry[]): TextElement[] {
  return srtEntries.map((entry) => ({
    id: generateId(),
    type: "text",
    name: `Subtitle ${entry.index}`,
    content: entry.text,
    startTime: entry.startTime,
    duration: entry.endTime - entry.startTime,
    trimStart: 0,
    trimEnd: 0,
    fontSize: 24,
    fontFamily: "Arial",
    color: "#FFFFFF",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    textAlign: "center",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    x: 0,
    y: 150,
    rotation: 0,
    opacity: 1,
  }));
}

export async function readSRTFile(file: File): Promise<SRTEntry[]> {
  const content = await file.text();
  return parseSRT(content);
}