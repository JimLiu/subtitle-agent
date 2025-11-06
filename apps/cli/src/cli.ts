import dotenv from "dotenv";
import path from "node:path";
import { transcribe } from "./tools/transcribe";


dotenv.config();


const input = "/Volumes/Extreme SSD/Downie/The rise of Cursor꞉ The $300M ARR AI tool that engineers can’t stop using  Michael Truell.mp4";

async function main() {
  const { whisperOutputFile } = await getFilePaths(input);
  console.log("Transcribing with WhisperKit...");
  const whisperResult = await transcribe(input, whisperOutputFile);
  console.log("Transcription completed:", whisperResult);
}


const getFilePaths = async (inputFile: string) => {
  const extension = path.extname(inputFile);
  const filename = path.basename(inputFile, extension);
  const outputDir = path.join("./output", filename);
  const whisperOutputFile = path.join(outputDir, "whisper.json");
  const subtitleFile = path.join(outputDir, "subtitle.json");
  return { outputDir, whisperOutputFile, subtitleFile };
};

main().catch((error) => {
  console.error("Error in CLI:", error);
  process.exit(1);
});