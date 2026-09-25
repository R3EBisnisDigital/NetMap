import React from "react";
import {
  Server,
  Router,
  Network,
  Cloud,
  Database,
  ShieldAlert,
  Wifi,
  Phone,
  Monitor,
  HardDrive,
  Circle,
  Boxes,
} from "lucide-react";

// Map internal device types -> lucide icon + accent color
export const DEVICE_META = {
  router:      { icon: Router,      color: "#38bdf8", label: "Router" },
  switch:      { icon: Network,     color: "#22d3ee", label: "Switch" },
  server:      { icon: Server,      color: "#a78bfa", label: "Server" },
  firewall:    { icon: ShieldAlert, color: "#f97316", label: "Firewall" },
  cloud:       { icon: Cloud,       color: "#94a3b8", label: "Cloud / Internet" },
  storage:     { icon: Database,    color: "#facc15", label: "Storage" },
  workstation: { icon: Monitor,     color: "#4ade80", label: "Workstation" },
  wifi:        { icon: Wifi,        color: "#60a5fa", label: "Access Point" },
  phone:       { icon: Phone,       color: "#f472b6", label: "Phone" },
  rack:        { icon: HardDrive,   color: "#c084fc", label: "Rack Device" },
  generic:     { icon: Boxes,       color: "#7dd3fc", label: "Device" },
};

export const DEVICE_TYPES = Object.keys(DEVICE_META);

export function DeviceIcon({ type, size = 20, className = "", strokeWidth = 1.7 }) {
  const meta = DEVICE_META[type] || DEVICE_META.generic;
  const Icon = meta.icon || Circle;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
}

export function typeColor(type) {
  return (DEVICE_META[type] || DEVICE_META.generic).color;
}

export function typeLabel(type) {
  return (DEVICE_META[type] || DEVICE_META.generic).label;
}
