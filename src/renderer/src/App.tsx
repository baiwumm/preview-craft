import { ProgressBar, Tabs, Toast, toast } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import BrowserGuideModal from '@/components/BrowserGuideModal';
import Canvas from '@/components/Canvas';
import ExportPanel, { type ExportProgress } from '@/components/ExportPanel';
import SaveTemplateModal from '@/components/SaveTemplateModal';
import SettingsModal from '@/components/SettingsModal';
import StylePanel from '@/components/StylePanel';
import TemplateGallery from '@/components/TemplateGallery';
import UrlBar, { type UrlBarHandle } from '@/components/UrlBar';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useTheme } from '@/hooks/useTheme';
import { cloneTemplate, defaultStyle, isTemplateModified, type StyleState } from '@/lib/design';
import { describeBrowserKind, describeCaptureError } from '@/lib/format';
import { deviceIds, devicePresets } from '@shared/devices';
import { presets } from '@templates/presets';
import type {
  AppSettings,
  BrowserDownloadProgress,
  BrowserInfo,
  CaptureResult,
  DeviceId,
  Template
} from '@shared/types';

interface SessionDesign {
  template: Template;
  style: StyleState;
}

const fallbackSettings: AppSettings = { theme: 'dark', format: 'png', scale: 2 };

/** 按设置项解析启动模板（默认模板 / 默认背景） */
function resolveStartupTemplate(
  settings: AppSettings,
  customTemplates: Template[]
): { template: Template; source: Template | undefined } {
  const all = [...presets, ...customTemplates];
  const source =
    all.find((template) => template.id === settings.defaultTemplate) ?? presets[0];
  const template = cloneTemplate(source);
  if (settings.defaultBackground) {
    template.background = settings.defaultBackground;
  }
  return { template, source };
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

  // 设置（格式/倍率即时生效，默认模板与背景下次启动生效）
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);

  // 浏览器可用性
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<BrowserDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // 截图 / 导出任务状态
  const [job, setJob] = useState<ExportProgress | null>(null);
  const [shots, setShots] = useState<Partial<Record<DeviceId, string>>>({});
  const [shotPaths, setShotPaths] = useState<Partial<Record<DeviceId, string>>>({});
  const [shotErrors, setShotErrors] = useState<Partial<Record<DeviceId, string>>>({});

  const urlBarRef = useRef<UrlBarHandle>(null);

  const detectBrowsers = useCallback(() => {
    window.api
      ?.browserDetect()
      .then((result) => {
        setBrowsers(result.found);
        const names = result.found.map((b) => describeBrowserKind(b.kind)).join('、');
        toast(
          result.found.length
            ? `检测到 ${result.found.length} 个可用浏览器：${names}`
            : '未检测到 Chrome / Edge',
          {
            variant: result.found.length ? 'success' : 'warning',
            description: result.found.length ? undefined : '可下载 Chromium，或手动指定浏览器路径'
          }
        );
      })
      .catch(() => toast('浏览器检测失败', { variant: 'danger' }));
  }, []);

  // 启动：设置 / 自定义模板 / 浏览器检测并行拉取
  useEffect(() => {
    const load = async (): Promise<void> => {
      const [nextSettings, custom, detection] = await Promise.all([
        window.api?.settingsGet().catch(() => null) ?? Promise.resolve(null),
        window.api?.templatesGet().catch(() => null) ?? Promise.resolve(null),
        window.api?.browserDetect().catch(() => null) ?? Promise.resolve(null)
      ]);

      const customList = custom ?? [];
      setCustomTemplates(customList);
      setBrowsers(detection?.found ?? []);

      if (nextSettings) {
        setSettings({ ...fallbackSettings, ...nextSettings });
        const startup = resolveStartupTemplate(nextSettings, customList);
        setDesign((prev) => ({ ...prev, template: startup.template }));
        setSource(startup.source);
      }

      const hasBrowser =
        (detection?.found.length ?? 0) > 0 || Boolean(nextSettings?.browserPath);
      if (!hasBrowser) setGuideOpen(true);
    };

    void load();
  }, []);

  // Chromium 下载进度（订阅一次，随下载状态展示）
  useEffect(() => {
    const off = window.api?.onBrowserDownloadProgress(setDownloadProgress);
    return () => off?.();
  }, []);

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    window.api
      ?.settingsSet(patch)
      .then(setSettings)
      .catch(() => toast('设置保存失败', { variant: 'danger' }));
  }, []);

  const handleApply = useCallback(
    (nextMain: string, nextDeviceUrls: Partial<Record<DeviceId, string>>) => {
      // 仅在地址真的变了时清掉失败占位：UrlBar 失焦也会提交同值，无条件清会让
      // 「重试」入口在截图失败后凭空消失，而改地址后又残留上一轮的失败块。
      const changed =
        nextMain !== mainUrl ||
        deviceIds.some((device) => (nextDeviceUrls[device] ?? '') !== (deviceUrls[device] ?? ''));
      setMainUrl(nextMain);
      setDeviceUrls(nextDeviceUrls);
      if (changed) setShotErrors({});
    },
    [mainUrl, deviceUrls]
  );

  const handleSelectTemplate = useCallback((template: Template) => {
    setDesign((prev) => ({ ...prev, template: cloneTemplate(template) }));
    setSource(template);
  }, []);

  const handleTemplateChange = useCallback((updater: (template: Template) => Template) => {
    setDesign((prev) => ({ ...prev, template: updater(prev.template) }));
  }, []);

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

  const startChromiumDownload = useCallback(() => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadProgress({ percent: 0 });
    window.api
      ?.browserDownload()
      .then(async () => {
        toast('Chromium 下载完成', { variant: 'success' });
        setGuideOpen(false);
        const detection = await window.api.browserDetect();
        setBrowsers(detection.found);
      })
      .catch((error: unknown) => {
        const message = describeCaptureError(error instanceof Error ? error.message : String(error));
        setDownloadError(message);
        toast(`Chromium 下载失败：${message}`, { variant: 'danger' });
      })
      .finally(() => setDownloading(false));
  }, [downloading]);

  const pickBrowserPath = useCallback(() => {
    window.api
      ?.pickBrowserPath()
      .then((result) => {
        if (!result.path) return;
        patchSettings({ browserPath: result.path });
        toast('已指定浏览器路径', { variant: 'success', description: result.path });
      })
      .catch(() => toast('浏览器路径选择失败', { variant: 'danger' }));
  }, [patchSettings]);

  /** 逐设备真实截图，结果并入会话状态；返回是否至少一台成功 */
  const captureShots = useCallback(
    async (
      devices: DeviceId[]
    ): Promise<{ ok: boolean; shots: Partial<Record<DeviceId, string>> }> => {
      if (!mainUrl) {
        toast('请先在地址栏输入网址（Ctrl+V 可直接粘贴）', { variant: 'warning' });
        return { ok: false, shots: {} };
      }
      if (!settings.browserPath && browsers.length === 0) {
        setGuideOpen(true);
        toast('未检测到可用浏览器，请先下载 Chromium 或指定浏览器路径', {
          variant: 'warning'
        });
        return { ok: false, shots: {} };
      }
      if (job) return { ok: false, shots: {} };
      if (!window.api) {
        toast('当前环境未接入主进程，无法调用截图', { variant: 'warning' });
        return { ok: false, shots: {} };
      }

      setJob({ phase: 'capturing', text: '正在准备截图…', percent: 0 });
      let done = 0;
      const off = window.api.onCaptureProgress((progress) => {
        if (progress.status !== 'pending') {
          done += 1;
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  text: `${devicePresets[progress.device].label}：${
                    progress.status === 'done' ? '已完成' : '失败'
                  }`,
                  percent: Math.round((done / devices.length) * 100)
                }
              : prev
          );
          return;
        }
        setJob((prev) =>
          prev ? { ...prev, text: `正在截取${devicePresets[progress.device].label}画面…` } : prev
        );
      });

      let result: CaptureResult;
      try {
        result = await window.api.captureStart({ url: mainUrl, deviceUrls, devices });
      } catch (error) {
        const message = describeCaptureError(error instanceof Error ? error.message : String(error));
        toast(`截图失败：${message}`, {
          variant: 'danger',
          description: '请在「设置 → 浏览器」确认可用浏览器后重试'
        });
        setJob(null);
        return { ok: false, shots: shotPaths };
      } finally {
        off();
      }

      // 本轮失败的设备要清掉上一轮的旧截图，否则画布继续显示过期画面、重试入口被遮住
      const failed = devices.filter((device) => !result.shots[device]);

      const entries = Object.entries(result.shots) as Array<[DeviceId, string]>;
      const decoded = await Promise.all(
        entries.map(
          async ([device, path]) => [device, await window.api.shotDataUrl(path)] as const
        )
      );
      setShots((prev) => {
        const next = { ...prev, ...Object.fromEntries(decoded) };
        for (const device of failed) delete next[device];
        return next;
      });

      const mergedPaths = { ...shotPaths, ...result.shots };
      for (const device of failed) delete mergedPaths[device];
      setShotPaths(mergedPaths);
      setShotErrors((prev) => {
        const next = { ...prev };
        for (const device of devices) delete next[device];
        for (const [device, error] of Object.entries(result.errors)) {
          next[device as DeviceId] = error;
        }
        return next;
      });

      if (failed.length === devices.length) {
        toast(`截图失败：${describeCaptureError(result.errors[failed[0]])}`, {
          variant: 'danger',
          description: '可修正地址后重试，或在设置中检查浏览器'
        });
        setJob(null);
        return { ok: false, shots: mergedPaths };
      }
      if (failed.length > 0) {
        toast(`${failed.map((device) => devicePresets[device].label).join('、')} 截图失败`, {
          variant: 'warning',
          description: `${describeCaptureError(result.errors[failed[0]])}，可在画布上单台重试`
        });
      }
      return { ok: true, shots: mergedPaths };
    },
    [mainUrl, deviceUrls, settings.browserPath, browsers, job, shotPaths]
  );

  const targetDevices = useMemo(
    () => design.template.placements.map((placement) => placement.device),
    [design.template.placements]
  );

  /** Ctrl+Enter：仅截图，结果直接回填画布 */
  const handleCapture = useCallback(async () => {
    try {
      const { ok } = await captureShots(targetDevices);
      if (ok) {
        toast('截图完成', { variant: 'success', description: '已切换到真实截图，可继续导出' });
        setJob(null);
      }
    } catch (error) {
      toast(`截图失败：${describeCaptureError(error instanceof Error ? error.message : String(error))}`, {
        variant: 'danger'
      });
      setJob(null);
    }
  }, [captureShots, targetDevices]);

  /** 导出：逐设备截图 → 隐藏窗口合成 → 保存对话框 + 剪贴板 */
  const handleExport = useCallback(async () => {
    if (!mainUrl || job) return;

    try {
      const { ok, shots: mergedPaths } = await captureShots(targetDevices);
      if (!ok) return;

      setJob({ phase: 'composing', text: '正在合成导出图…', percent: 100 });
      const { path } = await window.api.exportCompose({
        template: design.template,
        shots: mergedPaths as Record<DeviceId, string>,
        scale: settings.scale,
        format: settings.format,
        quality: 90,
        style: {
          borderRadius: design.style.borderRadius,
          shadow: design.style.shadow,
          zoom: design.style.zoom
        }
      });

      setJob({ phase: 'saving', text: '正在导出…', percent: 100 });
      const host = mainUrl ? new URL(mainUrl).hostname : 'preview-craft';
      const defaultName = `${host}-${design.template.id}-${settings.scale}x.${settings.format}`;
      const { saved } = await window.api.exportSave({ path, defaultName });
      await window.api.exportClipboard({ path });
      toast(saved ? '已保存并复制到剪贴板' : '已复制到剪贴板', { variant: 'success' });
    } catch (error) {
      toast(`导出失败：${error instanceof Error ? error.message : String(error)}`, {
        variant: 'danger'
      });
    } finally {
      setJob(null);
    }
  }, [mainUrl, job, captureShots, targetDevices, design, settings.scale, settings.format]);

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
          toast(`${devicePresets[device].label}截图完成`, { variant: 'success' });
        } else {
          const message = describeCaptureError(result.errors[device]);
          setShotErrors((prev) => ({ ...prev, [device]: message }));
          toast(`${devicePresets[device].label}截图失败：${message}`, { variant: 'danger' });
        }
      } catch (error) {
        const message = describeCaptureError(error instanceof Error ? error.message : String(error));
        setShotErrors((prev) => ({ ...prev, [device]: message }));
        toast(`${devicePresets[device].label}截图失败：${message}`, { variant: 'danger' });
      }
    },
    [mainUrl, deviceUrls]
  );

  /** Ctrl+V：焦点不在输入区时，把剪贴板文本贴进地址栏并刷新预览 */
  const handlePasteUrl = useCallback(() => {
    window.api
      ?.clipboardReadText()
      .then((text) => {
        if (!text.trim()) {
          toast('剪贴板中没有文本内容', { variant: 'warning' });
          return;
        }
        urlBarRef.current?.applyText(text);
      })
      .catch(() => toast('读取剪贴板失败', { variant: 'danger' }));
  }, []);

  const runCaptureShortcut = useCallback(() => {
    void handleCapture();
  }, [handleCapture]);

  const runExportShortcut = useCallback(() => {
    void handleExport();
  }, [handleExport]);

  useShortcuts({
    onCapture: runCaptureShortcut,
    onExport: runExportShortcut,
    onPasteUrl: handlePasteUrl,
    enabled: !settingsOpen && !guideOpen && !saveOpen && !job
  });

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Toast.Provider />

      <header className="border-separator border-b px-4 py-3">
        <UrlBar
          ref={urlBarRef}
          url={mainUrl}
          deviceUrls={deviceUrls}
          onApply={handleApply}
          onCapture={handleCapture}
          onOpenSettings={() => setSettingsOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          busy={Boolean(job)}
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
        </main>

        <aside className="border-separator w-96 shrink-0 border-l">
          <Tabs className="flex h-full flex-col">
            <Tabs.ListContainer>
              <Tabs.List aria-label="侧栏">
                <Tabs.Tab id="templates">
                  模板
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="style">
                  样式
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="export">
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
                format={settings.format}
                scale={settings.scale}
                onFormatChange={(format) => patchSettings({ format })}
                onScaleChange={(scale) => patchSettings({ scale })}
                onCapture={handleCapture}
                onExport={handleExport}
                exporting={job}
                canExport={Boolean(mainUrl)}
              />
            </Tabs.Panel>
          </Tabs>
        </aside>

        {/* 任务遮罩：截图/导出期间覆盖画布与右侧面板，禁止交互 */}
        {job ? (
          <div className="bg-backdrop absolute inset-0 z-20 flex items-center justify-center">
            <div className="bg-surface text-surface-foreground shadow-overlay rounded-xl p-6">
              <p className="mb-3 text-sm">{job.text}</p>
              <ProgressBar aria-label="任务进度" className="w-72" value={job.percent}>
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
            </div>
          </div>
        ) : null}
      </div>

      <SaveTemplateModal open={saveOpen} onOpenChange={setSaveOpen} onSave={handleSaveTemplate} />

      <BrowserGuideModal
        open={guideOpen}
        browsers={browsers}
        downloading={downloading}
        progress={downloadProgress}
        error={downloadError}
        onDownload={startChromiumDownload}
        onOpenSettings={() => {
          setGuideOpen(false);
          setSettingsOpen(true);
        }}
        onDismiss={() => setGuideOpen(false)}
      />

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        browsers={browsers}
        templates={[...presets, ...customTemplates]}
        downloading={downloading}
        downloadProgress={downloadProgress}
        downloadError={downloadError}
        onPatch={patchSettings}
        onPickBrowser={pickBrowserPath}
        onDownloadChromium={startChromiumDownload}
        onDetectBrowsers={detectBrowsers}
      />
    </div>
  );
}
