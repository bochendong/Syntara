import { Prisma } from '@prisma/client';

export function replaceLoneUnicodeSurrogates(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] + value[index + 1];
        index += 1;
      } else {
        output += '\ufffd';
      }
      continue;
    }
    output += code >= 0xdc00 && code <= 0xdfff ? '\ufffd' : value[index];
  }
  return output;
}

function sanitizeJsonUnicode(value: unknown): unknown {
  if (typeof value === 'string') return replaceLoneUnicodeSurrogates(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonUnicode(item));
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value === Prisma.JsonNull || value === Prisma.DbNull || value === Prisma.AnyNull)
    return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      replaceLoneUnicodeSurrogates(key),
      sanitizeJsonUnicode(item),
    ]),
  );
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJsonUnicode(value) as Prisma.InputJsonValue;
}

export function toPrismaNullableJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (sanitizeJsonUnicode(value) as Prisma.InputJsonValue);
}
