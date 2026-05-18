import * as React from "react";

type Props = { name: string; className?: string; size?: number };

export function ToolIcon({ name, className, size = 14 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "claude-code":
    case "claude":
      // Abstract C
      return (
        <svg {...common}>
          <path d="M12 4.5A4.5 4.5 0 1 0 12 11.5" />
          <circle cx="8" cy="8" r="6.5" opacity="0.25" />
        </svg>
      );
    case "codex":
      // Abstract C2
      return (
        <svg {...common}>
          <path d="M10 4.5a4 4 0 1 0 0 7" />
          <path d="M11.5 11.5h2.5M11.5 9.5c0-1 2.5-1 2.5 0 0 .8-2.5 1.2-2.5 2h2.5" />
        </svg>
      );
    case "cursor":
      // Triangle / pointer
      return (
        <svg {...common}>
          <path d="M3 2.5l9.5 5.5L8 9l-1 4.5z" />
        </svg>
      );
    case "aider":
      // Abstract A
      return (
        <svg {...common}>
          <path d="M3 13L8 3l5 10" />
          <path d="M5.2 9.5h5.6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
        </svg>
      );
  }
}
