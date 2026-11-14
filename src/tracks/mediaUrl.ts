/** URL of a file in public/media, correct under any deploy sub-path. */
export function mediaUrl(file: string): string {
  return `${import.meta.env.BASE_URL}media/${file}`
}
