import { QUALITY_PRESETS } from './page-presets';
import type { QualityPreset } from './page-types';

export function getQualityPreset(id: string): QualityPreset {
  return QUALITY_PRESETS.find((preset) => preset.id === id) || QUALITY_PRESETS[0];
}

export const PRESET_GROUP_ORDER = ['背景封面', '通用版式', 'Tweet 课堂', '代码追踪'] as const;

export function getPresetGroupLabel(preset: QualityPreset): (typeof PRESET_GROUP_ORDER)[number] {
  if (
    preset.layoutTemplate === 'image_title_overlay' ||
    preset.layoutTemplate === 'cinematic_title_frame' ||
    preset.layoutTemplate === 'tech_hero_title'
  ) {
    return '背景封面';
  }
  if (preset.layoutTemplate === 'code_split') return '代码追踪';
  if (preset.id.startsWith('common_')) return '通用版式';
  return 'Tweet 课堂';
}

export function getPresetGroupDescription(group: (typeof PRESET_GROUP_ORDER)[number]): string {
  switch (group) {
    case '背景封面':
      return '图片主视觉、章节导入和封面页。';
    case '通用版式':
      return '不依赖 Tweet 主题的普通课堂/商务 PPT 页面。';
    case '代码追踪':
      return '允许承载代码和状态变化的讲解页。';
    case 'Tweet 课堂':
    default:
      return '用 Tweet/OOP 例子压测真实课堂生成。';
  }
}
