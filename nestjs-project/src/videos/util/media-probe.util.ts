/** Subset of `ffprobe -print_format json -show_format -show_streams` used by the pipeline. */
interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { format_name?: string; duration?: string };
}

export interface MediaInfo {
  formatName: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string;
  audioCodec: string | null;
}

export const FFPROBE_ARGS = [
  '-v',
  'error',
  '-print_format',
  'json',
  '-show_format',
  '-show_streams',
];

const BROWSER_SAFE_CONTAINERS = ['mp4', 'mov'];
const BROWSER_SAFE_VIDEO_CODEC = 'h264';
const BROWSER_SAFE_AUDIO_CODEC = 'aac';

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Returns `null` when the output is unreadable or has no video stream. */
export function parseFfprobeOutput(stdout: string): MediaInfo | null {
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    return null;
  }
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  if (!video?.codec_name) return null;
  const audio = streams.find((s) => s.codec_type === 'audio');

  return {
    formatName: parsed.format?.format_name ?? '',
    durationSeconds:
      toNumber(parsed.format?.duration) ?? toNumber(video.duration),
    width: video.width ?? null,
    height: video.height ?? null,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name ?? null,
  };
}

/**
 * H.264 (+ AAC or no audio) in an MP4/MOV container plays natively in every
 * browser, so it only needs a faststart remux; anything else is transcoded (TD-11).
 */
export function isBrowserSafe(info: MediaInfo): boolean {
  const containers = info.formatName.split(',');
  return (
    BROWSER_SAFE_CONTAINERS.some((c) => containers.includes(c)) &&
    info.videoCodec === BROWSER_SAFE_VIDEO_CODEC &&
    (info.audioCodec === null || info.audioCodec === BROWSER_SAFE_AUDIO_CODEC)
  );
}

export function remuxArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    output,
  ];
}

export function transcodeArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    output,
  ];
}

/** Frame at ~10% of the duration (TD-07), scaled to at most 1280px wide. */
export function thumbnailArgs(
  input: string,
  output: string,
  durationSeconds: number | null,
): string[] {
  const at = durationSeconds ? (durationSeconds * 0.1).toFixed(3) : '0';
  return [
    '-y',
    '-ss',
    at,
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    "scale='min(1280,iw)':-2",
    '-q:v',
    '3',
    output,
  ];
}
