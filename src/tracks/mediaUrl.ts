/** URL of a file in public/media, correct under any deploy sub-path. */
export function mediaUrl(file: string): string {
  // import.meta.env only exists under Vite; scripts run in plain Node fall back to the root.
  return `${import.meta.env?.BASE_URL ?? '/'}media/${file}`
}
