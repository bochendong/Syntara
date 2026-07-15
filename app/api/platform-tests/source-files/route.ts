import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';

const QUEUE_ROOT = path.resolve(process.cwd(), 'queue');
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.pptx', '.docx', '.md', '.txt']);

function safeQueuePath(relativePath: string): string | null {
  const candidate = path.resolve(QUEUE_ROOT, relativePath);
  if (candidate === QUEUE_ROOT || !candidate.startsWith(`${QUEUE_ROOT}${path.sep}`)) return null;
  return candidate;
}

async function listQueueFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listQueueFiles(absolutePath, relativePath)));
    } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(relativePath);
    }
  }
  return files;
}

function contentTypeForFile(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (extension === '.md') return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

export async function GET(request: NextRequest) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const requestedPath = request.nextUrl.searchParams.get('file')?.trim();
    if (!requestedPath) {
      const files = (await listQueueFiles(QUEUE_ROOT)).sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ files });
    }

    const absolutePath = safeQueuePath(requestedPath);
    if (!absolutePath || !ALLOWED_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      return NextResponse.json({ error: 'Invalid queue test file path' }, { status: 400 });
    }
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      return NextResponse.json({ error: 'Queue test file not found' }, { status: 404 });
    }
    const buffer = await fs.readFile(absolutePath);
    return new NextResponse(buffer, {
      headers: {
        'content-type': contentTypeForFile(absolutePath),
        'content-length': String(buffer.byteLength),
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(absolutePath))}`,
        'cache-control': 'no-store',
      },
    });
  });
}
