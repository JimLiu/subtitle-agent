import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_HIGH,
  QUALITY_VERY_HIGH,
  Input,
  ALL_FORMATS,
  BlobSource,
  AudioBufferSink,
} from 'mediabunny';

import { ExportOptions, ExportResult } from '@/types/export';
import {
  AudioElement,
  MediaElement,
  TimelineElement,
  VideoElement,
} from "@/types/timeline";
import { PreviewExportRuntime } from './export-runtime';
import { getElementEndTime, getElementDuration } from '../deps/element-helpers';

const DEFAULT_FPS = 30;

const qualityMap = {
  low: QUALITY_LOW,
  medium: QUALITY_MEDIUM,
  high: QUALITY_HIGH,
  very_high: QUALITY_VERY_HIGH,
};

interface PreviewExportSettings {
  width: number;
  height: number;
  backgroundColor: string;
  fps?: number;
}

interface PreviewExportRequest {
  elements: TimelineElement[];
  settings: PreviewExportSettings;
  options: ExportOptions;
}

interface AudioElementData {
  buffer: AudioBuffer;
  element: MediaElement;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function resolveVolume(volume?: number): number {
  if (typeof volume !== 'number') {
    return 1;
  }
  return volume > 1 ? volume / 100 : volume;
}

/**
 * 将预览内容导出为 MP4/WebM：
 * - 在隐藏舞台上按时间逐帧渲染画布到 CanvasSource；
 * - 可选混音所有音视频段落为 AudioBufferSource；
 * - 通过 mediabunny 组合为最终视频缓冲区。
 */
export async function exportPreviewVideo(request: PreviewExportRequest): Promise<ExportResult> {
  const { elements, settings, options } = request;
  const { width, height, backgroundColor } = settings;
  const { format, quality, includeAudio, fps: optionsFps, onProgress, onCancel } = options;

  if (typeof window === 'undefined') {
    return { success: false, error: '导出仅在浏览器环境中可用' };
  }

  if (!elements.length) {
    return { success: false, error: '没有可导出的内容' };
  }

  const durationSeconds = computeDurationSeconds(elements);
  if (durationSeconds <= 0) {
    return { success: false, error: '时间线为空' };
  }

  const runtime = new PreviewExportRuntime({
    width,
    height,
    backgroundColor,
    elements,
  });

  let audioBuffer: AudioBuffer | null = null;
  let audioSource: AudioBufferSource | null = null;

  try {
    await runtime.initialize();

    const canvas = runtime.getCanvas();
    const exportFps = optionsFps ?? settings.fps ?? DEFAULT_FPS;
    const totalFrames = Math.ceil(durationSeconds * exportFps);

    const outputFormat = format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
    const output = new Output({
      format: outputFormat,
      target: new BufferTarget(),
    });

    const videoSource = new CanvasSource(canvas, {
      codec: format === 'webm' ? 'vp9' : 'avc',
      bitrate: qualityMap[quality],
    });

    output.addVideoTrack(videoSource, { frameRate: exportFps });

    if (includeAudio) {
      onProgress?.(0.02);
      audioBuffer = await createAudioMixdown(elements, durationSeconds);
      if (audioBuffer) {
        audioSource = new AudioBufferSource({
          codec: format === 'webm' ? 'opus' : 'aac',
          bitrate: qualityMap[quality],
        });
        output.addAudioTrack(audioSource);
      }
    }

    await output.start();

    if (audioSource && audioBuffer) {
      await audioSource.add(audioBuffer);
      audioSource.close();
    }

    let cancelled = false;
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (onCancel?.()) {
        cancelled = true;
        break;
      }

      const timeSeconds = frameIndex / exportFps;
      await runtime.renderFrame(timeSeconds);

      const frameDuration = 1 / exportFps;
      await videoSource.add(timeSeconds, frameDuration);

      const progressBase = includeAudio ? 0.05 : 0;
      const videoProgress = progressBase + (frameIndex / totalFrames) * (1 - progressBase);
      onProgress?.(Math.min(videoProgress, 0.99));
    }

    if (cancelled) {
      await output.cancel();
      return { success: false, cancelled: true };
    }

    videoSource.close();
    await output.finalize();
    onProgress?.(1);

    return {
      success: true,
      buffer: output.target.buffer ?? undefined,
    };
  } catch (error) {
    console.error('Preview export failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '导出失败',
    };
  } finally {
    runtime.destroy();
  }
}

function computeDurationSeconds(elements: TimelineElement[]): number {
  let maxEnd = 0;
  for (const element of elements) {
    maxEnd = Math.max(maxEnd, getElementEndTime(element));
  }
  return maxEnd;
}

function isMediaElement(element: TimelineElement): element is AudioElement | VideoElement {
  return element.type === 'audio' || element.type === 'video';
}

async function createAudioMixdown(elements: TimelineElement[], durationSeconds: number): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const mediaElements = elements.filter(isMediaElement);
  if (!mediaElements.length) {
    return null;
  }

  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextCtor) {
    console.warn('AudioContext is not available; skipping audio export');
    return null;
  }

  const sampleRate = 44100;
  const audioContext = new AudioContextCtor({ sampleRate });

  try {
    const audioElements = await Promise.all(mediaElements.map((element) => loadAudioElement(element, audioContext)));
    const validElements = audioElements.filter((item): item is AudioElementData => Boolean(item));

    if (!validElements.length) {
      return null;
    }

    const outputChannels = 2;
    const outputLength = Math.ceil(durationSeconds * sampleRate);
    const mixBuffer = audioContext.createBuffer(outputChannels, outputLength, sampleRate);

    for (const element of validElements) {
      mixAudioElementIntoBuffer(element, mixBuffer);
    }

    return mixBuffer;
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

async function loadAudioElement(element: MediaElement, audioContext: AudioContext): Promise<AudioElementData | null> {
  const blob = await getElementBlob(element);
  if (!blob) {
    return null;
  }

  const buffer = await decodeAudioBlob(blob, audioContext);
  if (!buffer) {
    console.warn('无法解析音频数据: 不支持的音频格式');
    return null;
  }

  return { buffer, element };
}

async function decodeAudioBlob(blob: Blob, audioContext: AudioContext): Promise<AudioBuffer | null> {
  const nativeBuffer = await decodeWithNativeDecoder(blob, audioContext);
  if (nativeBuffer) {
    return nativeBuffer;
  }
  return decodeWithMediabunny(blob);
}

async function decodeWithNativeDecoder(blob: Blob, audioContext: AudioContext): Promise<AudioBuffer | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } catch (error) {
    console.debug('Native audio decode failed, falling back to mediabunny', error);
    return null;
  }
}

async function decodeWithMediabunny(blob: Blob): Promise<AudioBuffer | null> {
  try {
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      return null;
    }

    const sink = new AudioBufferSink(audioTrack);
    const buffers: AudioBuffer[] = [];

    for await (const chunk of sink.buffers()) {
      if (!chunk) {
        continue;
      }
      buffers.push(chunk.buffer);
    }

    if (!buffers.length) {
      return null;
    }

    const channelCount = buffers.reduce((max, buffer) => Math.max(max, buffer.numberOfChannels), 1);
    const sampleRate = buffers[0].sampleRate;
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);

    const merged = new AudioBuffer({
      length: totalLength,
      numberOfChannels: channelCount,
      sampleRate,
    });

    let offset = 0;
    for (const buffer of buffers) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const destination = merged.getChannelData(channel);
        const sourceChannelIndex = Math.min(channel, buffer.numberOfChannels - 1);
        const sourceData = buffer.getChannelData(sourceChannelIndex);
        destination.set(sourceData, offset);
      }
      offset += buffer.length;
    }

    return merged;
  } catch (error) {
    console.warn('无法通过 mediabunny 解码音频数据', error);
    return null;
  }
}

async function getElementBlob(element: MediaElement): Promise<Blob | null> {
  if (element.remoteSource) {
    try {
      const response = await fetch(element.remoteSource);
      if (response.ok) {
        return await response.blob();
      }
    } catch (error) {
      console.warn('读取远程媒体资源失败', error);
    }
  }

  if (element.mediaId) {
    console.warn(`Missing remote source for media element ${element.id}`);
  }

  return null;
}

function mixAudioElementIntoBuffer(audioData: AudioElementData, target: AudioBuffer): void {
  const { buffer, element: timelineElement } = audioData;
  const outputSampleRate = target.sampleRate;

  const elementStartSeconds = timelineElement.startTime;
  const elementDurationSeconds = getElementDuration(timelineElement);
  const trimSeconds = timelineElement.trimStart;

  if (elementDurationSeconds <= 0 || timelineElement.volume === 0) {
    return;
  }

  const sourceSampleRate = buffer.sampleRate;
  const sourceStartSample = Math.floor(trimSeconds * sourceSampleRate);
  const availableDuration = buffer.duration - trimSeconds;
  const sourceDurationSeconds = Math.min(elementDurationSeconds, availableDuration);
  if (sourceDurationSeconds <= 0) {
    return;
  }

  const sourceLengthSamples = Math.floor(sourceDurationSeconds * sourceSampleRate);
  const resampleRatio = outputSampleRate / sourceSampleRate;
  const resampledLength = Math.floor(sourceLengthSamples * resampleRatio);
  const outputStartSample = Math.floor(elementStartSeconds * outputSampleRate);

  const volume = resolveVolume(timelineElement.volume);
  const outputLength = target.length;

  for (let channel = 0; channel < target.numberOfChannels; channel += 1) {
    const outputData = target.getChannelData(channel);
    const sourceChannelIndex = Math.min(channel, buffer.numberOfChannels - 1);
    const sourceData = buffer.getChannelData(sourceChannelIndex);

    for (let index = 0; index < resampledLength; index += 1) {
      const outputIndex = outputStartSample + index;
      if (outputIndex >= outputLength) {
        break;
      }

      const sourceIndex = sourceStartSample + Math.floor(index / resampleRatio);
      if (sourceIndex >= sourceData.length) {
        break;
      }

      outputData[outputIndex] += sourceData[sourceIndex] * volume;
    }
  }
}
