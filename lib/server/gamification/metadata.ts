import type { Prisma } from '@/lib/server/generated-prisma';

export function isJsonObject(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getMetadataString(
  metadata: Prisma.JsonValue | null | undefined,
  key: string,
): string {
  if (!isJsonObject(metadata)) return '';
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function getMetadataStringArray(
  metadata: Prisma.JsonValue | null | undefined,
  key: string,
): string[] {
  if (!isJsonObject(metadata)) return [];
  const value = metadata[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

export function getInputMetadataString(
  metadata: Prisma.InputJsonObject | null | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function getMetadataNumber(
  metadata: Prisma.JsonValue | null | undefined,
  key: string,
): number | null {
  if (!isJsonObject(metadata)) return null;
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
