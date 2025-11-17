import { ChevronDown } from "lucide-react";
import { HeaderBase } from "../header-base";
import { Button } from "../ui/button";
import { useProjectStore } from "@/stores/project-store";

export function EditorHeader() {
  const { activeProject } = useProjectStore();

  const leftContent = (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        className="h-auto py-1.5 px-2.5 flex items-center justify-center"
      >
        <ChevronDown className="text-muted-foreground" />
        <span className="text-[0.85rem] mr-2">{activeProject?.name}</span>
      </Button>
    </div>
  );

  const rightContent = <nav className="flex items-center gap-2"></nav>;
  return (
    <HeaderBase
      leftContent={leftContent}
      rightContent={rightContent}
      className="bg-background h-[3.2rem] px-3 items-center mt-0.5"
    />
  );
}
