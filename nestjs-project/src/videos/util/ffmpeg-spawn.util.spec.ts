import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcess } from 'child_process';
import { runProcess, spawnFfmpeg, spawnFfprobe } from './ffmpeg-spawn.util';
import type { Spawner } from './ffmpeg-spawn.util';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = jest.fn((signal?: string) => {
    setImmediate(() => this.emit('close', null, signal));
    return true;
  });
}

function fakeSpawner(script: (child: FakeChild) => void): {
  spawner: Spawner;
  calls: { command: string; args: readonly string[] }[];
  children: FakeChild[];
} {
  const calls: { command: string; args: readonly string[] }[] = [];
  const children: FakeChild[] = [];
  const spawner: Spawner = (command, args) => {
    calls.push({ command, args });
    const child = new FakeChild();
    children.push(child);
    setImmediate(() => script(child));
    return child as unknown as ChildProcess;
  };
  return { spawner, calls, children };
}

describe('runProcess', () => {
  it('should capture stdout, stderr and the exit code', async () => {
    const { spawner } = fakeSpawner((child) => {
      child.stdout.write('{"format":{}}');
      child.stderr.write('warning: something');
      child.emit('close', 0);
    });

    const result = await runProcess('ffprobe', ['-v', 'error'], { spawner });

    expect(result).toEqual({
      exitCode: 0,
      stdout: '{"format":{}}',
      stderr: 'warning: something',
      timedOut: false,
    });
  });

  it('should kill the process on timeout and report a non-zero exit code', async () => {
    const { spawner, children } = fakeSpawner((child) => {
      child.stderr.write('still working…');
    });

    const result = await runProcess('ffmpeg', ['-i', 'in.mov'], {
      spawner,
      timeoutMs: 20,
    });

    expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('still working');
  });

  it('should resolve with exitCode -1 when the binary cannot be spawned', async () => {
    const { spawner } = fakeSpawner((child) => {
      child.emit('error', new Error('spawn ffmpeg ENOENT'));
    });

    const result = await runProcess('ffmpeg', [], { spawner });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain('ENOENT');
  });
});

describe('spawnFfprobe / spawnFfmpeg', () => {
  it('should invoke the matching binary with the given args', async () => {
    const { spawner, calls } = fakeSpawner((child) => child.emit('close', 0));

    await spawnFfprobe(['-show_format', 'a.mp4'], { spawner });
    await spawnFfmpeg(['-i', 'a.mp4', 'b.mp4'], { spawner });

    expect(calls).toEqual([
      { command: 'ffprobe', args: ['-show_format', 'a.mp4'] },
      { command: 'ffmpeg', args: ['-i', 'a.mp4', 'b.mp4'] },
    ]);
  });
});
