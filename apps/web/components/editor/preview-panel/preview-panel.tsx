import { useProjectStore } from "@/stores/project-store";
import { PreviewPanelView } from "./preview-panel-view";
import { useMemo } from "react";
import { getRatioKey } from "./ratio-utils";
import ratioPresets from "./ratio-presets";
import { PreviewSize } from "@/stores/preview-panel-store";

interface PreviewPanelProps {
  className?: string;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = (props) => {
  const { className } = props;

  const activeProject = useProjectStore((state) => state.activeProject);
  const projectId = activeProject?.id;

  // 预览尺寸：支持按预设比例或原始尺寸计算
  // 说明：
  // - preset 模式下根据 ratioPresets 推导出常见比例（16:9/9:16 等）；
  // - original 模式保持与项目画布一致的像素尺寸；
  // 与 View 中的可视缩放结合，确保画面比例正确。
  const previewSize: PreviewSize | null = useMemo(() => {
    if (!activeProject) {
      return null;
    }

    const { canvasSize, canvasMode } = activeProject;
    const ratioKey = getRatioKey(canvasSize.width, canvasSize.height);
    const isPresetMode = canvasMode === "preset" && ratioPresets[ratioKey];

    return {
      ratio: isPresetMode ? ratioKey : "original",
      original: {
        width: canvasSize.width,
        height: canvasSize.height,
      },
    };
  }, [activeProject]);

  if (!activeProject || !projectId || !previewSize) {
    return <div className="h-full w-full bg-panel" />;
  }
  return <PreviewPanelView className={className} />;
};
