import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createStubServer } from '../stub-server';

const PORT = 3099; // not 3001 — avoids conflict if real E2E test runs alongside

describe('createStubServer', () => {
  const stub = createStubServer(PORT);

  beforeAll(() => stub.start());
  afterAll(() => stub.stop());

  it('returns Anthropic-shaped response and stores request body', async () => {
    const payload = {
      model: 'claude-sonnet-4-6',
      system: 'You are FinValidate with FIN-001 rules',
      messages: [{ role: 'user', content: 'diff content mentioning bad-payment.ts' }],
      max_tokens: 1024,
    };

    const res = await fetch(`http://localhost:${PORT}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.ok).toBe(true);
    const body = await res.json() as Record<string, unknown>;

    // Response shape
    expect((body.content as Array<{ type: string; text: string }>)[0].type).toBe('text');
    expect((body.content as Array<{ type: string; text: string }>)[0].text).toContain('🔴 CRITICAL');
    expect(body.stop_reason).toBe('end_turn');

    // Stored request
    expect(stub.lastRequest).not.toBeNull();
    expect(stub.lastRequest!.system).toContain('FIN-001');
    expect(stub.lastRequest!.messages[0].content).toContain('bad-payment.ts');
  });

  it('reset() clears lastRequest', async () => {
    expect(stub.lastRequest).not.toBeNull(); // populated by previous test
    stub.reset();
    expect(stub.lastRequest).toBeNull();
  });
});
