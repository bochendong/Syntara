import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { parsePptxBuffer } from '@/lib/ppt/pptx-parser';

const log = createLogger('Parse PPTX');

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const pptxFile = formData.get('pptx') as File | null;
    if (!pptxFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No PPTX file provided');
    }

    const lowerName = pptxFile.name.toLowerCase();
    const mime = (pptxFile.type || '').toLowerCase();
    const isPptx =
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      lowerName.endsWith('.pptx');
    if (!isPptx) {
      return apiError('INVALID_REQUEST', 400, 'Only PPTX files are supported');
    }

    const arrayBuffer = await pptxFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await parsePptxBuffer({
      buffer,
      fileName: pptxFile.name,
      fileSize: pptxFile.size,
    });

    return apiSuccess({ data: result });
  } catch (error) {
    log.error('Error parsing PPTX:', error);
    return apiError('PARSE_FAILED', 500, error instanceof Error ? error.message : 'Unknown error');
  }
}
