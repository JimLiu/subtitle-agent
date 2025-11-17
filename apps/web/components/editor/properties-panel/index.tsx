"use client";

import { SquareSlashIcon } from "lucide-react";

export function PropertiesPanel() {
  return (
    <>
      <EmptyView />
    </>
  );
}

function EmptyView() {
  return (
    <div className="bg-panel h-full p-4 flex flex-col items-center justify-center gap-3">
      <SquareSlashIcon
        className="w-10 h-10 text-muted-foreground"
        strokeWidth={1.5}
      />
      <div className="flex flex-col gap-2 text-center">
        <p className="text-lg font-medium">It’s empty here</p>
        <p className="text-sm text-muted-foreground text-balance">
          Click an element on the timeline to edit its properties
        </p>
      </div>
    </div>
  );
}
