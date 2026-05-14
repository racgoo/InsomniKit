import { execFile, ExecFileException } from "child_process";

/**
 * Promisified `execFile`. We deliberately avoid `exec` (shell) so user-
 * controlled values can never be interpolated into a shell string — every
 * call site supplies an explicit argv array.
 *
 * Errors are normalized to `ExecResult` rather than thrown so callers can
 * inspect stderr / exit code without try/catch noise. Battery parsing
 * and pmset queries both want to degrade gracefully when the tool prints
 * something unexpected, so we keep the surface uniform.
 */

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  /** Set when execFile itself failed (binary missing, spawn error, etc). */
  error?: Error;
}

export interface ExecOptions {
  timeoutMs?: number;
  /** Hard limit on captured output; defaults to 1MB. */
  maxBuffer?: number;
}

export function exec(
  file: string,
  args: ReadonlyArray<string>,
  opts: ExecOptions = {},
): Promise<ExecResult> {
  const { timeoutMs = 5_000, maxBuffer = 1024 * 1024 } = opts;
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer, encoding: "utf8" },
      (err, stdout, stderr) => {
        const e = err as ExecFileException | null;
        resolve({
          stdout: typeof stdout === "string" ? stdout : String(stdout),
          stderr: typeof stderr === "string" ? stderr : String(stderr),
          code: e?.code === undefined ? 0 : typeof e.code === "number" ? e.code : null,
          error: e ?? undefined,
        });
      },
    );
  });
}
