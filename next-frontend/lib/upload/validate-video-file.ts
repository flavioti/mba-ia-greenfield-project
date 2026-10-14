/** Client-side mirror of the `POST /videos` validation rules (§API Contracts → Validation Rules). */
export const ACCEPTED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const

/** 10 GiB */
export const MAX_VIDEO_SIZE_BYTES = 10 * 1024 ** 3
const MAX_FILE_NAME_LENGTH = 255

export type VideoFileValidation = { ok: true } | { ok: false; message: string }

export function validateVideoFile(file: Pick<File, "name" | "size" | "type">): VideoFileValidation {
  if (!(ACCEPTED_VIDEO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Formato não suportado. Envie um vídeo MP4, MOV, WebM ou MKV." }
  }
  if (file.size === 0) {
    return { ok: false, message: "O arquivo está vazio." }
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return { ok: false, message: "O arquivo excede o limite de 10 GB." }
  }
  if (file.name.length === 0 || file.name.length > MAX_FILE_NAME_LENGTH) {
    return { ok: false, message: "O nome do arquivo deve ter entre 1 e 255 caracteres." }
  }
  return { ok: true }
}
