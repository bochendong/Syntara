'use client';

import { CreateCourseForm } from '@/components/courses/create-course-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/notifications/client-toast';

type CreateCourseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (courseId: string) => void | Promise<void>;
};

export function CreateCourseDialog({ open, onOpenChange, onSuccess }: CreateCourseDialogProps) {
  const handleSuccess = async (courseId: string) => {
    onOpenChange(false);
    toast.success('已创建课程');
    await onSuccess?.(courseId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl border-0 bg-background p-4 shadow-xl sm:max-h-[min(90dvh,720px)] sm:w-full sm:rounded-[20px] sm:p-6 sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-lg font-semibold">新建课程</DialogTitle>
        </DialogHeader>
        <CreateCourseForm
          key={open ? 'create-course-open' : 'create-course-closed'}
          className="mt-6"
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
