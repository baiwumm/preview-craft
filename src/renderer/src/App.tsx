import { ProgressBar, Tabs, toast } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import Canvas from '@/components/Canvas';
import ExportPanel, { type ExportProgress } from '@/components/ExportPanel';
import SaveTemplateModal from '@/components/SaveTemplateModal';
import StylePanel from '@/components/StylePanel';
import TemplateGallery from '@/components/TemplateGallery';
import UrlBar from '@/components/UrlBar';
import { useTheme } from '@/hooks/useTheme';
import { cloneTemplate, defaultStyle, isTemplateModified, type StyleState } from '@/lib/design';
import { devicePresets } from '@shared/devices';
import { presets } from '@templates/presets';
import type { DeviceId, ExportFormat, Template } from '@shared/types';

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

  // 导出状态
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [exporting, setExporting] = useState<ExportProgress | null>(null);
  const [shots, setShots] = useState<Partial<Record<DeviceId, string>>>({});
  const [shotPaths, setShotPaths] = useState<Partial<Record<DeviceId, string>>>({});
  const [shotErrors, setShotErrors] = useState<Partial<Record<DeviceId, string>>>({});

  // 加载自定义模板与导出设置
  useEffect(() => {
    window.api
      ?.templatesGet()
      .then(setCustomTemplates)
      .catch(() => undefined);
    window.api
      ?.settingsGet()
      .then((settings) => {
        setFormat(settings.format);
        setScale(settings.scale);
      })
      .catch(() => undefined);
  }, []);

  const persistFormat = useCallback((next: ExportFormat) => {
    setFormat(next);
    window.api?.settingsSet({ format: next }).catch(() => undefined);
  }, []);

  const persistScale = useCallback((next: 1 | 2 | 3) => {
    setScale(next);
    window.api?.settingsSet({ scale: next }).catch(() => undefined);
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

  /** 导出：逐设备截图 → 隐藏窗口合成 → 保存对话框 + 剪贴板 */
  const handleExport = useCallback(async () => {
    if (!mainUrl || exporting) return;
    const targetDevices = design.template.placements.map((p) => p.device);

    try {
      setExportStateProgress('capturing', '正在截取画面…', 0, setExporting);
      let doneCount = 0;
      const off = window.api.onCaptureProgress((progress) => {
        if (progress.status === 'pending') {
          setExporting((prev) =>
            prev
              ? {
                  ...prev,
                  text: `正在截取${devicePresets[progress.device].label}画面…`,
                  percent: Math.round((doneCount / targetDevices.length) * 100)
                }
              : prev
          );
        } else {
          doneCount += 1;
          setExporting((prev) =>
            prev
              ? {
                  ...prev,
                  text: `正在截取${devicePresets[progress.device].label}画面…`,
                  percent: Math.round((doneCount / targetDevices.length) * 100)
                }
              : prev
          );
        }
      });

      let result;
      try {
        result = await window.api.captureStart({
          url: mainUrl,
          deviceUrls,
          devices: targetDevices
        });
      } finally {
        off();
      }

      // 合并到会话状态
      const nextPaths = { ...shotPaths, ...result.shots };
      const nextErrors = { ...shotErrors };
      for (const device of targetDevices) delete nextErrors[device];
      for (const [device, error] of Object.entries(result.errors)) {
        nextErrors[device as DeviceId] = error;
      }
      setShotPaths(nextPaths);
      setShotErrors(nextErrors);

      // dataURL 供画布显示
      for (const [device, path] of Object.entries(result.shots)) {
        const dataUrl = await window.api.shotDataUrl(path);
        setShots((prev) => ({ ...prev, [device as DeviceId]: dataUrl }));
      }

      const okDevices = Object.keys(result.shots) as DeviceId[];
      if (okDevices.length === 0) {
        toast('全部设备截图失败，请检查网络或站点可访问性', { variant: 'danger' });
        return;
      }
      if (okDevices.length < targetDevices.length) {
        toast('部分设备截图失败，可在画布上单台重试', { variant: 'warning' });
      }

      setExporting((prev) => (prev ? { ...prev, phase: 'composing', text: '正在合成导出图…', percent: 100 } : prev));
      const { path } = await window.api.exportCompose({
        template: design.template,
        shots: nextPaths as Record<DeviceId, string>,
        scale,
        format,
        quality: 90,
        style: {
          borderRadius: design.style.borderRadius,
          shadow: design.style.shadow,
          zoom: design.style.zoom
        }
      });

      setExporting((prev) => (prev ? { ...prev, phase: 'saving', text: '正在导出…' } : prev));
      const host = new URL(mainUrl).hostname;
      const defaultName = `${host}-${design.template.id}-${scale}x.${format}`;
      const { saved } = await window.api.exportSave({ path, defaultName });
      await window.api.exportClipboard({ path });
      toast(saved ? '已保存并复制到剪贴板' : '已复制到剪贴板', { variant: 'success' });
    } catch (error) {
      toast(`导出失败：${error instanceof Error ? error.message : String(error)}`, {
        variant: 'danger'
      });
    } finally {
      setExporting(null);
    }
  }, [mainUrl, exporting, design, deviceUrls, shotPaths, shotErrors, scale, format]);

  /** 单台重试失败设备的截图 */
  const handleRetryDevice = useCallback(
    async (device: DeviceId) => {
      if (!mainUrl) return;
      try {
        const result = await window.api.captureStart({
          url: mainUrl,
          deviceUrls,
          devices: [device]
        });
        const path = result.shots[device];
        if (path) {
          const dataUrl = await window.api.shotDataUrl(path);
          setShots((prev) => ({ ...prev, [device]: dataUrl }));
          setShotPaths((prev) => ({ ...prev, [device]: path }));
          setShotErrors((prev) => {
            const next = { ...prev };
            delete next[device];
            return next;
          });
        } else {
          setShotErrors((prev) => ({ ...prev, [device]: result.errors[device] ?? '截图失败' }));
        }
      } catch (error) {
        setShotErrors((prev) => ({
          ...prev,
          [device]: error instanceof Error ? error.message : '截图失败'
        }));
      }
    },
    [mainUrl, deviceUrls]
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

      <div className="relative flex min-h-0 flex-1">
        <main className="bg-background min-w-0 flex-1 p-6">
          <Canvas
            template={design.template}
            mainUrl={mainUrl}
            deviceUrls={deviceUrls}
            style={design.style}
            shots={shots}
            shotErrors={shotErrors}
            onRetry={handleRetryDevice}
          />
          {exporting ? (
            <div className="bg-backdrop absolute inset-0 flex items-center justify-center">
              <div className="bg-surface text-surface-foreground shadow-overlay rounded-xl p-6">
                <p className="mb-3 text-sm">{exporting.text}</p>
                <ProgressBar aria-label="导出进度" className="w-72" value={exporting.percent}>
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              </div>
            </div>
          ) : null}
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
                <Tabs.Tab id="export" className="text-sm">
                  导出
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
            <Tabs.Panel id="export" className="flex-1 overflow-y-auto p-4">
              <ExportPanel
                format={format}
                scale={scale}
                onFormatChange={persistFormat}
                onScaleChange={persistScale}
                onExport={handleExport}
                exporting={exporting}
                canExport={Boolean(mainUrl)}
              />
            </Tabs.Panel>
          </Tabs>
        </aside>
      </div>

      <SaveTemplateModal open={saveOpen} onOpenChange={setSaveOpen} onSave={handleSaveTemplate} />
    </div>
  );
}

function setExportStateProgress(
  phase: 'capturing' | 'composing' | 'saving',
  text: string,
  percent: number,
  setter: (value: ExportProgress | null) => void
): void {
  setter({ phase, text, percent });
}
