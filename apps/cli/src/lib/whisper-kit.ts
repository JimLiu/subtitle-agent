import { spawn } from "child_process";
import { once } from "events";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { generateId } from "@subtitle-agent/core";
import { TranscriptionOutput } from "@subtitle-agent/core";

export interface WhisperKitOutputType {
  text: string;
  language: string;
  speakers?: Array<{
    id: string;
    name: string;
  }>;
  segments: Array<{
    text: string;
    start: number;
    end: number;
    speakerId?: string;
    words: Array<{
      word: string;
      start: number;
      end: number;
    }>;
  }>;
}

export interface TranscribeOptions {
  force?: boolean;
  extra?: string[];
  binMain?: string; // path to the CLI binary, default: "lib/whisperkit/whisperkit-cli"
  model?: string; // default: "whisper-large-v2"
  modelPath?: string; // path to the model, default: "lib/whisperkit/models"
  prompt?: string;
  language?: string; // default: "en"
  diarize?: boolean; // default: true
  onProgress?: (progress: number) => void;
}

const getTempOutput = () => {
  const tempDir = os.tmpdir();
  return path.join(tempDir, new Date().getTime().toString());
};

export const transcribe = async (
  input: string,
  options?: TranscribeOptions
): Promise<WhisperKitOutputType | undefined> => {
  const {
    force = false,
    extra = [],
    binMain = "bin/whisperkit-cli",
    model = "whisper-large-v3",
    modelPath = "/Volumes/Extreme SSD/Models/",
    prompt,
    language = "auto",
    diarize = true,
    onProgress,
  } = options || {};

  const output = getTempOutput();
  await fs.mkdir(output, { recursive: true });
  const filename = path.basename(input);
  const filenameWithoutExt = path.basename(filename, path.extname(filename));
  const jsonFilename = path.join(output, `${filenameWithoutExt}.json`);

  const args = [
    "transcribe",
    "--audio-path",
    input,
    "--model",
    model,
    "--download-model-path",
    modelPath,
    "--download-tokenizer-path",
    modelPath,
    "--report",
    "--report-path",
    output,
    "--verbose",
    "--concurrent-worker-count",
    "1",
    "--chunking-strategy",
    "none",
    "--skip-special-tokens",
    "--word-timestamps",
    ...extra,
  ];

  if (language && language !== "auto") {
    args.push("--language", language);
  }

  if (prompt) {
    args.push("--prompt", prompt);
  }

  // 如需实现 force 功能，假设 CLI 有类似的参数，如 `--force`，则可在此加入
  if (force) {
    args.push("--force");
  }

  if (diarize) {
    args.push("--diarize");
  }

  const child = spawn(binMain, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  console.log(`Running command: ${binMain} ${args.join(" ")}`);

  // 监听 stdout 与 stderr
  let stdoutData = "";
  let stderrData = "";

  child.stdout.on("data", (data) => {
    const text = data.toString("utf8");
    stdoutData += text;
    // 尝试解析进度条行，典型的行格式类似：
    // [================================================  ] 97% | Elapsed Time: 311.06 s | Remaining: 7.94 sss...
    // 使用正则匹配百分比
    const progressMatch = text.match(/(\d+)%/);
    console.log(progressMatch, text);
    if (progressMatch && onProgress) {
      const p = parseInt(progressMatch[1], 10);
      if (!isNaN(p)) {
        onProgress(p);
      }
    }
  });

  child.stderr.on("data", (data) => {
    const text = data.toString("utf8");
    stderrData += text;
  });

  // 当进程结束时返回
  const [exitCode] = (await once(child, "exit")) as [
    number | null,
    NodeJS.Signals | null,
  ];

  if (exitCode !== 0) {
    const errorMsg = `CLI exited with code ${exitCode}\nStderr:\n${stderrData}\nStdout:\n${stdoutData}`;
    throw new Error(errorMsg);
  }

  console.log("jsonFilename", jsonFilename);
  const exists = await fs
    .access(jsonFilename)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    const output = await fs.readFile(jsonFilename, "utf8");
    console.log("output", output);
    const outputJson = JSON.parse(output) as WhisperKitOutputType;
    return outputJson;
  }

  return undefined;
};

function convertWhisperKitOutputToTranscriberOutput(
  output: WhisperKitOutputType,
  filename: string
): TranscriptionOutput {
  return {
    filename,
    language: output.language,
    text: output.text,
    segments: output.segments.map((segment, index) => ({
      id: generateId(),
      start: segment.start,
      end: segment.end,
      text: segment.text,
      speakerId: segment.speakerId,
      words: segment.words.map((word) => ({
        id: generateId(),
        text: word.word,
        start: word.start,
        end: word.end,
      })),
    })),
    speakers: output.speakers,
  };
}
