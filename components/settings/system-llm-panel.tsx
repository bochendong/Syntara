'use client';

import { Bot, Info, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/lib/store/settings';

export function SystemLLMPanel() {
  const providerId = useSettingsStore((s) => s.providerId);
  const modelId = useSettingsStore((s) => s.modelId);
  const provider = useSettingsStore((s) => s.providersConfig[s.providerId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            系统模型
          </CardTitle>
          <CardDescription>普通用户统一使用站点配置的 OpenAI 模型，不再支持自定义模型或 API Key。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Provider: {provider?.name || providerId}</Badge>
            <Badge variant="secondary">Model: {modelId || 'gpt-4o-mini'}</Badge>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              系统托管
            </Badge>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>你的调用将统一走站点管理员配置的 OpenAI Key，系统会自动记录每位用户的使用量用于后续统计与计费。</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
