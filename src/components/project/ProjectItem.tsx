import type { Project } from "@/lib/types";
import { STATUS_COLORS } from "@/lib/constants";

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

/** Folder icon color pairs based on project name hash */
const FOLDER_COLORS = [
  { folder: "#0A84FF", tint: "#E8F2FF" },
  { folder: "#34C759", tint: "#E8FAE9" },
  { folder: "#FF9500", tint: "#FFF4E5" },
  { folder: "#AF52DE", tint: "#F3EDFF" },
  { folder: "#FF3B30", tint: "#FFEDED" },
];

/**
 * Single project row — macOS sidebar source list item with folder icon.
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
  const colorIndex =
    project.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    FOLDER_COLORS.length;
  const folderColor = FOLDER_COLORS[colorIndex]!;
  const statusColor = STATUS_COLORS[project.status];

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="group relative"
    >
      <button
        onClick={onClick}
        className={`flex items-center gap-2.5 px-2.5 py-[7px] cursor-pointer transition-all w-full text-left rounded-lg border-none ${
          isActive
            ? "bg-accent text-white shadow-[0_1px_3px_rgba(10,132,255,0.25)]"
            : "bg-transparent text-text hover:bg-sidebar-hover"
        }`}
      >
        {/* Folder icon */}
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{
            backgroundColor: isActive ? "rgba(255,255,255,0.2)" : folderColor.tint,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ color: isActive ? "white" : folderColor.folder }}
          >
            <path
              d="M1.5 4V10.5C1.5 11.0523 1.94772 11.5 2.5 11.5H11.5C12.0523 11.5 12.5 11.0523 12.5 10.5V5.5C12.5 4.94772 12.0523 4.5 11.5 4.5H7.5L6 3H2.5C1.94772 3 1.5 3.44772 1.5 4Z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
              fill="currentColor"
              fillOpacity="0.12"
            />
          </svg>
        </div>

        {/* Name and path */}
        <div className="overflow-hidden flex-1 min-w-0">
          <div
            className={`text-[13px] font-medium truncate ${
              isActive ? "text-white" : "text-text"
            }`}
          >
            {project.name}
          </div>
          <div
            className={`text-[11px] truncate ${
              isActive ? "text-white/60" : "text-text-muted"
            }`}
          >
            {project.path.split(/[\\/]/).slice(-2).join("/")}
          </div>
        </div>

        {/* Status dot or pin toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                isPinned ? onUnpin?.() : onPin?.();
              }}
              className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sidebar-hover-dark/10 cursor-pointer border-none bg-transparent ${
                isPinned ? "text-accent opacity-100" : "text-text-muted"
              }`}
              title={isPinned ? "Unpin project" : "Pin project"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </button>
          )}
          <div
            className="w-[7px] h-[7px] rounded-full"
            style={{
              backgroundColor: isActive ? "rgba(255,255,255,0.5)" : statusColor,
            }}
          />
        </div>
      </button>
    </div>
  );
}
