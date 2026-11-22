import { createHmac } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type WebSocket, WebSocketServer } from 'ws';

/**
 * A stand-in for the Toone app's loopback bridge, speaking the pairing and handshake wire format
 * (the app's design note describes it). 'current' pairs; 'old' is a Toone from before pairing.
 */
export interface FakeOptions {
  version: 'current' | 'old';
  /** Unpaired callers accepted ("Only allow paired apps to connect" off). */
  allowUnpaired?: boolean;
  /** Paired programs Toone knows: client id → secret. */
  paired?: Record<string, string>;
  /** Answer with a server proof made from the wrong secret (a port squatter). */
  forgeServerProof?: boolean;
}

export interface Received {
  kind: 'paired' | 'unpaired';
  message: { id: string; command?: { command: string; params: Record<string, unknown> } };
}

const SECRET = 'ab'.repeat(32);
const mac = (secret: string, message: string): string => createHmac('sha256', Buffer.from(secret, 'hex')).update(message, 'utf8').digest('hex');

export class FakeToone {
  readonly received: Received[] = [];
  readonly pairingRequests: { name: string; scope: string }[] = [];
  private readonly server: WebSocketServer;
  private waiting: ((decision: 'approved' | 'denied' | 'expired', scope: 'read' | 'control') => void) | null = null;
  readonly issuedSecret = SECRET;
  readonly ready: Promise<void>;

  constructor(private readonly options: FakeOptions) {
    this.server = new WebSocketServer({
      port: 0,
      handleProtocols: (protocols) => this.selectProtocol(protocols),
      verifyClient: (info, done) => this.verify(info.req, done),
    });
    this.server.on('headers', (headers, req) => {
      const proof = (req as IncomingMessage & { serverProof?: string }).serverProof;
      if (proof) headers.push(`X-Toone-Bridge-Server-Proof: ${proof}`);
    });
    this.server.on('connection', (socket, req) => this.serve(socket, req));
    this.ready = new Promise((resolve) => this.server.once('listening', () => resolve()));
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  /** The person answers the open pairing request in Toone. */
  decide(decision: 'approved' | 'denied' | 'expired', scope: 'read' | 'control' = 'control'): void {
    this.waiting?.(decision, scope);
    this.waiting = null;
  }

  get hasOpenRequest(): boolean {
    return this.waiting !== null;
  }

  close(): Promise<void> {
    for (const client of this.server.clients) client.terminate();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private selectProtocol(protocols: Set<string>): string | false {
    if (this.options.version === 'old') return false;
    if (protocols.has('toone.pair.v1')) return 'toone.pair.v1';
    if (protocols.has('toone.bridge.v1')) return 'toone.bridge.v1';
    return false;
  }

  private verify(req: IncomingMessage, done: (ok: boolean, code?: number) => void): void {
    if (this.options.version === 'old' || req.headers['origin']) return done(this.options.version === 'old' && !req.headers['origin']);
    const protocols = String(req.headers['sec-websocket-protocol'] ?? '');
    if (protocols.includes('toone.pair.v1')) return done(true);
    if (!protocols.includes('toone.bridge.v1')) return done(this.options.allowUnpaired === true, 403);
    const client = String(req.headers['x-toone-bridge-client'] ?? '');
    const nonce = String(req.headers['x-toone-bridge-nonce'] ?? '');
    const secret = this.options.paired?.[client];
    if (!secret || req.headers['x-toone-bridge-proof'] !== mac(secret, `client:${nonce}`)) return done(false, 403);
    const proofSecret = this.options.forgeServerProof ? 'cd'.repeat(32) : secret;
    (req as IncomingMessage & { serverProof?: string }).serverProof = mac(proofSecret, `server:${nonce}`);
    (req as IncomingMessage & { paired?: boolean }).paired = true;
    done(true);
  }

  private serve(socket: WebSocket, req: IncomingMessage): void {
    if (socket.protocol === 'toone.pair.v1') {
      socket.on('message', (raw) => this.pairing(socket, JSON.parse(raw.toString())));
      return;
    }
    const kind = (req as IncomingMessage & { paired?: boolean }).paired ? 'paired' : 'unpaired';
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Received['message'];
      this.received.push({ kind, message });
      const payload = message.command?.params['op'] === 'desktop_workspaces' ? { workspaces: [] } : { threadId: 't-1', agentId: 'operator' };
      socket.send(JSON.stringify({ id: message.id, success: true, data: { type: 'agent_result', data: { status: 'ok', payload: JSON.stringify(payload) } } }));
    });
  }

  private pairing(socket: WebSocket, message: { id: string; pairing?: { op: string; name?: string; scope?: string } }): void {
    const body = message.pairing;
    if (body?.op === 'request') {
      this.pairingRequests.push({ name: body.name ?? '', scope: body.scope ?? '' });
      socket.send(JSON.stringify({ id: message.id, success: true, pairing: { status: 'pending', requestId: 'req-1', code: '482913', expiresAt: '2026-11-22T20:00:00Z' } }));
      return;
    }
    if (body?.op === 'await') {
      this.waiting = (decision, scope) => {
        const pairing = decision === 'approved' ? { status: 'approved', clientId: 'client-1', secret: SECRET, scope } : { status: decision };
        if (decision === 'approved') this.options.paired = { ...this.options.paired, 'client-1': SECRET };
        socket.send(JSON.stringify({ id: message.id, success: true, pairing }));
      };
    }
  }
}

export async function started(options: FakeOptions): Promise<FakeToone> {
  const fake = new FakeToone(options);
  await fake.ready;
  return fake;
}
