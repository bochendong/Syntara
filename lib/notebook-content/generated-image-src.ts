export const GENERATED_NOTEBOOKS_PUBLIC_PATH = '/generated-notebooks';

const GENERATED_NOTEBOOKS_RELATIVE_PATH = 'generated-notebooks/';
const BARE_SLIDE_IMAGE_RE = /^\.?\/?slide-\d{1,3}\.(png|jpe?g|webp|avif)$/i;

export function getGeneratedNotebookImagePathname(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed).pathname;
  } catch {
    // Keep relative paths as-is.
  }

  if (pathname.startsWith(`${GENERATED_NOTEBOOKS_PUBLIC_PATH}/`)) {
    return pathname;
  }
  if (pathname.startsWith(`.${GENERATED_NOTEBOOKS_PUBLIC_PATH}/`)) {
    return pathname.slice(1);
  }
  if (pathname.startsWith(GENERATED_NOTEBOOKS_RELATIVE_PATH)) {
    return `/${pathname}`;
  }
  if (BARE_SLIDE_IMAGE_RE.test(pathname)) {
    return pathname;
  }
  return null;
}

export function isLocalGeneratedNotebookImageSrc(src: string | null | undefined): boolean {
  return Boolean(src && getGeneratedNotebookImagePathname(src));
}

export function isGeneratedNotebookPublicPathname(pathname: string): boolean {
  return pathname.startsWith(`${GENERATED_NOTEBOOKS_PUBLIC_PATH}/`);
}
