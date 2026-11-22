import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import WebSocket from 'ws';
import { ConnectorError } from '../../../domain/errors.js';
import type { PairScope } from '../../../domain/pairing.js';
import type { StoredCredential } from './credential-store.js';

/**
 * The Toone app's side of the handshake lives in the app. Here: a paired connection proves the
 * secret with HMAC-SHA256(secret, "client:" + nonce) and accepts the app only if it answers with
 * HMAC-SHA256(secret, "server:" + nonce). A pairing socket carries no secret yet.
 */
export const BRIDGE_SUBPROTOCOL = 'toone.bridge.v1';
export const PAIR_SUBPROTOCOL = 'toone.pair.v1';
const NONCE_HEADER = 'X-Toone-Bridge-Nonce';
const PROOF_HEADER = 'X-Toone-Bridge-Proof';
const CLIENT_HEADER = 'X-Toone-Bridge-Client';
const SERVER_PROOF_HEADER = 'x-toone-bridge-server-proof';
const OPEN_TIMEOUT_MS = 5_000;
const REPLY_TIMEOUT_MS = 10_000;

function mac(secret: string, message: string): string {
  return createHmac('sha256', Buffer.from(secret, 'hex')).update(message, 'utf8').digest('hex');
}

export function pairedHandshake(credential: Pick<StoredCredential, 'clientId' | 'secret'>, nonce = randomBytes(32).toString('hex')) {
  return {
    headers: { [NONCE_HEADER]: nonce, [PROOF_HEADER]: mac(credential.secret, `client:${nonce}`), [CLIENT_HEADER]: credential.clientId },
    expectedServerProof: mac(credential.secret, `server:${nonce}`),
  };
}

export function verifiesServer(expectedServerProof: string, headers: IncomingHttpHeaders): boolean {
  const proof = headers[SERVER_PROOF_HEADER];
  if (headers['sec-websocket-protocol'] !== BRIDGE_SUBPROTOCOL || typeof proof !== 'string') return false;
  const expected = Buffer.from(expectedServerProof, 'utf8');
  const presented = Buffer.from(proof.toLowerCase(), 'utf8');
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}

/** Why a socket did not open, in the terms the connector acts on. */
export type OpenFailureKind = 'not-running' | 'rejected' | 'no-subprotocol' | 'not-verified' | 'other';

export class OpenFailure extends Error {
  constructor(readonly kind: OpenFailureKind, message: string) {
    super(message);
    this.name = 'OpenFailure';
  }
}

function classify(error: Error & { code?: string }): OpenFailureKind {
  if (error.code === 'ECONNREFUSED') return 'not-running';
  if (/Unexpected server response/i.test(error.message)) return 'rejected';
  if (/subprotocol/i.test(error.message)) return 'no-subprotocol';
  return 'other';
}

/** Opens one socket. `verify` decides on the upgrade response; a failed check closes it unused. */
export function openSocket(
  url: string,
  protocols: string[],
  headers: Record<string, string>,
  verify?: (headers: IncomingHttpHeaders) => boolean,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, protocols, { headers, handshakeTimeout: OPEN_TIMEOUT_MS });
    let verified = verify === undefined;
    socket.on('error', () => {}); // later errors surface as 'close'
    socket.once('upgrade', (response) => {
      verified = verify ? verify(response.headers) : true;
    });
    socket.once('open', () => {
      if (verified) return resolve(socket);
      socket.terminate();
      reject(new OpenFailure('not-verified', 'The server did not prove it holds the pairing.'));
    });
    socket.once('error', (error: Error) => reject(new OpenFailure(classify(error), error.message)));
  });
}

export type PairDecision =
  | { status: 'approved'; clientId: string; secret: string; scope: PairScope }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'failed'; message: string };

/** One open pairing request: the code to show, and the person's answer when it comes. */
export interface PairingSession {
  code: string;
  expiresAt: string;
  decision: Promise<PairDecision>;
  close(): void;
}

interface PairingReply {
  id?: string;
  success?: boolean;
  error?: string;
  errorCode?: string;
  pairing?: { status?: string; requestId?: string; code?: string; expiresAt?: string; clientId?: string; secret?: string; scope?: string };
}

/**
 * Asks Toone to pair. Resolves 'unsupported' when the app on the port cannot pair (an older
 * Toone accepts the socket without the pairing subprotocol).
 */
export async function startPairing(url: string, name: string, scope: PairScope): Promise<PairingSession | 'unsupported'> {
  let socket: WebSocket;
  try {
    socket = await openSocket(url, [PAIR_SUBPROTOCOL], {}, (headers) => headers['sec-websocket-protocol'] === PAIR_SUBPROTOCOL);
  } catch (error) {
    if (error instanceof OpenFailure && error.kind === 'not-running') throw notRunning(url);
    return 'unsupported';
  }
  const replies = new Map<string, (reply: PairingReply) => void>();
  socket.on('message', (raw) => {
    const reply = decode(raw.toString());
    if (reply?.id) replies.get(reply.id)?.(reply);
  });
  const first = await waitFor(socket, replies, '1', () => socket.send(JSON.stringify({ id: '1', pairing: { op: 'request', name, scope } })));
  const body = first.pairing;
  if (!first.success || body?.status !== 'pending' || !body.code || !body.requestId) {
    socket.close();
    throw refusal(first);
  }
  const decision = new Promise<PairDecision>((resolve) => {
    replies.set('2', (reply) => resolve(toDecision(reply)));
    socket.once('close', () => resolve({ status: 'failed', message: 'The connection to Toone closed before you answered.' }));
  });
  socket.send(JSON.stringify({ id: '2', pairing: { op: 'await', requestId: body.requestId } }));
  return { code: body.code, expiresAt: body.expiresAt ?? '', decision, close: () => socket.close() };
}

function waitFor(socket: WebSocket, replies: Map<string, (reply: PairingReply) => void>, id: string, send: () => void): Promise<PairingReply> {
  return new Promise((resolve, reject) => {
    const fail = (): void => reject(new ConnectorError('APP_NOT_RUNNING', 'The connection to Toone closed while asking to pair.'));
    const timer = setTimeout(() => {
      socket.close();
      reject(new ConnectorError('TIMEOUT', 'Toone did not answer the pairing request.'));
    }, REPLY_TIMEOUT_MS);
    socket.once('close', fail);
    replies.set(id, (reply) => {
      clearTimeout(timer);
      socket.off('close', fail);
      resolve(reply);
    });
    send();
  });
}

function toDecision(reply: PairingReply): PairDecision {
  const body = reply.pairing;
  if (!reply.success) return { status: 'failed', message: reply.error ?? 'Toone could not finish pairing.' };
  if (body?.status === 'approved' && body.clientId && body.secret && /^[0-9a-f]{64}$/.test(body.secret)) {
    return { status: 'approved', clientId: body.clientId, secret: body.secret, scope: body.scope === 'control' ? 'control' : 'read' };
  }
  return body?.status === 'denied' ? { status: 'denied' } : { status: 'expired' };
}

function refusal(reply: PairingReply): ConnectorError {
  if (reply.errorCode === 'PAIRING_BUSY') {
    return new ConnectorError('PAIRING_BUSY', 'Toone is already asking about another app. Answer that in Toone, then try again.');
  }
  return new ConnectorError('APP_ERROR', `Toone: ${reply.error ?? 'the pairing request was refused.'}${reply.errorCode ? ` (${reply.errorCode})` : ''}`);
}

export function notRunning(url: string): ConnectorError {
  const port = url.split(':').pop() ?? '';
  return new ConnectorError(
    'APP_NOT_RUNNING',
    `Could not reach the Toone app on this Mac (port ${port}). Open Toone and try again. The App Store edition cannot be reached by connectors.`,
  );
}

function decode(text: string): PairingReply | null {
  try {
    return JSON.parse(text) as PairingReply;
  } catch {
    return null;
  }
}
