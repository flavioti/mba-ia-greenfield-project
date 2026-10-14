import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Subset of `child_process.spawn` used here — injectable so unit tests run without FFmpeg. */
export type Spawner = (
  command: string,
  args: readonly string[],
) => ChildProcess;

export interface SpawnOptions {
  timeoutMs?: number;
  spawner?: Spawner;
}

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
/** Keep only the tail of stderr — FFmpeg can log megabytes on long transcodes. */
const MAX_STDERR_CHARS = 64 * 1024;

export const defaultSpawner: Spawner = (command, args) =>
  spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

export function runProcess(
  command: string,
  args: readonly string[],
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    spawner = defaultSpawner,
  }: SpawnOptions = {},
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawner(command, args);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-MAX_STDERR_CHARS);
    });
    child.on('error', (err: Error) => {
      stderr += err.message;
      finish(-1);
    });
    child.on('close', (code: number | null) => {
      finish(timedOut || code === null ? -1 : code);
    });
  });
}

export function spawnFfprobe(
  args: readonly string[],
  options?: SpawnOptions,
): Promise<SpawnResult> {
  return runProcess('ffprobe', args, options);
}

export function spawnFfmpeg(
  args: readonly string[],
  options?: SpawnOptions,
): Promise<SpawnResult> {
  return runProcess('ffmpeg', args, options);
}
