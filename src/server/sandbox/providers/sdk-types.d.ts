/**
 * Type declarations for sandbox provider SDKs
 * These are stubs that allow TypeScript compilation when SDKs aren't installed.
 * The actual SDKs are dynamically imported at runtime.
 */

declare module '@e2b/code-interpreter' {
  export class Sandbox {
    static create(opts?: {
      apiKey?: string;
      timeoutMs?: number;
      template?: string;
      metadata?: Record<string, string>;
    }): Promise<Sandbox>;

    sandboxId: string;

    commands: {
      run(
        cmd: string,
        opts?: { timeout?: number; cwd?: string; envs?: Record<string, string>; timeoutMs?: number }
      ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
    };

    files: {
      read(path: string): Promise<string>;
      write(path: string, content: string): Promise<void>;
      list(path: string): Promise<{ name: string; isDir: boolean }[]>;
    };

    setTimeout(ms: number): Promise<void>;
    getInfo(): Promise<{
      sandboxId: string;
      templateId: string;
      startedAt: string;
      endAt: string;
      metadata: Record<string, string>;
    }>;

    pause(): Promise<void>;
    resume(): Promise<void>;
    close(): Promise<void>;
    kill(): Promise<void>;
  }

  export class CodeInterpreter extends Sandbox {
    runCode(code: string, language?: string): Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
      results: unknown[];
    }>;
  }
}

declare module 'e2b' {
  export { Sandbox } from '@e2b/code-interpreter';
}

declare module '@daytonaio/sdk' {
  export class Daytona {
    constructor(opts: { apiKey?: string; region?: string });
    
    create(opts?: {
      language?: string;
      name?: string;
      snapshot?: string;
      labels?: Record<string, string>;
      autoStopInterval?: number;
      autoArchiveInterval?: number;
      resources?: { cpu?: number; memory?: number; disk?: number };
      envVars?: Record<string, string>;
    }): Promise<DaytonaSandbox>;

    findOne(sandboxId: string): Promise<DaytonaSandbox>;
    list(): Promise<DaytonaSandbox[]>;
  }

  export interface DaytonaSandbox {
    id: string;
    state: string;
    autoStopInterval: number;
    
    process: {
      codeRun(code: string): Promise<{ exitCode: number; result: string }>;
      commandRun(
        cmd: string,
        opts?: { timeout?: number; cwd?: string }
      ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
      createPty(opts: {
        id: string;
        cols?: number;
        rows?: number;
        onData?: (data: Uint8Array) => void;
      }): Promise<DaytonaPtyHandle>;
      resizePtySession(id: string, cols: number, rows: number): Promise<void>;
    };

    fs: {
      read(path: string): Promise<string>;
      write(path: string, content: string): Promise<void>;
      list(path: string): Promise<{ name: string; isDir: boolean }[]>;
    };

    git: {
      clone(url: string, path: string): Promise<void>;
      status(): Promise<{ modified: string[]; untracked: string[] }>;
    };

    getUserRootDir(): Promise<string>;
    start(): Promise<void>;
    stop(): Promise<void>;
    delete(): Promise<void>;
    archive(): Promise<void>;
    setAutoStopInterval(minutes: number): Promise<void>;
  }

  export interface DaytonaPtyHandle {
    waitForConnection(): Promise<void>;
    sendInput(data: string): Promise<void>;
    kill(): Promise<void>;
    wait(): Promise<{ exitCode: number; error?: string }>;
  }
}
