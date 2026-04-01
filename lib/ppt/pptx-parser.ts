import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('pptxtojson/dist/index.cjs') as {
  parse: (input: ArrayBuffer) => Promise<{
    slides?: Array<{
      note?: string;
      elements?: Array<{
        type?: string;
        content?: string;
        src?: string;
        name?: string;
        width?: number;
        height?: number;
      }>;
      layoutElements?: Array<{
        type?: string;
        content?: string;
        src?: string;
        name?: string;
        width?: number;
        height?: number;
      }>;
    }>;
  }>;
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

export type ParsedPptxImage = {
  id: string;
  src: string;
  pageNumber: number;
  description?: string;
  width?: number;
  height?: number;
};

export type ParsedPptxContent = {
  text: string;
  images: ParsedPptxImage[];
  metadata: {
    slideCount: number;
    fileName?: string;
    fileSize?: number;
    pdfImages: ParsedPptxImage[];
  };
};

export async function parsePptxBuffer(args: {
  buffer: Buffer;
  fileName?: string;
  fileSize?: number;
}): Promise<ParsedPptxContent> {
  const arrayBuffer = args.buffer.buffer.slice(
    args.buffer.byteOffset,
    args.buffer.byteOffset + args.buffer.byteLength,
  ) as ArrayBuffer;
  const ppt = await parse(arrayBuffer);

  const slides = Array.isArray(ppt?.slides) ? ppt.slides : [];
  const images: ParsedPptxImage[] = [];
  const textParts: string[] = [];

  slides.forEach((slide, slideIndex) => {
    const pageNumber = slideIndex + 1;
    const elementText: string[] = [];
    const elements = [...(slide.elements || []), ...(slide.layoutElements || [])];

    for (const element of elements) {
      if (typeof element.content === 'string' && element.content.trim()) {
        const cleaned = stripHtml(element.content);
        if (cleaned) elementText.push(cleaned);
      }

      if (element.type === 'image' && typeof element.src === 'string' && element.src.trim()) {
        images.push({
          id: `img_${images.length + 1}`,
          src: element.src,
          pageNumber,
          description: element.name?.trim() || `Slide ${pageNumber} image`,
          width: element.width,
          height: element.height,
        });
      }
    }

    const note = typeof slide.note === 'string' ? slide.note.trim() : '';
    const slideLines = [
      `Slide ${pageNumber}`,
      ...elementText,
      ...(note ? [`Notes: ${note}`] : []),
    ].filter(Boolean);
    if (slideLines.length > 0) {
      textParts.push(slideLines.join('\n'));
    }
  });

  return {
    text: textParts.join('\n\n'),
    images,
    metadata: {
      slideCount: slides.length,
      fileName: args.fileName,
      fileSize: args.fileSize,
      pdfImages: images,
    },
  };
}
