import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk");

import Anthropic from "@anthropic-ai/sdk";
import { callClaude } from "../claude";

const mockCreate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Anthropic).mockImplementation(
    () =>
      ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>,
  );
});

describe("callClaude", () => {
  it("returns text content from response block", async () => {
    // spec: callClaude — returns text from response block
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "🔴 CRITICAL: Using number for money" }],
    });

    const result = await callClaude(
      "test-key",
      "claude-sonnet-4-6",
      "diff content",
      "test system prompt",
    );

    expect(result).toBe("🔴 CRITICAL: Using number for money");
  });

  it("passes systemPrompt as the system field to Anthropic", async () => {
    // spec: callClaude — systemPrompt parameter is forwarded to messages.create as system field
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "✅ No fintech rule violations detected." },
      ],
    });

    await callClaude("test-key", "model", "diff", "custom prompt");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ system: "custom prompt" }),
    );
  });

  it("returns default no-violations string if block type is not text", async () => {
    // spec: callClaude — returns "no violations" fallback if block.type !== 'text'
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
    });

    const result = await callClaude("test-key", "model", "diff", "prompt");

    expect(result).toBe("✅ No fintech rule violations detected.");
  });

  it("propagates errors from Anthropic client", async () => {
    // spec: callClaude — throws if Anthropic client throws (propagates to index.ts → core.setFailed)
    mockCreate.mockRejectedValue(new Error("API rate limit exceeded"));

    await expect(
      callClaude("test-key", "model", "diff", "prompt"),
    ).rejects.toThrow("API rate limit exceeded");
  });
});
