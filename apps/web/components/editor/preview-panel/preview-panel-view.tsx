import { cn } from "@/lib/utils";

interface PreviewPanelViewProps {
  className?: string;
}

export const PreviewPanelView: React.FC<PreviewPanelViewProps> = (props) => {
  const { className } = props;

  return (
    <div
      id="stage"
      className={cn(
        "pane relative flex h-full min-h-0 w-full flex-grow flex-col",
        className
      )}
    >
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
      <div
        id="preview-container"
        className="preview-container relative dark:bg-gray-900 flex-1 min-h-128 w-full"
      />
    </div>
  );
};
