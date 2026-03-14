import type { Project } from "@/lib/types";
import { STATUS_COLORS } from "@/lib/constants";

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}

/** Avatar background colors based on project name */
const AVATAR_COLORS = [
  { bg: "bg-brand-light", text: "text-brand" },
  { bg: "bg-[#E1F5EE]", text: "text-[#0F6E56]" },
  { bg: "bg-[#FAECE7]", text: "text-[#993C1D]" },
  { bg: "bg-[#E6F1FB]", text: "text-[#185FA5]" },
  { bg: "bg-warning-light", text: "text-warning-dark" },
];

function getInitials(name: string): string {
  return name
    .split(/[-_\s]/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Single project row in the sidebar.
 * Shows avatar, name, path, and status indicator dot.
 */
export function ProjectItem({ project, isActive, onClick }: ProjectItemProps) {
  const colorIndex =
    project.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    AVATAR_COLORS.length;
  const avatarColor = AVATAR_COLORS[colorIndex]!;
  const statusColor = STATUS_COLORS[project.status];

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors w-full text-left ${
        isActive
          ? "bg-surface border-r-2 border-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
          : "hover:bg-surface border-r-2 border-transparent"
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-medium shrink-0 ${avatarColor.bg} ${avatarColor.text}`}
      >
        {getInitials(project.name)}
      </div>

      {/* Name and path */}
      <div className="overflow-hidden flex-1">
        <div className="text-[13px] font-medium text-text truncate">
          {project.name}
        </div>
        <div className="text-[11px] text-text-muted truncate">
          {project.path}
        </div>
      </div>

      {/* Status dot */}
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: statusColor }}
      />
    </button>
  );
}
