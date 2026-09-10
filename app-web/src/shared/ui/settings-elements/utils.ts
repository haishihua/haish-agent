import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Portals inherit the settings theme; the standalone demo supplies its own canvas.
export function getSettingsPortalContainer() {
  return document.querySelector<HTMLElement>('[data-settings-portal]') || document.getElementById('desktop-canvas') || document.body;
}
