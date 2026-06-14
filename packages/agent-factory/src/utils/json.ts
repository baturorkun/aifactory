/**
 * Extracts a JSON value from LLM output that may contain markdown code fences,
 * prose before/after the JSON, or raw JSON directly.
 */
export function extractJSON(content: string): unknown {
  // 1. Try ```json ... ``` block
  const jsonFence = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonFence?.[1]) {
    try {
      return JSON.parse(jsonFence[1]);
    } catch {
      // fall through
    }
  }

  // 2. Try ``` ... ``` block (language-agnostic)
  const anyFence = content.match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (anyFence?.[1]) {
    try {
      return JSON.parse(anyFence[1]);
    } catch {
      // fall through
    }
  }

  // 3. Try raw JSON from start
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }

  // 4. Try to find the first {...} block
  const objectMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) {
    try {
      return JSON.parse(objectMatch[1]);
    } catch {
      // fall through
    }
  }

  throw new Error(
    `Could not extract valid JSON from model output.\n` +
      `Content preview (first 400 chars):\n${content.slice(0, 400)}`,
  );
}
