/**
 * ──────────────────────────────────────────────
 *  RAW TOOL CALL FILTER
 * ──────────────────────────────────────────────
 *
 * Shared utility to strip raw tool call artifacts that some AI models
 * emit as visible text instead of using the proper function_call /
 * tool_calls API.
 *
 * This is used across multiple layers of the bot as a safety net to
 * prevent raw XML/JSON from reaching the WhatsApp user.
 */

/**
 * Regex patterns for known tool call artifact formats.
 */
const TOOL_CALL_STRIP_RE = /<tool_calls\b[^>]*>[\s\S]*?(?:<\/tool_calls\s*>|$)|\{"name":"\w+","arguments":\{[^}]*\}\}|<invoke\s+name\s*=\s*"(?:web_search|web_fetch|download_social_media|download_youtube|pinterest_search|gallery_dl_sticker|pinterest_sticker|create_sticker|make_sticker|group_warning)"[\s\S]*?<\/invoke\s*>|```(?:json)?\s*\{\s*"name":\s*"\w+",\s*"arguments":[\s\S]*?```/gi;

const DSML_MARKER_RE = /<\s*\/?\s*(?:\||｜){2}\s*DSML\s*(?:\||｜){2}/i;
const STANDARD_TOOL_MARKER_RE = /<\s*\/?\s*(?:tool_calls|invoke|parameter)\b/i;
const INCOMPLETE_TOOL_MARKER_RE = /<\s*\/?\s*(?:tool_calls|invoke|parameter)\b[^>]*$/gi;
const MAX_DSML_LENGTH = 64 * 1024;
const MAX_DSML_TOOL_CALLS = 8;

export interface ParsedTextToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
/**
 * Convert model-specific DSML tags into ordinary XML-like tags.
 *
 * Example:
 *   <｜｜DSML｜｜invokename="web_fetch">
 * becomes:
 *   <invoke name="web_fetch">
 */
function normalizeDsmlMarkup(text: string): string {
  return text.replace(
    /<\s*(\/?)\s*(?:\||｜){2}\s*DSML\s*(?:\||｜){2}\s*(tool_calls|invoke|parameter)\s*/gi,
    (_match, slash: string, tag: string) => {
      if (slash) return `</${tag}`;
      return tag.toLowerCase() === 'tool_calls' ? '<tool_calls' : `<${tag} `;
    }
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/** Detect both complete and truncated textual tool-call markup. */
export function containsToolCallArtifact(text: string): boolean {
  if (!text) return false;
  const normalized = normalizeDsmlMarkup(text);
  return DSML_MARKER_RE.test(text) || STANDARD_TOOL_MARKER_RE.test(normalized);
}

/**
 * Parse DSML emitted as visible text by some OpenAI-compatible models.
 * Only explicitly registered tool names are accepted, so arbitrary model
 * text cannot turn into an executable tool call.
 */
export function parseDsmlToolCalls(
  text: string,
  allowedToolNames: ReadonlySet<string>
): ParsedTextToolCall[] {
  if (
    !text ||
    text.length > MAX_DSML_LENGTH ||
    !DSML_MARKER_RE.test(text) ||
    allowedToolNames.size === 0
  ) {
    return [];
  }

  const normalized = normalizeDsmlMarkup(text);
  const toolCalls: ParsedTextToolCall[] = [];
  const blockPattern = /<tool_calls\b[^>]*>([\s\S]*?)<\/tool_calls\s*>/gi;
  const invokePattern = /<invoke\b([^>]*)>([\s\S]*?)<\/invoke\s*>/gi;
  const parameterPattern = /<parameter\b([^>]*)>([\s\S]*?)<\/parameter\s*>/gi;

  for (const blockMatch of normalized.matchAll(blockPattern)) {
    const block = blockMatch[1];

    for (const invokeMatch of block.matchAll(invokePattern)) {
      if (toolCalls.length >= MAX_DSML_TOOL_CALLS) return toolCalls;

      const nameMatch = invokeMatch[1].match(/\bname\s*=\s*"([A-Za-z_][\w.-]*)"/i);
      const toolName = nameMatch?.[1];
      if (!toolName || !allowedToolNames.has(toolName)) continue;

      const args: Record<string, string> = {};
      let valid = true;

      for (const parameterMatch of invokeMatch[2].matchAll(parameterPattern)) {
        const parameterNameMatch = parameterMatch[1].match(
          /\bname\s*=\s*"([A-Za-z_][\w.-]*)"/i
        );
        const parameterName = parameterNameMatch?.[1];

        if (!parameterName || Object.hasOwn(args, parameterName)) {
          valid = false;
          break;
        }

        args[parameterName] = decodeXmlEntities(parameterMatch[2].trim());
      }

      // Reject malformed invocations instead of executing partially parsed input.
      const unparsedBody = invokeMatch[2].replace(parameterPattern, '').trim();
      if (!valid || unparsedBody) continue;

      toolCalls.push({
        id: `dsml_${Date.now()}_${toolCalls.length}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      });
    }
  }

  return toolCalls;
}

/**
 * Strip raw tool call artifacts from AI response text.
 * Removes XML tool blocks, JSON function call strings, and
 * cleans up leftover whitespace.
 */
export function stripToolCallArtifacts(text: string): string {
  if (!text) return text;
  return normalizeDsmlMarkup(text)
    .replace(TOOL_CALL_STRIP_RE, '')
    // Catch truncated standard tags such as the literal "<tool_calls".
    .replace(INCOMPLETE_TOOL_MARKER_RE, '')
    // Remove an incomplete DSML tag too; fail closed rather than exposing it.
    .replace(/<\/?\s*(?:\||｜){2}\s*DSML\s*(?:\||｜){2}[\s\S]*$/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
