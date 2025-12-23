import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format time to one decimal place, rounding down at .05 values
 * e.g., 12.44 -> 12.4, 12.45 -> 12.4, 12.46 -> 12.5
 */
export function formatTime(seconds: number): string {
  // Round to nearest 0.1, but round down at exactly 0.05
  const rounded = Math.floor(seconds * 10 + 0.4999999) / 10;
  return rounded.toFixed(1);
}
