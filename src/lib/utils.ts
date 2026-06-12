import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Development-only logger — calls are stripped by bundlers when NODE_ENV=production */
export const logger = {
  warn: process.env.NODE_ENV === 'development' ? console.warn.bind(console) : () => {},
  error: process.env.NODE_ENV === 'development' ? console.error.bind(console) : () => {},
  log: process.env.NODE_ENV === 'development' ? console.log.bind(console) : () => {},
}
