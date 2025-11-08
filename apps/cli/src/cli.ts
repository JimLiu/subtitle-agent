import dotenv from "dotenv";
import path from "node:path";
import { generateId } from "@subtitle-agent/core";
import type { Subtitle } from "@subtitle-agent/core";
import { polish } from "./tools/polish";
import type { ParagraphBuilderDraft } from "./tools/polish";
import { transcribe } from "./tools/transcribe";
import { readJSON, writeJSON } from "./utils/file";


dotenv.config();


// const input = "/Volumes/Extreme SSD/Downie/The rise of Cursor꞉ The $300M ARR AI tool that engineers can’t stop using  Michael Truell.mp4";
// const input = "/Users/jimliu/Downloads/1 video.mp4";
const input = "/Users/jimliu/Downloads/大白话聊"+"ChatGPT（Sarah & 王建硕）.mp3";

async function main() {
  const { whisperOutputFile, subtitleFile, paragraphsDraftFile } =
    await getFilePaths(input);
  console.log("Transcribing with WhisperKit...");
  const whisperResult = await transcribe(input, whisperOutputFile);
  console.log("Transcription completed.");

  const existingDraft = await readJSON<ParagraphBuilderDraft>(
    paragraphsDraftFile
  );

  const draft: ParagraphBuilderDraft = existingDraft
    ? {
        ...existingDraft,
        segments: whisperResult.segments,
      }
    : {
        segments: whisperResult.segments,
      };

  console.log("Polishing transcription into paragraphs...");
  const polishedDraft = await polish(draft, async (currentDraft) => {
    console.log("Saving draft to", paragraphsDraftFile);
    await writeJSON(paragraphsDraftFile, currentDraft);
  });

  await writeJSON(paragraphsDraftFile, polishedDraft);

  const subtitle: Subtitle = {
    id: generateId(),
    title: path.basename(whisperResult.filename, path.extname(whisperResult.filename)),
    filename: whisperResult.filename,
    language: whisperResult.language ?? "unknown",
    speakers: whisperResult.speakers,
    paragraphs: polishedDraft.paragraphs ?? [],
  };

  await writeJSON(subtitleFile, subtitle);
  console.log(`Subtitle saved to ${subtitleFile}`);
}


const getFilePaths = async (inputFile: string) => {
  const extension = path.extname(inputFile);
  const filename = path.basename(inputFile, extension);
  const outputDir = path.join("./output", filename);
  const whisperOutputFile = path.join(outputDir, "whisper.json");
  const subtitleFile = path.join(outputDir, "subtitle.json");
  const paragraphsDraftFile = path.join(outputDir, "paragraphs-draft.json");

  return { outputDir, whisperOutputFile, subtitleFile, paragraphsDraftFile };
};

main().catch((error) => {
  console.error("Error in CLI:", error);
  process.exit(1);
});
