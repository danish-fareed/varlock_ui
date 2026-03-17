function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLineEnding(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function getAssignmentRegex(key: string): RegExp {
  return new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=(.*)$`);
}

export function getEnvValue(content: string, key: string): string | null {
  const regex = getAssignmentRegex(key);

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(regex);
    if (match) {
      return match[1] ?? "";
    }
  }

  return null;
}

export function upsertEnvValue(content: string, key: string, value: string): string {
  const lineEnding = getLineEnding(content);
  const hadTrailingNewline = content.endsWith("\n");
  const regex = getAssignmentRegex(key);
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];

  let replaced = false;
  const nextLines = lines.map((line) => {
    if (replaced) {
      return line;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return line;
    }

    if (regex.test(line)) {
      replaced = true;
      return `${key}=${value}`;
    }

    return line;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push(`${key}=${value}`);
    } else if (nextLines.length === 0) {
      nextLines.push(`${key}=${value}`);
    } else {
      nextLines.splice(nextLines.length - 1, 0, `${key}=${value}`);
    }
  }

  const joined = nextLines.join(lineEnding);
  if (joined.length === 0) {
    return `${key}=${value}${lineEnding}`;
  }

  return hadTrailingNewline || !replaced ? `${joined}${lineEnding}` : joined;
}

export function getSourceFileName(source: string | null): string | null {
  if (!source) {
    return null;
  }

  const normalized = source.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? null;
}

export function deleteEnvValue(content: string, key: string): string {
  if (!content) return "";
  
  const lineEnding = getLineEnding(content);
  const regex = getAssignmentRegex(key);
  const lines = content.split(/\r?\n/);

  const nextLines: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith("#")) {
      nextLines.push(line);
      i++;
      continue;
    }

    const match = line.match(regex);
    if (match) {
      // Key found. Let's see if the value starts with a quote and doesn't end with it on the same line.
      const value = match[1]?.trim() || "";
      let skipCount = 1;
      
      if (value.startsWith('"') || value.startsWith("'")) {
        const quoteType = value.charAt(0);
        // If it does not end with the quote (or is just one character), it may be multiline
        if (value.length === 1 || !value.endsWith(quoteType)) {
          while (i + skipCount < lines.length) {
            const nextLine = lines[i + skipCount]!;
            const nextTrimmed = nextLine.trim();
            if (nextTrimmed.endsWith(quoteType)) {
              skipCount++;
              break;
            }
            skipCount++;
          }
        }
      }
      // Skip the lines belonging to this key
      i += skipCount;
    } else {
      nextLines.push(line);
      i++;
    }
  }

  const joined = nextLines.join(lineEnding);
  if (joined.length === 0) return "";
  return joined;
}
