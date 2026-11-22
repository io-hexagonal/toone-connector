import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { ConnectorError } from '../../../domain/errors.js';
import { BRIDGE_SUBPROTOCOL, notRunning, OpenFailure, openSocket, pairedHandshake, startPairing, verifiesServer, type PairDecision, type PairingSession } from './bridge-auth.js';
import type { CredentialStore, StoredCredential } from './credential-store.js';

export interface BridgeIdentity {
  threadId: string;
  agentId: string;
}

export interface BridgeClientOptions {
  /** Where the pairing is kept. Without it the client connects unpaired, as in 0.1. */
  credentials?: CredentialStore;
  /** Ask Toone to pair when there is no pairing yet (the tool server does; the command line has `pair`). */
  autoPair?: boolean;
  /** The name Toone shows in its prompt and in Settings › Connected Apps. */
  clientName?: string;
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

/** How the open connection was made. */
type Link = 'paired' | 'unpaired' | 'unpaired-old-app';

const DEFAULT_TIMEOUT_MS = 30_000;
export const CLIENT_NAME = 'Toone Connector';

/**
 * One loopback WebSocket to the Toone app. Connects on first use and reconnects after a drop.
 * With a stored pairing it authenticates and checks that the app holds the same pairing; without
 * one it asks Toone to pair (when `autoPair`), or connects unpaired to a Toone that allows it.
 */
export class BridgeClient {
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private readonly pending = new Map<string, Pending>();
  private link: Link | null = null;
  private pairing: PairingSession | null = null;
  private declined = false;
  /** Increases with every new connection; conversations opened on an older one must be opened again. */
  generation = 0;

  constructor(
    private readonly port: number,
    private readonly options: BridgeClientOptions = {},
  ) {}

  get url(): string {
    return `ws://localhost:${this.port}`;
  }

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

  /** Opens (or reuses) the connection and returns its generation. */
  async connectionGeneration(): Promise<number> {
    await this.open();
    return this.generation;
  }

  /** True while the open connection is a paired one. */
  get paired(): boolean {
    return this.link === 'paired';
  }

  /** A sentence to add to answers given over an unpaired connection. */
  connectionNote(): string | undefined {
    if (this.link === 'unpaired-old-app') {
      return 'Note: connected to Toone without pairing, because this Toone version cannot pair yet. Any program on this Mac can use the same connection. After updating Toone, the connector asks to pair.';
    }
    if (this.link === 'unpaired') {
      return 'Note: this connector is not paired with Toone, so Toone cannot tell it apart from other programs on this Mac. Run `toone-connector pair` to pair it.';
    }
    return undefined;
  }

  async close(): Promise<void> {
    this.pairing?.close();
    this.pairing = null;
    this.socket?.close();
    this.socket = null;
    this.opening = null;
    this.link = null;
  }

  private open(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.opening) return this.opening;
    const opening = this.connect().then((socket) => this.adopt(socket));
    this.opening = opening;
    void opening.then(
      () => this.forget(opening),
      () => this.forget(opening),
    );
    return opening;
  }

  private forget(opening: Promise<WebSocket>): void {
    if (this.opening === opening) this.opening = null;
  }

  private adopt(socket: WebSocket): WebSocket {
    this.socket = socket;
    this.generation += 1;
    socket.on('message', (raw) => this.receive(raw.toString()));
    socket.on('close', () => this.dropped(socket));
    return socket;
  }

  private async connect(): Promise<WebSocket> {
    const credential = this.options.credentials?.load();
    if (credential) return this.connectPaired(credential);
    const oldApp = this.options.autoPair === true && (await this.askToPair()) === 'unsupported';
    return this.connectUnpaired(oldApp ? 'unpaired-old-app' : 'unpaired');
  }

  /** Starts pairing and throws the message to show; returns only when this Toone cannot pair. */
  private async askToPair(): Promise<'unsupported'> {
    if (this.declined) {
      throw new ConnectorError('PAIRING_DENIED', 'You declined this connector in Toone. To try again, run `toone-connector pair` in a terminal.');
    }
    if (this.pairing) throw pendingError(this.pairing.code);
    const session = await startPairing(this.url, this.options.clientName ?? CLIENT_NAME, 'control');
    if (session === 'unsupported') return session;
    this.pairing = session;
    void session.decision.then((decision) => this.settle(session, decision));
    throw pendingError(session.code);
  }

  private settle(session: PairingSession, decision: PairDecision): void {
    if (this.pairing === session) this.pairing = null;
    session.close();
    if (decision.status === 'denied') this.declined = true;
    if (decision.status !== 'approved') return;
    try {
      this.options.credentials?.save({ clientId: decision.clientId, secret: decision.secret, scope: decision.scope, pairedAt: new Date().toISOString() });
    } catch {
      // Not being able to save means Toone asks again next time.
    }
  }

  private async connectPaired(credential: StoredCredential): Promise<WebSocket> {
    const handshake = pairedHandshake(credential);
    try {
      const socket = await openSocket(this.url, [BRIDGE_SUBPROTOCOL], handshake.headers, (headers) => verifiesServer(handshake.expectedServerProof, headers));
      this.link = 'paired';
      return socket;
    } catch (error) {
      throw pairedFailure(error, this.url, this.port);
    }
  }

  private async connectUnpaired(link: Link): Promise<WebSocket> {
    try {
      const socket = await openSocket(this.url, [], {});
      this.link = link;
      return socket;
    } catch (error) {
      if (error instanceof OpenFailure && error.kind === 'rejected') {
        throw new ConnectorError('PAIRING_REQUIRED', 'Toone only lets paired apps connect. Run `toone-connector pair` in a terminal and allow it in Toone.');
      }
      throw notRunning(this.url);
    }
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
      waiting.reject(refusal(reply.error, reply.errorCode));
      return;
    }
    const payload = decode(inner?.payload);
    if (inner?.status && inner.status !== 'ok') {
      waiting.reject(refusal(describe(payload) ?? inner.message, codeOf(payload)));
      return;
    }
    waiting.resolve(payload);
  }

  private dropped(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.link = null;
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new ConnectorError('APP_NOT_RUNNING', 'The connection to Toone closed. Is the app still open?'));
      this.pending.delete(id);
    }
  }
}

function pendingError(code: string): ConnectorError {
  return new ConnectorError(
    'PAIRING_PENDING',
    `Toone is asking you to allow this connector. In the Toone app, check that the code is ${code}, choose what the connector may do, and click Allow. Then ask again.`,
  );
}

function pairedFailure(error: unknown, url: string, port: number): ConnectorError {
  const kind = error instanceof OpenFailure ? error.kind : 'other';
  if (kind === 'not-running') return notRunning(url);
  if (kind === 'rejected') {
    return new ConnectorError(
      'PAIRING_REJECTED',
      'Toone did not accept this connector\'s pairing. It may have been revoked in Toone (Settings › Connected Apps). Run `toone-connector pair` to pair again.',
    );
  }
  return new ConnectorError(
    'APP_NOT_VERIFIED',
    `The program on port ${port} could not prove it is the Toone app this connector is paired with, so the connector did not talk to it. If Toone was reinstalled or replaced by an older version, run \`toone-connector pair\` again.`,
  );
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
    const p = payload as { message?: unknown };
    if (typeof p.message === 'string') return p.message;
  }
  return undefined;
}

export const READ_ONLY_MESSAGE =
  'This connector is paired read only, so Toone refused it. To allow it, run `toone-connector pair` in a terminal and choose "May start and control routines" in Toone (then revoke the old entry in Settings › Connected Apps).';

/** Toone's refusal as an error the person can act on; Toone's own code stays on it. */
function refusal(message: string | undefined, code: string | undefined): ConnectorError {
  if (code === 'PAIRED_READ_ONLY') return new ConnectorError('PAIRED_READ_ONLY', READ_ONLY_MESSAGE, code);
  return new ConnectorError('APP_ERROR', appMessage(message, code), code);
}

function codeOf(payload: unknown): string | undefined {
  const code = payload && typeof payload === 'object' ? (payload as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
}

function appMessage(message: string | undefined, code: string | undefined): string {
  const text = message ?? 'Toone refused the request.';
  return code ? `Toone: ${text} (${code})` : `Toone: ${text}`;
}
