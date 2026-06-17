import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';

export interface AnthropicRequest {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
}

const STUB_RESPONSE = {
  id: 'msg_stub',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: '🔴 CRITICAL: FIN-001 float arithmetic on monetary value\n- File: bad-payment.ts\n- Line: +  const total = price * quantity;\n- Fix: Use `new Decimal(price).mul(quantity)` from decimal.js',
    },
  ],
  model: 'claude-sonnet-4-6',
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 50 },
};

export interface StubServer {
  readonly lastRequest: AnthropicRequest | null;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
}

export function createStubServer(port = 3001): StubServer {
  let lastRequest: AnthropicRequest | null = null;
  let server: Server | null = null;

  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req: Request, res: Response) => {
    lastRequest = req.body as AnthropicRequest;
    res.json(STUB_RESPONSE);
  });

  return {
    get lastRequest() {
      return lastRequest;
    },
    reset() {
      lastRequest = null;
    },
    start(): Promise<void> {
      return new Promise(resolve => {
        server = createServer(app).listen(port, resolve);
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!server) return resolve();
        server.close(err => (err ? reject(err) : resolve()));
      });
    },
  };
}
