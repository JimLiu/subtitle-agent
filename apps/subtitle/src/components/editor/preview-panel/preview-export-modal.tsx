"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_EXPORT_OPTIONS,
  getExportFileExtension,
  getExportMimeType,
} from "@/lib/export";
import type { ExportOptions } from "@/types/export";

import { PreviewPanelKonva } from "./preview-panel-konva";

// 导出帧率与质量预设选项
const FPS_OPTIONS = [24, 30, 60] as const;
const QUALITY_OPTIONS = ["low", "medium", "high", "very_high"] as const;

/**
 * 生成导出配置的默认值。
 * - 将 `DEFAULT_EXPORT_OPTIONS` 中可能为 undefined 的 fps 兜底为 30。
 */
function createDefaultExportOptions(): ExportOptions {
  return {
    ...DEFAULT_EXPORT_OPTIONS,
    fps: DEFAULT_EXPORT_OPTIONS.fps ?? 30,
  };
}

/**
 * 导出弹窗组件的入参。
 * - `open`：是否展示弹窗。
 * - `onClose`：关闭弹窗回调。
 * - `konvaRef`：指向预览渲染器（PreviewPanelKonva）的引用，用于调用导出流程。
 */
export interface PreviewExportModalProps {
  open: boolean;
  onClose: () => void;
  konvaRef: MutableRefObject<PreviewPanelKonva | null>;
}

// 声明浏览器保存文件的实验性 API（Chrome/Edge 支持）。
declare global {
  interface Window {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
  }
}

/**
 * 预览导出弹窗。
 * - 提供格式（mp4/webm）、质量、FPS、是否包含音频的配置项。
 * - 支持通过 File System Access API 保存文件，若不可用则回退到自动下载（a[href]）。
 * - 通过 `konvaRef.current.exportVideo()` 执行实际导出。
 */
export const PreviewExportModal: React.FC<PreviewExportModalProps> = ({ open, onClose, konvaRef }) => {
  const [exportOptions, setExportOptions] = useState<ExportOptions>(() => createDefaultExportOptions());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportedSize, setExportedSize] = useState<number | null>(null);
  // 记录最终的保存途径：文件系统或下载
  const [saveMethod, setSaveMethod] = useState<"file-system" | "download" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelExportRef = useRef(false);
  const downloadUrlRef = useRef<string | null>(null);

  // 组件卸载或关闭前释放临时的 Blob URL，避免内存泄漏。
  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    };
  }, []);

  /**
   * 执行导出逻辑：
   * 1) 尝试使用 File System Access API 选择保存位置；
   * 2) 通过 konva.exportVideo 生成二进制数据；
   * 3) 保存到用户选择的位置，或回退到自动下载。
   * 期间会处理取消、错误状态并更新进度条。
   */
  const handleExport = useCallback(async () => {
    const konva = konvaRef.current;
    if (!konva) {
      setExportError("Preview is not ready yet");
      return;
    }

    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }

    const extension = getExportFileExtension(exportOptions.format);
    const mimeType = getExportMimeType(exportOptions.format);
    const defaultFileName = `preview${extension}`;

    setExportError(null);
    setWasCancelled(false);
    setCancelRequested(false);
    setExportSuccess(false);
    setExportProgress(0);
    setExportedSize(null);
    setSaveMethod(null);
    cancelExportRef.current = false;

    // 统一抽象保存目标：文件系统 或 自动下载
    type SaveTarget =
      | { type: "file-system"; handle: FileSystemFileHandle }
      | { type: "download" };

    let saveTarget: SaveTarget = { type: "download" };

    // 首选浏览器的保存对话框（若支持）
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [
            {
              description: `${exportOptions.format.toUpperCase()} video`,
              accept: {
                [mimeType]: [extension],
              },
            },
          ],
        });
        saveTarget = { type: "file-system", handle };
      } catch (pickerError) {
        // 用户取消保存对话框
        if (pickerError instanceof DOMException && pickerError.name === "AbortError") {
          setWasCancelled(true);
          return;
        }
        console.warn("Falling back to automatic download; file picker unavailable", pickerError);
      }
    }

    setIsExporting(true);

    try {
      const result = await konva.exportVideo({
        ...exportOptions,
        onProgress: (value) => {
          setExportProgress(value);
        },
        onCancel: () => cancelExportRef.current,
      });

      if (result.success && result.buffer) {
        setExportProgress(1);

        const blob = new Blob([result.buffer], {
          type: mimeType,
        });
        let saved = false;

        // 尝试写入用户选择的文件路径
        if (saveTarget.type === "file-system") {
          try {
            const writable = await saveTarget.handle.createWritable();
            await writable.write(blob);
            await writable.close();
            saved = true;
            setSaveMethod("file-system");
          } catch (saveError) {
            console.warn("Failed to save via chosen path; falling back to download", saveError);
          }
        }

        if (!saved) {
          const url = URL.createObjectURL(blob);
          downloadUrlRef.current = url;

          // 回退到通过 a 标签触发下载
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = defaultFileName;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);

          setSaveMethod("download");
        }

        setExportSuccess(true);
        setExportedSize(result.buffer.byteLength);
      } else if (result.cancelled) {
        setWasCancelled(true);
      } else if (result.error) {
        setExportError(result.error);
      } else {
        setExportError("Export failed");
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
      setCancelRequested(false);
      cancelExportRef.current = false;
    }
  }, [exportOptions, konvaRef]);

  /** 标记导出取消（供导出实现通过回调轮询） */
  const handleCancel = useCallback(() => {
    cancelExportRef.current = true;
    setCancelRequested(true);
  }, []);

  /**
   * 关闭弹窗并做收尾：
   * - 正在导出时禁止关闭；
   * - 释放下载 URL；重置状态。
   */
  const handleClose = useCallback(() => {
    if (isExporting) {
      return;
    }
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    cancelExportRef.current = false;
    setExportProgress(0);
    setExportSuccess(false);
    setExportedSize(null);
    setSaveMethod(null);
    setExportError(null);
    setWasCancelled(false);
    setCancelRequested(false);
    onClose();
  }, [isExporting, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          {/* 标题与关闭按钮 */}
          <h2 className="text-lg font-semibold">Export Preview</h2>
          <Button size="icon" variant="ghost" onClick={handleClose} disabled={isExporting}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* 格式选择 */}
          <div>
            <p className="text-sm font-medium">Format</p>
            <div className="mt-1 flex gap-2">
              {(["mp4", "webm"] as const).map((format) => (
                <Button
                  key={format}
                  variant={exportOptions.format === format ? "default" : "outline"}
                  onClick={() => setExportOptions((current) => ({ ...current, format }))}
                  disabled={isExporting}
                  className="flex-1 capitalize"
                >
                  {format}
                </Button>
              ))}
            </div>
          </div>

          {/* 质量选择 */}
          <div>
            <p className="text-sm font-medium">Quality</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {QUALITY_OPTIONS.map((quality) => (
                <Button
                  key={quality}
                  variant={exportOptions.quality === quality ? "default" : "outline"}
                  onClick={() => setExportOptions((current) => ({ ...current, quality }))}
                  disabled={isExporting}
                  className="capitalize"
                >
                  {quality.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>

          {/* 帧率选择 */}
          <div>
            <p className="text-sm font-medium">FPS</p>
            <div className="mt-1 flex gap-2">
              {FPS_OPTIONS.map((fps) => (
                <Button
                  key={fps}
                  variant={exportOptions.fps === fps ? "default" : "outline"}
                  onClick={() => setExportOptions((current) => ({ ...current, fps }))}
                  disabled={isExporting}
                  className="flex-1"
                >
                  {fps}
                </Button>
              ))}
            </div>
          </div>

          {/* 是否包含音频 */}
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={Boolean(exportOptions.includeAudio)}
              onChange={(event) =>
                setExportOptions((current) => ({ ...current, includeAudio: event.target.checked }))
              }
              disabled={isExporting}
              className="rounded"
            />
            Include audio
          </label>

          {/* 进度与状态展示 */}
          {isExporting ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>{cancelRequested ? "Cancelling…" : "Exporting…"}</span>
                <span>{Math.round(exportProgress * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(exportProgress, 1) * 100}%` }}
                />
              </div>
            </div>
          ) : null}

          {exportError ? <div className="text-sm text-destructive">Error: {exportError}</div> : null}
          {wasCancelled ? (
            <div className="text-sm text-muted-foreground">Export cancelled.</div>
          ) : null}
          {exportSuccess ? (
            <div className="text-sm text-muted-foreground">
              Export complete!{" "}
              {saveMethod === "file-system"
                ? "File saved to the chosen location."
                : "Download should start automatically."}{" "}
              {typeof exportedSize === 'number'
                ? `File size: ${(exportedSize / 1024 / 1024).toFixed(2)} MB`
                : null}
            </div>
          ) : null}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button onClick={handleExport} disabled={isExporting} className="flex-1">
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting…
                </>
              ) : exportSuccess ? (
                "Export Again"
              ) : (
                "Export"
              )}
            </Button>
            {isExporting ? (
              <Button onClick={handleCancel} variant="outline" className="flex-1">
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewExportModal;
