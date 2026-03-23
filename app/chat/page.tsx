import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ChatPageClient } from '@/components/chat/chat-page-client';

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[50dvh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          加载聊天…
        </div>
      }
    >
      <ChatPageClient />
    </Suspense>
  );
}
