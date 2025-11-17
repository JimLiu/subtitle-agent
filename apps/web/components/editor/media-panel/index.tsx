import { Separator } from "@/components/ui/separator";
import { VideoIcon } from "lucide-react";

export function MediaPanel() {
  return (
    <div className="h-full flex bg-panel">
      <VideoIcon className="w-4 h-4" />
      <Separator orientation="vertical" />
      <div className="flex-1 overflow-hidden">Media Panel Content</div>
    </div>
  );
}
