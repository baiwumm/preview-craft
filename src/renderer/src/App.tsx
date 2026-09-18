import { Tabs } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import Canvas from '@/components/Canvas';
import SaveTemplateModal from '@/components/SaveTemplateModal';
import StylePanel from '@/components/StylePanel';
import TemplateGallery from '@/components/TemplateGallery';
import UrlBar from '@/components/UrlBar';
import { useTheme } from '@/hooks/useTheme';
import { cloneTemplate, defaultStyle, isTemplateModified, type StyleState } from '@/lib/design';
import { presets } from '@templates/presets';
import type { DeviceId, Template } from '@shared/types';

interface SessionDesign {
  template: Template;
  style: StyleState;
}

export default function App(): ReactElement {
  const { theme, toggleTheme } = useTheme();

  // 已提交的 URL 状态：仅回车/点击刷新时更新，触发 iframe 重载
  const [mainUrl, setMainUrl] = useState('');
  const [deviceUrls, setDeviceUrls] = useState<Partial<Record<DeviceId, string>>>({});

  // 会话设计状态：模板（可微调）+ 会话样式
  const [design, setDesign] = useState<SessionDesign>(() => ({
    template: cloneTemplate(presets[0]),
    style: { ...defaultStyle }
  }));
  // 当前会话排版的来源模板（用于「还原」与选中态）
  const [source, setSource] = useState<Template | undefined>(presets[0]);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);

  // 加载自定义模板
  useEffect(() => {
    window.api
      ?.templatesGet()
      .then(setCustomTemplates)
      .catch(() => undefined);
  }, []);

  const handleApply = useCallback(
    (nextMain: string, nextDeviceUrls: Partial<Record<DeviceId, string>>) => {
      setMainUrl(nextMain);
      setDeviceUrls(nextDeviceUrls);
    },
    []
  );

  const handleSelectTemplate = useCallback((template: Template) => {
    setDesign((prev) => ({ ...prev, template: cloneTemplate(template) }));
    setSource(template);
  }, []);

  const handleTemplateChange = useCallback(
    (updater: (template: Template) => Template) => {
      setDesign((prev) => ({ ...prev, template: updater(prev.template) }));
    },
    []
  );

  const handleStyleChange = useCallback((patch: Partial<StyleState>) => {
    setDesign((prev) => ({ ...prev, style: { ...prev.style, ...patch } }));
  }, []);

  const handleResetPreset = useCallback(() => {
    if (!source) return;
    setDesign((prev) => ({ ...prev, template: cloneTemplate(source) }));
  }, [source]);

  const handleSaveTemplate = useCallback(
    (name: string) => {
      const template: Template = {
        ...cloneTemplate(design.template),
        id: `custom-${Date.now()}`,
        name,
        subtitle: '自定义模板'
      };
      setCustomTemplates((prev) => {
        if (window.api) {
          window.api
            .templatesSave(template)
            .then(setCustomTemplates)
            .catch(() => undefined);
          return prev;
        }
        return [...prev, template];
      });
      setSource(template);
    },
    [design.template]
  );

  const handleDeleteCustom = useCallback(
    (id: string) => {
      setCustomTemplates((prev) => {
        if (window.api) {
          window.api
            .templatesDelete(id)
            .then(setCustomTemplates)
            .catch(() => undefined);
          return prev;
        }
        return prev.filter((t) => t.id !== id);
      });
      if (source?.id === id) setSource(undefined);
    },
    [source]
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-separator border-b px-4 py-3">
        <UrlBar
          url={mainUrl}
          deviceUrls={deviceUrls}
          onApply={handleApply}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="bg-background min-w-0 flex-1 p-6">
          <Canvas
            template={design.template}
            mainUrl={mainUrl}
            deviceUrls={deviceUrls}
            style={design.style}
          />
        </main>

        <aside className="border-separator w-96 shrink-0 border-l">
          <Tabs className="flex h-full flex-col">
            <Tabs.ListContainer className="border-separator border-b px-3 pt-2">
              <Tabs.List aria-label="侧栏">
                <Tabs.Tab id="templates" className="text-sm">
                  模板
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="style" className="text-sm">
                  样式
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="templates" className="flex-1 overflow-y-auto p-4">
              <TemplateGallery
                presets={presets}
                customTemplates={customTemplates}
                activeId={source?.id ?? design.template.id}
                onSelect={handleSelectTemplate}
                onDeleteCustom={handleDeleteCustom}
              />
            </Tabs.Panel>
            <Tabs.Panel id="style" className="flex-1 overflow-y-auto p-4">
              <StylePanel
                template={design.template}
                style={design.style}
                onTemplateChange={handleTemplateChange}
                onStyleChange={handleStyleChange}
                onSaveAsTemplate={() => setSaveOpen(true)}
                onResetPreset={handleResetPreset}
                canReset={isTemplateModified(design.template, source)}
              />
            </Tabs.Panel>
          </Tabs>
        </aside>
      </div>

      <SaveTemplateModal open={saveOpen} onOpenChange={setSaveOpen} onSave={handleSaveTemplate} />
    </div>
  );
}
