import { Suspense } from 'react';
import { AdminEntry } from '@/components/admin/admin-entry';

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-muted-foreground">
          加载管理员控制台…
        </div>
      }
    >
      <AdminEntry />
    </Suspense>
  );
}
