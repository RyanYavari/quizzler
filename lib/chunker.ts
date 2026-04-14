interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const { chunkSize = 500, chunkOverlap = 50 } = options;

  if (!text || text.trim().length === 0) return [];

  const separators = ['\n\n', '\n', '. ', ' '];
  const chunks: string[] = [];

  function splitRecursive(text: string, sepIndex: number): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    if (sepIndex >= separators.length) {
      // Hard split at chunkSize
      const parts: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        parts.push(text.slice(i, i + chunkSize));
      }
      return parts;
    }

    const sep = separators[sepIndex];
    const segments = text.split(sep);

    if (segments.length === 1) {
      return splitRecursive(text, sepIndex + 1);
    }

    const result: string[] = [];
    let current = '';

    for (const segment of segments) {
      const addition = current ? sep + segment : segment;
      if ((current + addition).length > chunkSize && current) {
        result.push(current);
        // Overlap: keep the end of the current chunk
        const overlapText = current.slice(-chunkOverlap);
        current = overlapText + sep + segment;
      } else {
        current = current ? current + sep + segment : segment;
      }
    }

    if (current) {
      result.push(current);
    }

    // Recursively split any chunks that are still too large
    const finalResult: string[] = [];
    for (const chunk of result) {
      if (chunk.length > chunkSize) {
        finalResult.push(...splitRecursive(chunk, sepIndex + 1));
      } else {
        finalResult.push(chunk);
      }
    }

    return finalResult;
  }

  const rawChunks = splitRecursive(text.trim(), 0);

  for (const chunk of rawChunks) {
    const trimmed = chunk.trim();
    if (trimmed.length > 0) {
      chunks.push(trimmed);
    }
  }

  return chunks;
}
