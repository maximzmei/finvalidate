import Anthropic from "@anthropic-ai/sdk";

export async function callClaude(
  apiKey: string,
  model: string,
  diff: string,
  systemPrompt: string,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Review this pull request diff for fintech rule violations:\n\n${diff}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") return "✅ No fintech rule violations detected.";
  return block.text;
}
