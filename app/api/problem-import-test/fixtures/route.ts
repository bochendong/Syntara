import path from 'node:path';
import { stat } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TESTFILE_ROOT = path.join(process.cwd(), 'testfile');

const FIXTURES = [
  {
    id: 'final-exam-mc',
    fileName: '2025_Final_Exam_MC.pdf',
    title: '选择题测试',
    description: '用于检查 PDF 选择题拆分、选项识别和答案字段。',
    kind: 'choice',
  },
  {
    id: 'final-exam-long',
    fileName: 'Final_Exam.pdf',
    title: '大题测试',
    description: '用于检查证明题、计算题、简答题等大题抽取。',
    kind: 'long-form',
  },
] as const;

export async function GET() {
  return safeRoute(async () => {
    const fixtures = await Promise.all(
      FIXTURES.map(async (fixture) => {
        try {
          const fileStat = await stat(path.join(TESTFILE_ROOT, fixture.fileName));
          return {
            ...fixture,
            fileSize: fileStat.size,
            exists: true,
            updatedAt: fileStat.mtimeMs,
          };
        } catch {
          return {
            ...fixture,
            fileSize: 0,
            exists: false,
            updatedAt: null,
          };
        }
      }),
    );

    return NextResponse.json({ fixtures });
  });
}
