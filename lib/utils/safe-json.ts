type SafeJsonOptions = {
  space?: number;
  maxChars?: number;
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
};

const DEFAULT_OPTIONS: Required<SafeJsonOptions> = {
  space: 2,
  maxChars: 200_000,
  maxDepth: 6,
  maxArrayItems: 50,
  maxObjectKeys: 80,
  maxStringLength: 2_000,
};

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)} ...[truncated ${value.length - maxLength} chars]`;
}

function toSerializablePreview(
  value: unknown,
  options: Required<SafeJsonOptions>,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (value == null) return value;

  if (typeof value === 'string') return truncateString(value, options.maxStringLength);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return String(value);
  if (typeof value === 'function') return '[Function]';

  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown> | Array<unknown>;
    if (seen.has(objectValue)) return '[Circular]';
    if (depth >= options.maxDepth) return '[MaxDepthExceeded]';
    seen.add(objectValue);

    if (Array.isArray(value)) {
      const previewItems = value
        .slice(0, options.maxArrayItems)
        .map((item) => toSerializablePreview(item, options, seen, depth + 1));
      if (value.length > options.maxArrayItems) {
        previewItems.push(`[+${value.length - options.maxArrayItems} more items]`);
      }
      return previewItems;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const previewObject: Record<string, unknown> = {};
    for (const [key, entryValue] of entries.slice(0, options.maxObjectKeys)) {
      previewObject[key] = toSerializablePreview(entryValue, options, seen, depth + 1);
    }
    if (entries.length > options.maxObjectKeys) {
      previewObject.__truncatedKeys = `[+${entries.length - options.maxObjectKeys} more keys]`;
    }
    return previewObject;
  }

  return String(value);
}

export function safeJsonStringify(value: unknown, customOptions?: SafeJsonOptions): string {
  const options: Required<SafeJsonOptions> = {
    ...DEFAULT_OPTIONS,
    ...(customOptions ?? {}),
  };
  try {
    const preview = toSerializablePreview(value, options, new WeakSet(), 0);
    const json = JSON.stringify(preview, null, options.space);
    if (json.length <= options.maxChars) return json;
    return `${json.slice(0, options.maxChars)}\n...[truncated ${json.length - options.maxChars} chars]`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `"[Unserializable payload: ${message}]"`;
  }
}
