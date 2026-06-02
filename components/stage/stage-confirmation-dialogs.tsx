import { AlertTriangle } from 'lucide-react';
import { VisuallyHidden } from 'radix-ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function StageConfirmationDialogs({
  pendingSceneId,
  onCancelSceneSwitch,
  onConfirmSceneSwitch,
  editEntryConfirmOpen,
  onEditEntryConfirmOpenChange,
  onConfirmEditEntry,
  labels,
}: {
  pendingSceneId: string | null;
  onCancelSceneSwitch: () => void;
  onConfirmSceneSwitch: () => void;
  editEntryConfirmOpen: boolean;
  onEditEntryConfirmOpenChange: (open: boolean) => void;
  onConfirmEditEntry: () => void;
  labels: {
    confirmSwitchTitle: string;
    confirmSwitchMessage: string;
    cancel: string;
    confirm: string;
  };
}) {
  return (
    <>
      <AlertDialog
        open={!!pendingSceneId}
        onOpenChange={(open) => {
          if (!open) onCancelSceneSwitch();
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden border-0 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]">
          <VisuallyHidden.Root>
            <AlertDialogTitle>{labels.confirmSwitchTitle}</AlertDialogTitle>
          </VisuallyHidden.Root>
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />

          <div className="px-6 pt-5 pb-2 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 ring-1 ring-amber-200/50 dark:ring-amber-700/30">
              <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1.5">
              {labels.confirmSwitchTitle}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {labels.confirmSwitchMessage}
            </p>
          </div>

          <AlertDialogFooter className="px-6 pb-5 pt-3 flex-row gap-3">
            <AlertDialogCancel onClick={onCancelSceneSwitch} className="flex-1 rounded-xl">
              {labels.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmSceneSwitch}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-md shadow-amber-200/50 dark:shadow-amber-900/30"
            >
              {labels.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={editEntryConfirmOpen} onOpenChange={onEditEntryConfirmOpenChange}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>进入编辑模式？</AlertDialogTitle>
            <AlertDialogDescription>
              进入编辑会暂停当前讲解，并结束这页正在进行的互动或讨论。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmEditEntry}>继续编辑</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
