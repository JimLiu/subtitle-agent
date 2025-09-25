'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DEFAULT_EXPORT_OPTIONS,
  getExportFileExtension,
  getExportMimeType,
} from '@/lib/export';
import type { ExportOptions } from '@/types/export';

import { PreviewPanelKonva } from './preview-panel-konva';

const FPS_OPTIONS = [24, 30, 60] as const;
const QUALITY_OPTIONS = ['low', 'medium', 'high', 'very_high'] as const;

function createDefaultExportOptions(): ExportOptions {
  return {
    ...DEFAULT_EXPORT_OPTIONS,
    fps: DEFAULT_EXPORT_OPTIONS.fps ?? 30,
  };
}

export interface PreviewExportModalProps {
  open: boolean;
  onClose: () => void;
  konvaRef: MutableRefObject<PreviewPanelKonva | null>;
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
  }
}

export const PreviewExportModal: React.FC<PreviewExportModalProps> = ({ open, onClose, konvaRef }) => {
  const [exportOptions, setExportOptions] = useState<ExportOptions>(() => createDefaultExportOptions());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportedSize, setExportedSize] = useState<number | null>(null);
  const [saveMethod, setSaveMethod] = useState<'file-system' | 'download' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelExportRef = useRef(false);
  const downloadUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    };
  }, []);

  const handleExport = useCallback(async () => {
    const konva = konvaRef.current;
    if (!konva) {
      setExportError('Preview is not ready yet');
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

    type SaveTarget =
      | { type: 'file-system'; handle: FileSystemFileHandle }
      | { type: 'download' };

    let saveTarget: SaveTarget = { type: 'download' };

    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
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
        saveTarget = { type: 'file-system', handle };
      } catch (pickerError) {
        if (pickerError instanceof DOMException && pickerError.name === 'AbortError') {
          setWasCancelled(true);
          return;
        }
        console.warn('Falling back to automatic download; file picker unavailable', pickerError);
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

        if (saveTarget.type === 'file-system') {
          try {
            const writable = await saveTarget.handle.createWritable();
            await writable.write(blob);
            await writable.close();
            saved = true;
            setSaveMethod('file-system');
          } catch (saveError) {
            console.warn('Failed to save via chosen path; falling back to download', saveError);
          }
        }

        if (!saved) {
          const url = URL.createObjectURL(blob);
          downloadUrlRef.current = url;

          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = defaultFileName;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);

          setSaveMethod('download');
        }

        setExportSuccess(true);
        setExportedSize(result.buffer.byteLength);
      } else if (result.cancelled) {
        setWasCancelled(true);
      } else if (result.error) {
        setExportError(result.error);
      } else {
        setExportError('Export failed');
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
      setCancelRequested(false);
      cancelExportRef.current = false;
    }
  }, [exportOptions, konvaRef]);

  const handleCancel = useCallback(() => {
    cancelExportRef.current = true;
    setCancelRequested(true);
  }, []);

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
          <h2 className="text-lg font-semibold">Export Preview</h2>
          <Button size="icon" variant="ghost" onClick={handleClose} disabled={isExporting}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Format</p>
            <div className="mt-1 flex gap-2">
              {(['mp4', 'webm'] as const).map((format) => (
                <Button
                  key={format}
                  variant={exportOptions.format === format ? 'default' : 'outline'}
                  onClick={() => setExportOptions((current) => ({ ...current, format }))}
                  disabled={isExporting}
                  className="flex-1 capitalize"
                >
                  {format}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Quality</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {QUALITY_OPTIONS.map((quality) => (
                <Button
                  key={quality}
                  variant={exportOptions.quality === quality ? 'default' : 'outline'}
                  onClick={() => setExportOptions((current) => ({ ...current, quality }))}
                  disabled={isExporting}
                  className="capitalize"
                >
                  {quality.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">FPS</p>
            <div className="mt-1 flex gap-2">
              {FPS_OPTIONS.map((fps) => (
                <Button
                  key={fps}
                  variant={exportOptions.fps === fps ? 'default' : 'outline'}
                  onClick={() => setExportOptions((current) => ({ ...current, fps }))}
                  disabled={isExporting}
                  className="flex-1"
                >
                  {fps}
                </Button>
              ))}
            </div>
          </div>

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

          {isExporting ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>{cancelRequested ? 'Cancelling…' : 'Exporting…'}</span>
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
              Export complete!{' '}
              {saveMethod === 'file-system'
                ? 'File saved to the chosen location.'
                : 'Download should start automatically.'}{' '}
              {typeof exportedSize === 'number'
                ? `File size: ${(exportedSize / 1024 / 1024).toFixed(2)} MB`
                : null}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={handleExport} disabled={isExporting} className="flex-1">
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting…
                </>
              ) : exportSuccess ? (
                'Export Again'
              ) : (
                'Export'
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
