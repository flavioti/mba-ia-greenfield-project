/** `125.4` → `"2:05"`; hours when needed (`3725` → `"1:02:05"`). */
export function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return null
  const s = Math.floor(totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = String(s % 60).padStart(2, "0")
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`
}

/** `1080` → `"1080p HD"`, `480` → `"480p"`. */
export function formatQuality(height: number | null | undefined): string | null {
  if (!height) return null
  return height >= 720 ? `${height}p HD` : `${height}p`
}
