import { CSSProperties, useEffect, useMemo, useState } from "react";

import type { TextElement, TimelineElement } from "@/types/timeline";

interface TextEditToolbarProps {
  segmentId: string;
  hasTransformer: boolean;
  playing: boolean;
  getSegmentById: (id: string) => TimelineElement | null;
  updateSegment: (payload: Partial<TextElement> & { id: string }) => void | Promise<void>;
  style: CSSProperties;
}

function extractColor(segment: TextElement | null): { color: string; opacity: number } {
  if (!segment?.color) {
    return { color: "#000000", opacity: segment?.opacity ?? 1 };
  }
  const base = segment.color.slice(0, 7);
  return {
    color: base,
    opacity: segment.opacity ?? 1,
  };
}

function getDecorationState(decoration: TextElement["textDecoration"] | undefined): {
  underline: boolean;
  strikethrough: boolean;
} {
  return {
    underline: decoration === "underline" || decoration === "underline-line-through",
    strikethrough: decoration === "line-through" || decoration === "underline-line-through",
  };
}

function computeDecoration(underline: boolean, strikethrough: boolean): TextElement["textDecoration"] {
  if (underline && strikethrough) {
    return "underline-line-through";
  }
  if (underline) {
    return "underline";
  }
  if (strikethrough) {
    return "line-through";
  }
  return "none";
}

export function TextEditToolbar(props: TextEditToolbarProps): JSX.Element | null {
  const { segmentId, hasTransformer, playing, getSegmentById, updateSegment, style } = props;

  const segment = useMemo(() => {
    const found = getSegmentById(segmentId);
    return found && found.type === "text" ? (found as TextElement) : null;
  }, [getSegmentById, segmentId]);

  const visible = Boolean(segment && hasTransformer && !playing);

  const [fontFamily, setFontFamily] = useState(segment?.font?.family ?? "");
  const [fontSize, setFontSize] = useState(segment?.fontSize ?? 16);
  const [lineHeight, setLineHeight] = useState(Math.round((segment?.lineHeight ?? 1.2) * 100));
  const [letterSpacing, setLetterSpacing] = useState(segment?.letterSpacing ?? 0);
  const [align, setAlign] = useState(segment?.textAlign ?? "left");
  const [{ color, opacity }, setColorState] = useState(() => extractColor(segment));
  const [isBold, setIsBold] = useState(segment?.fontWeight === "bold");
  const [isItalic, setIsItalic] = useState(segment?.fontStyle === "italic");
  const initialDecoration = getDecorationState(segment?.textDecoration);
  const [isUnderline, setIsUnderline] = useState(initialDecoration.underline);
  const [isStrikethrough, setIsStrikethrough] = useState(initialDecoration.strikethrough);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    if (!segment) {
      setIsMoreMenuOpen(false);
      return;
    }
    setFontFamily(segment.font?.family ?? "");
    setFontSize(segment.fontSize ?? 16);
    setLineHeight(Math.round((segment.lineHeight ?? 1.2) * 100));
    setLetterSpacing(segment.letterSpacing ?? 0);
    setAlign(segment.textAlign ?? "left");
    setColorState(extractColor(segment));
    setIsBold(segment.fontWeight === "bold");
    setIsItalic(segment.fontStyle === "italic");
    const { underline, strikethrough } = getDecorationState(segment.textDecoration);
    setIsUnderline(underline);
    setIsStrikethrough(strikethrough);
  }, [segment]);

  useEffect(() => {
    if (!hasTransformer) {
      setIsMoreMenuOpen(false);
    }
  }, [hasTransformer]);

  if (!segment || !visible) {
    return null;
  }

  const applyUpdate = (payload: Partial<TextElement>) => {
    void updateSegment({ id: segment.id, ...payload });
  };

  const handleFontFamilyChange = (value: string) => {
    setFontFamily(value);
    applyUpdate({ font: { ...(segment.font ?? {}), family: value } });
  };

  const handleFontSizeChange = (value: number) => {
    setFontSize(value);
    applyUpdate({ fontSize: value });
  };

  const handleLineHeightChange = (value: number) => {
    setLineHeight(value);
    applyUpdate({ lineHeight: value / 100 });
  };

  const handleLetterSpacingChange = (value: number) => {
    setLetterSpacing(value);
    applyUpdate({ letterSpacing: value });
  };

  const handleAlignChange = (value: TextElement["textAlign"]) => {
    setAlign(value);
    applyUpdate({ textAlign: value });
  };

  const handleColorChange = (value: string) => {
    setColorState((prev) => ({ color: value, opacity: prev.opacity }));
    applyUpdate({ color: value });
  };

  const handleOpacityChange = (value: number) => {
    const normalized = value / 100;
    setColorState((prev) => ({ color: prev.color, opacity: normalized }));
    applyUpdate({ opacity: normalized });
  };

  const toggleBold = () => {
    setIsBold((prev) => {
      const next = !prev;
      applyUpdate({ fontWeight: next ? "bold" : "normal" });
      return next;
    });
  };

  const toggleItalic = () => {
    setIsItalic((prev) => {
      const next = !prev;
      applyUpdate({ fontStyle: next ? "italic" : "normal" });
      return next;
    });
  };

  const toggleUnderline = () => {
    setIsUnderline((prev) => {
      const next = !prev;
      applyUpdate({ textDecoration: computeDecoration(next, isStrikethrough) });
      return next;
    });
  };

  const toggleStrikethrough = () => {
    setIsStrikethrough((prev) => {
      const next = !prev;
      applyUpdate({ textDecoration: computeDecoration(isUnderline, next) });
      return next;
    });
  };

  return (
    <div
      className="absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 text-edit-toolbar"
      style={{ position: "fixed", ...style }}
    >
      <div className="flex items-center space-x-2">
        <input
          className="w-40 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded"
          placeholder="Font family"
          value={fontFamily}
          onChange={(event) => handleFontFamilyChange(event.target.value)}
        />
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <input
          type="number"
          className="w-16 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded"
          value={fontSize}
          min={1}
          max={1000}
          onChange={(event) => handleFontSizeChange(Number(event.target.value) || 1)}
        />
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <button
          type="button"
          className={`p-1.5 rounded transition-colors ${isBold ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          onClick={toggleBold}
        >
          <span className={`font-bold text-sm ${isBold ? "text-blue-500" : "text-gray-700 dark:text-gray-300"}`}>B</span>
        </button>
        <button
          type="button"
          className={`p-1.5 rounded transition-colors ${isItalic ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          onClick={toggleItalic}
        >
          <span className={`italic text-sm ${isItalic ? "text-blue-500" : "text-gray-700 dark:text-gray-300"}`}>I</span>
        </button>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex space-x-1">
          {["left", "center", "right"].map((value) => (
            <button
              key={value}
              type="button"
              className={`p-1.5 rounded transition-colors ${align === value ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              onClick={() => handleAlignChange(value as TextElement["textAlign"])}
            >
              <span className={`${align === value ? "text-blue-500" : "text-gray-700 dark:text-gray-300"}`}>
                {value === "left" && "⟸"}
                {value === "center" && "⇔"}
                {value === "right" && "⟹"}
              </span>
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center space-x-2">
          <input
            type="color"
            value={color}
            onChange={(event) => handleColorChange(event.target.value)}
          />
          <input
            type="number"
            value={Math.round(opacity * 100)}
            min={0}
            max={100}
            className="w-16 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded"
            onChange={(event) => handleOpacityChange(Number(event.target.value) || 0)}
          />
        </div>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <button
          type="button"
          className={`p-1.5 rounded transition-colors ${isUnderline ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          onClick={toggleUnderline}
        >
          <span className={`underline text-sm ${isUnderline ? "text-blue-500" : "text-gray-700 dark:text-gray-300"}`}>U</span>
        </button>
        <button
          type="button"
          className={`p-1.5 rounded transition-colors ${isStrikethrough ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          onClick={toggleStrikethrough}
        >
          <span className={`line-through text-sm ${isStrikethrough ? "text-blue-500" : "text-gray-700 dark:text-gray-300"}`}>S</span>
        </button>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <button
          type="button"
          className={`p-1.5 rounded transition-colors ${isMoreMenuOpen ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          onClick={() => setIsMoreMenuOpen((prev) => !prev)}
        >
          <span className={`text-sm ${isMoreMenuOpen ? "text-blue-500" : "text-gray-700 dark:text-gray-300"}`}>•••</span>
        </button>
      </div>

      {isMoreMenuOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
          <label className="flex flex-col space-y-1">
            <span>Line height (%)</span>
            <input
              type="number"
              value={lineHeight}
              min={10}
              max={400}
              className="px-2 py-1 border border-gray-200 dark:border-gray-700 rounded"
              onChange={(event) => handleLineHeightChange(Number(event.target.value) || 100)}
            />
          </label>
          <label className="flex flex-col space-y-1">
            <span>Letter spacing</span>
            <input
              type="number"
              value={letterSpacing}
              min={-100}
              max={200}
              className="px-2 py-1 border border-gray-200 dark:border-gray-700 rounded"
              onChange={(event) => handleLetterSpacingChange(Number(event.target.value) || 0)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
