import { Button } from '@heroui/react';
import type { Template } from '@shared/types';
import type { ReactElement } from 'react';

import ThumbCanvas from './ThumbCanvas';

interface TemplateGalleryProps {
  presets: Template[];
  customTemplates: Template[];
  activeId: string;
  onSelect: (template: Template) => void;
  onDeleteCustom: (id: string) => void;
}

/** 模板画廊：预设 + 自定义模板缩略图网格 */
export default function TemplateGallery({
  presets,
  customTemplates,
  activeId,
  onSelect,
  onDeleteCustom
}: TemplateGalleryProps): ReactElement {
  const renderItem = (template: Template, isCustom: boolean): ReactElement => {
    const active = template.id === activeId;
    return (
      <div key={template.id} className="relative">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(template)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onSelect(template);
          }}
          className={`bg-surface text-surface-foreground hover:bg-surface-secondary cursor-pointer overflow-hidden rounded-xl border p-2 transition-colors focus:outline-none ${
            active ? 'border-accent ring-accent ring-2' : 'border-transparent'
          }`}
        >
          <ThumbCanvas template={template} scale={0.3} className="rounded-md" />
          <p className="mt-1 truncate text-xs font-medium">{template.name}</p>
          <p className="text-muted truncate text-[10px]">
            {isCustom ? '自定义' : template.subtitle}
          </p>
        </div>
        {isCustom ? (
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label={`删除模板 ${template.name}`}
            className="absolute -top-1 -right-1"
            onPress={() => onDeleteCustom(template.id)}
          >
            ✕
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted mb-2 text-xs font-semibold">预设</p>
        <div className="grid grid-cols-1 gap-3">{presets.map((t) => renderItem(t, false))}</div>
      </div>
      <div>
        <p className="text-muted mb-2 text-xs font-semibold">自定义</p>
        {customTemplates.length === 0 ? (
          <p className="text-muted text-xs">还没有自定义模板，去「样式」页调整后另存。</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {customTemplates.map((t) => renderItem(t, true))}
          </div>
        )}
      </div>
    </div>
  );
}
