'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import type { NotebookProblemImportDraft } from '@/lib/problem-bank';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';
import { problemDraftToPatch, problemRecordToDraft } from '@/lib/problem-bank/editor';
import { ProblemDraftForm } from '@/components/problem-bank/problem-draft-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Locale = 'zh-CN' | 'en-US';

export function ProblemEditDialog({
  open,
  onOpenChange,
  locale,
  problem,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  problem: NotebookProblemClientRecord | null;
  onSave: (patch: ReturnType<typeof problemDraftToPatch>) => Promise<void>;
}) {
  const draft = useMemo(() => (problem ? problemRecordToDraft(problem) : null), [problem]);
  const [saving, setSaving] = useState(false);

  const handleSave = async (nextDraft: NotebookProblemImportDraft) => {
    setSaving(true);
    try {
      await onSave(problemDraftToPatch(nextDraft));
      toast.success(locale === 'zh-CN' ? '题目已更新' : 'Problem updated');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{locale === 'zh-CN' ? '编辑题目' : 'Edit problem'}</DialogTitle>
          <DialogDescription>
            {locale === 'zh-CN'
              ? '直接修改题型、题面和评分规则，保存后会更新到题库。'
              : 'Update the type, statement, and grading rules, then save the changes.'}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <div className="space-y-4">
            <ProblemDraftForm
              key={draft.draftId}
              draft={draft}
              locale={locale}
              onSave={handleSave}
              saveLabel={locale === 'zh-CN' ? '保存修改' : 'Save changes'}
            />
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {locale === 'zh-CN' ? '保存中…' : 'Saving...'}
                  </>
                ) : locale === 'zh-CN' ? (
                  '关闭'
                ) : (
                  'Close'
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
