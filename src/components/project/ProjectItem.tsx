import type { Project } from "@/lib/types";
import { STATUS_COLORS } from "@/lib/constants";
import { Pin, FolderOpen } from "lucide-react";

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * Project sidebar item — clean row with accent left border for active state.
 */
export function ProjectItem({
  project,
  isActive,
  isPinned,
  onPin,
  onUnpin,
  onClick,
  draggable,
  onDragStart,
  onDragOver,
  onDrop
}: ProjectItemProps) {
  const statusColor = STATUS_COLORS[project.status];

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="group relative"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-all w-full text-left rounded-lg relative ${
          isActive
            ? "bg-accent/8"
            : "bg-transparent hover:bg-surface-tertiary/60"
        }`}
      >
        <div className="w-4.5 h-4.5 flex items-center justify-center shrink-0">
          <FolderOpen
            size={15}
            strokeWidth={1.3}
            className={isActive ? "text-accent" : "text-text-muted group-hover:text-text-secondary"}
          />
        </div>

        {/* Name */}
        <div className="overflow-hidden flex-1 min-w-0">
          <div
            className={`text-[13px] truncate ${
              isActive ? "text-text font-semibold" : "text-text font-medium"
            }`}
          >
            {project.name}
          </div>
        </div>

        {/* Status dot + pin */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Pin — always visible at low opacity, full on hover/pinned */}
          {!isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                isPinned ? onUnpin?.() : onPin?.();
              }}
              className={`p-0.5 rounded transition-opacity hover:bg-surface-secondary cursor-pointer border-none bg-transparent flex items-center justify-center ${
                isPinned ? "text-accent opacity-80" : "text-text-muted opacity-0 group-hover:opacity-60"
              }`}
              title={isPinned ? "Unpin project" : "Pin project"}
            >
              <Pin size={10} fill={isPinned ? "currentColor" : "none"} />
            </button>
          )}
          {/* Status dot with ring */}
          <div
            className="w-[7px] h-[7px] rounded-full ring-2"
            style={{
              backgroundColor: statusColor,
              boxShadow: `0 0 0 2px ${statusColor}20`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
