import type { SchemaEntry, SchemaDecorator, SchemaVarType } from "./types";

const VALID_TYPES: SchemaVarType[] = [
  "string", "url", "port", "number", "boolean", "enum", "email", "path",
];

const SENSITIVE_KEYWORDS = [
  "secret", "password", "token", "key", "api_key", "apikey",
  "private", "credential", "auth", "jwt", "oauth", "salt", "hash",
];

/** Parse a .env.schema file into structured entries */
export function parseSchema(content: string): SchemaEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: SchemaEntry[] = [];
  let commentBlock: string[] = [];
  let commentBlockStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === "" ) {
      // Blank line resets the comment block
      commentBlock = [];
      commentBlockStart = -1;
      continue;
    }

    if (trimmed.startsWith("#")) {
      if (commentBlock.length === 0) {
        commentBlockStart = i;
      }
      commentBlock.push(trimmed);
      continue;
    }

    // Try to parse as KEY=VALUE
    const assignMatch = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assignMatch) {
      const key = assignMatch[1]!;
      const rawValue = assignMatch[2] ?? "";
      const decorators = parseDecorators(commentBlock);
      const description = parseDescription(commentBlock);

      const entry: SchemaEntry = {
        key,
        baseValue: rawValue,
        type: resolveType(decorators, key, rawValue),
        required: resolveRequired(decorators),
        sensitive: resolveSensitive(decorators, key),
        description,
        enumValues: resolveEnumValues(decorators),
        decorators,
        lineStart: commentBlockStart >= 0 ? commentBlockStart + 1 : i + 1,
        lineEnd: i + 1,
      };

      entries.push(entry);
      commentBlock = [];
      commentBlockStart = -1;
    }
  }

  return entries;
}

/** Parse decorator comments from a comment block */
function parseDecorators(comments: string[]): SchemaDecorator[] {
  const decorators: SchemaDecorator[] = [];

  for (const comment of comments) {
    // Strip leading # and whitespace
    const text = comment.replace(/^#\s*/, "");
    // Match @decorator or @decorator=value or @decorator(value)
    const decoratorMatch = text.match(/^@(\w+)(?:=(.+)|(\(.*\)))?$/);
    if (decoratorMatch) {
      const name = decoratorMatch[1]!;
      const value = decoratorMatch[2] ?? decoratorMatch[3] ?? null;
      decorators.push({ name, value });
    }
  }

  return decorators;
}

/** Extract description from comment lines (non-decorator comments) */
function parseDescription(comments: string[]): string {
  const descLines: string[] = [];

  for (const comment of comments) {
    const text = comment.replace(/^#\s*/, "");
    // Skip decorators
    if (text.startsWith("@")) continue;
    // Skip empty comment lines
    if (text.trim() === "") continue;
    descLines.push(text.trim());
  }

  return descLines.join(" ");
}

/** Resolve the variable type from decorators or inference */
function resolveType(decorators: SchemaDecorator[], key: string, value: string): SchemaVarType {
  // Check explicit @type decorator
  for (const d of decorators) {
    if (d.name === "type" && d.value) {
      // Handle @type=enum(...) 
      const enumMatch = d.value.match(/^enum\(.*\)$/);
      if (enumMatch) return "enum";
      const cleaned = d.value.replace(/[()]/g, "").toLowerCase();
      if (VALID_TYPES.includes(cleaned as SchemaVarType)) {
        return cleaned as SchemaVarType;
      }
    }
  }

  // Infer from key name
  const lowerKey = key.toLowerCase();
  if (lowerKey.includes("url") || lowerKey.includes("endpoint") || lowerKey.includes("host")) return "url";
  if (lowerKey.includes("port")) return "port";
  if (lowerKey === "true" || lowerKey === "false" || lowerKey.includes("enable") || lowerKey.includes("debug")) return "boolean";

  // Infer from value
  if (value.match(/^https?:\/\//)) return "url";
  if (value.match(/^\d{2,5}$/) && parseInt(value) > 0 && parseInt(value) <= 65535) return "port";
  if (value === "true" || value === "false") return "boolean";
  if (value.match(/^\d+$/)) return "number";

  return "string";
}

/** Resolve required flag from decorators (default: true) */
function resolveRequired(decorators: SchemaDecorator[]): boolean {
  for (const d of decorators) {
    if (d.name === "optional") return false;
    if (d.name === "required") return true;
  }
  return true;
}

/** Resolve sensitive flag from decorators or key name inference */
function resolveSensitive(decorators: SchemaDecorator[], key: string): boolean {
  for (const d of decorators) {
    if (d.name === "sensitive" || d.name === "secret") return true;
  }
  // Conservative inference from key name
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lowerKey.includes(kw));
}

/** Extract enum values from @type=enum(...) decorator */
function resolveEnumValues(decorators: SchemaDecorator[]): string[] {
  for (const d of decorators) {
    if (d.name === "type" && d.value) {
      const enumMatch = d.value.match(/^enum\((.+)\)$/);
      if (enumMatch) {
        return enumMatch[1]!
          .split(",")
          .map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
      }
    }
  }
  return [];
}

/** Serialize a SchemaEntry back to .env.schema text block */
export function serializeSchemaEntry(entry: SchemaEntry): string {
  const lines: string[] = [];

  // Description
  if (entry.description) {
    lines.push(`# ${entry.description}`);
  }

  // Type decorator (only if not default string)
  if (entry.type !== "string") {
    if (entry.type === "enum" && entry.enumValues.length > 0) {
      lines.push(`# @type=enum(${entry.enumValues.join(", ")})`);
    } else {
      lines.push(`# @type=${entry.type}`);
    }
  }

  // Required/optional
  if (!entry.required) {
    lines.push("# @optional");
  }

  // Sensitive
  if (entry.sensitive) {
    lines.push("# @sensitive");
  }

  // Key=value
  lines.push(`${entry.key}=${entry.baseValue}`);

  return lines.join("\n");
}

/** Serialize a full set of schema entries back to .env.schema content */
export function serializeSchema(entries: SchemaEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map(serializeSchemaEntry).join("\n\n") + "\n";
}

/** Update a single entry in schema content, preserving other entries */
export function updateSchemaEntry(
  schemaContent: string,
  updatedEntry: SchemaEntry,
): string {
  const lineEnding = schemaContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = schemaContent.split(/\r?\n/);
  const newBlock = serializeSchemaEntry(updatedEntry);
  const newBlockLines = newBlock.split("\n");

  // Find the existing block by line range
  if (updatedEntry.lineStart > 0 && updatedEntry.lineEnd > 0) {
    const startIdx = updatedEntry.lineStart - 1;
    const endIdx = updatedEntry.lineEnd - 1;

    // Validate the range still contains our key
    const rangeText = lines.slice(startIdx, endIdx + 1).join("\n");
    if (rangeText.includes(`${updatedEntry.key}=`)) {
      const before = lines.slice(0, startIdx);
      const after = lines.slice(endIdx + 1);
      const result = [...before, ...newBlockLines, ...after];
      return result.join(lineEnding);
    }
  }

  // Fallback: find by key assignment and replace the block
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    const keyMatch = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
    if (keyMatch && keyMatch[1] === updatedEntry.key) {
      // Find where the comment block starts
      let blockStart = i;
      while (blockStart > 0 && lines[blockStart - 1]!.trim().startsWith("#")) {
        blockStart--;
      }

      const before = lines.slice(0, blockStart);
      const after = lines.slice(i + 1);
      const result = [...before, ...newBlockLines, ...after];
      return result.join(lineEnding);
    }
  }

  // Key not found: append at the end
  const hasTrailing = schemaContent.endsWith("\n");
  const separator = hasTrailing ? lineEnding : lineEnding + lineEnding;
  return schemaContent + separator + newBlock + lineEnding;
}

/** Infer sensitive status from key name using conservative keyword matching */
export function inferSensitiveFromKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lowerKey.includes(kw));
}

/** Infer variable type from key name and value */
export function inferTypeFromValue(key: string, value: string): SchemaVarType {
  return resolveType([], key, value);
}

/** Delete a schema entry and its decorator comments */
export function deleteSchemaEntry(schemaContent: string, key: string): string {
  const entries = parseSchema(schemaContent);
  const entryToDelete = entries.find(e => e.key === key);
  
  if (!entryToDelete) return schemaContent;

  const lineEnding = schemaContent.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = schemaContent.endsWith("\n");
  const lines = schemaContent.split(/\r?\n/);
  
  const startIdx = entryToDelete.lineStart - 1;
  const endIdx = entryToDelete.lineEnd - 1;
  
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx + 1);
  
  const resultLines = [...before, ...after];
  
  // Cleanup multiple empty lines generated by deletion
  const joined = resultLines.join(lineEnding);
  const cleaned = joined.replace(new RegExp(`(?:${lineEnding}){3,}`, "g"), lineEnding + lineEnding);
  
  // If the result is completely empty, just return empty string
  if (cleaned.trim() === "") return "";
  
  return cleaned.trim() + (hadTrailingNewline ? lineEnding : "");
}
