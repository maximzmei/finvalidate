import Anthropic from "@anthropic-ai/sdk";

export const NO_VIOLATIONS_SENTINEL = "No fintech rule violations detected";

export async function callClaude(
  apiKey: string,
  model: string,
  diff: string,
  systemPrompt: string,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Review this pull request diff for fintech rule violations:\n\n${diff}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") return `✅ ${NO_VIOLATIONS_SENTINEL}.`;
  return block.text;
}
