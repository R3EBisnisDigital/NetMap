import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`h-9 w-9 rounded-lg grid place-items-center border transition-colors ${className}
        ${isDark
          ? "bg-[hsl(var(--nm-panel-bg))] border-[hsl(var(--nm-panel-border))] text-amber-300 hover:border-amber-400/60 hover:text-amber-200"
          : "bg-[hsl(var(--nm-panel-bg))] border-[hsl(var(--nm-panel-border))] text-slate-700 hover:border-slate-500 hover:text-slate-900"
        }`}
    >
      {isDark ? <Sun size={16} strokeWidth={1.9} /> : <Moon size={16} strokeWidth={1.9} />}
    </button>
  );
}
