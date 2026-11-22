import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { ConnectorError } from '../../../domain/errors.js';

export interface BridgeIdentity {
  threadId: string;
  agentId: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface BridgeReply {
  id?: string;
  success?: boolean;
  error?: string;
  errorCode?: string;
  data?: { data?: { status?: string; payload?: unknown; message?: string } };
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** One loopback WebSocket to the Toone app. Connects on first use and reconnects after a drop. */
export class BridgeClient {
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly port: number) {}

  /** Sends one command and returns its decoded payload. */
  async call(command: string, params: Record<string, unknown>, identity?: BridgeIdentity, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    const socket = await this.open();
    const id = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ConnectorError('TIMEOUT', `Toone did not answer within ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, ...(identity ?? {}), command: { command, params } }));
    });
  }

  async close(): Promise<void> {
    this.socket?.close();
    this.socket = null;
    this.opening = null;
  }

  private open(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.opening) return this.opening;
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://localhost:${this.port}`);
      socket.once('open', () => {
        this.socket = socket;
        this.opening = null;
        resolve(socket);
      });
      socket.once('error', () => {
        this.opening = null;
        reject(
          new ConnectorError(
            'APP_NOT_RUNNING',
            `Could not reach the Toone app on this Mac (port ${this.port}). Open Toone and try again. The App Store edition cannot be reached by connectors.`,
          ),
        );
      });
      socket.on('message', (raw) => this.receive(raw.toString()));
      socket.on('close', () => this.dropped());
    });
    return this.opening;
  }

  private receive(text: string): void {
    const parsed = decode(text);
    if (!parsed || typeof parsed !== 'object') return;
    const reply = parsed as BridgeReply;
    const waiting = reply.id ? this.pending.get(reply.id) : undefined;
    if (!reply.id || !waiting) return;
    this.pending.delete(reply.id);
    clearTimeout(waiting.timer);
    const inner = reply.data?.data;
    if (!reply.success) {
      waiting.reject(new ConnectorError('APP_ERROR', appMessage(reply.error, reply.errorCode)));
      return;
    }
    const payload = decode(inner?.payload);
    if (inner?.status && inner.status !== 'ok') {
      waiting.reject(new ConnectorError('APP_ERROR', appMessage(describe(payload) ?? inner.message, undefined)));
      return;
    }
    waiting.resolve(payload);
  }

  private dropped(): void {
    this.socket = null;
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new ConnectorError('APP_NOT_RUNNING', 'The connection to Toone closed. Is the app still open?'));
      this.pending.delete(id);
    }
  }
}

function decode(payload: unknown): unknown {
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

function describe(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const p = payload as { message?: unknown; code?: unknown };
    if (typeof p.message === 'string') return typeof p.code === 'string' ? `${p.message} (${p.code})` : p.message;
  }
  return undefined;
}

function appMessage(message: string | undefined, code: string | undefined): string {
  const text = message ?? 'Toone refused the request.';
  return code ? `Toone: ${text} (${code})` : `Toone: ${text}`;
}
