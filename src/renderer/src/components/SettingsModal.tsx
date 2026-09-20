import {
  Button,
  Description,
  Label,
  ListBox,
  Modal,
  ProgressBar,
  Select,
  Tabs
} from '@heroui/react';
import {
  Check,
  Circle,
  CircleArrowUp,
  Eraser,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  ScanSearch,
  Trash2,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { backgrounds } from '@templates/backgrounds';
import { describeBrowserKind, formatBytes } from '@/lib/format';

import ChromiumDownloadButton from './ChromiumDownloadButton';

import type {
  AppSettings,
  BrowserDownloadProgress,
  BrowserInfo,
  CacheStats,
  ExportFormat,
  Template,
  UpdateCheckResult
} from '@shared/types';

const NONE = 'none';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  /** 已检测到的浏览器（含本地已下载的 Chromium） */
  browsers: BrowserInfo[];
  /** 供「默认模板」选择的完整模板列表 */
  templates: Template[];
  /** 运行中的版本号，来自 app.getVersion() */
  version: string;
  downloading: boolean;
  downloadProgress: BrowserDownloadProgress | null;
  downloadError: string | null;
  onPatch: (patch: Partial<AppSettings>) => void;
  onPickBrowser: () => void;
  onDownloadChromium: () => void;
  onDetectBrowsers: () => void;
  onCheckUpdate: () => Promise<UpdateCheckResult>;
  onOpenRelease: (url: string) => void;
}

interface SelectOption<T extends string> {
  id: T;
  label: string;
}

function SettingSelect<T extends string>({
  label,
  hint,
  value,
  options,
  onChange
}: {
  label: string;
  hint?: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={label}
        className="w-full"
        selectedKey={value}
        onSelectionChange={(key) => onChange(key as T)}
      >
        <Label>{label}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {options.map((option) => (
              <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {hint ? <p className="text-muted text-xs">{hint}</p> : null}
    </div>
  );
}

/** 设置页：浏览器来源 / 默认值 / 缓存清理 */
export default function SettingsModal({
  open,
  onOpenChange,
  settings,
  browsers,
  templates,
  version,
  downloading,
  downloadProgress,
  downloadError,
  onPatch,
  onPickBrowser,
  onDownloadChromium,
  onDetectBrowsers,
  onCheckUpdate,
  onOpenRelease
}: SettingsModalProps): ReactElement {
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [clearing, setClearing] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const handleCheckUpdate = useCallback(() => {
    setChecking(true);
    onCheckUpdate()
      .then(setUpdate)
      .catch((error: unknown) =>
        setUpdate({
          ok: false,
          current: version,
          error: error instanceof Error ? error.message : String(error)
        })
      )
      .finally(() => setChecking(false));
  }, [onCheckUpdate, version]);

  const loadCache = useCallback(() => {
    window.api
      ?.cacheStats()
      .then(setCache)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadCache();
  }, [open, loadCache]);

  const handleClearCache = useCallback(() => {
    setClearing(true);
    window.api
      ?.cacheClear()
      .then((removed) => {
        setCache((prev) => ({
          files: Math.max(0, (prev?.files ?? removed.files) - removed.files),
          bytes: Math.max(0, (prev?.bytes ?? removed.bytes) - removed.bytes)
        }));
        loadCache();
      })
      .catch(() => undefined)
      .finally(() => setClearing(false));
  }, [loadCache]);

  const activePath = settings.browserPath ?? browsers[0]?.path;
  const activeKind = browsers.find((browser) => browser.path === activePath)?.kind;

  const templateOptions: Array<SelectOption<string>> = [
    { id: NONE, label: '不预设（经典全家福）' },
    ...templates.map((template) => ({ id: template.id, label: template.name }))
  ];

  const backgroundOptions: Array<SelectOption<string>> = [
    { id: NONE, label: '跟随模板' },
    ...backgrounds.map((bg) => ({ id: bg.key, label: bg.name }))
  ];

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[620px]">
            <Modal.Header>
              <Modal.Heading>设置</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Tabs>
                <Tabs.ListContainer>
                  <Tabs.List aria-label="设置分组">
                    <Tabs.Tab id="browser">
                      浏览器
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="defaults">
                      默认值
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="cache">
                      缓存
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="about">
                      关于
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="browser" className="flex flex-col gap-3 pt-3">
                  <p className="text-muted text-xs">
                    截图使用本机 Chrome / Edge；一个都没有时下载 Chromium 到应用数据目录。
                  </p>
                  <div className="border-separator bg-surface/50 rounded-lg border p-3">
                    <p className="text-foreground text-xs font-semibold">
                      当前生效：
                      {settings.browserPath
                        ? '手动指定的浏览器'
                        : activeKind
                          ? describeBrowserKind(activeKind)
                          : '无可用浏览器'}
                    </p>
                    <p className="text-muted mt-1 break-all text-xs">
                      {activePath ?? '未检测到浏览器，可下载 Chromium 或手动指定路径'}
                    </p>
                  </div>

                  {browsers.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-foreground text-xs font-semibold">检测到的浏览器</p>
                      {browsers.map((browser) => (
                        <div
                          key={browser.path}
                          className="border-separator flex items-center gap-2 border-b py-1"
                        >
                          <span className="text-muted w-20 shrink-0 text-xs">
                            {describeBrowserKind(browser.kind)}
                          </span>
                          <span className="text-foreground min-w-0 flex-1 truncate text-xs">
                            {browser.path}
                          </span>
                          <Button
                            size="sm"
                            variant={settings.browserPath === browser.path ? 'primary' : 'tertiary'}
                            onPress={() => onPatch({ browserPath: browser.path })}
                          >
                            {/* 选中与否各配一枚图标，避免只有一态带图标造成宽度跳动 */}
                            {settings.browserPath === browser.path ? <Check /> : <Circle />}
                            {settings.browserPath === browser.path ? '已选' : '使用'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onPress={onPickBrowser}>
                      <FolderOpen />
                      浏览…
                    </Button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={!settings.browserPath}
                      onPress={() => onPatch({ browserPath: undefined })}
                    >
                      <Eraser />
                      清除覆盖
                    </Button>
                    <Button size="sm" variant="tertiary" onPress={onDetectBrowsers}>
                      <ScanSearch />
                      重新检测
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <ChromiumDownloadButton
                      downloading={downloading}
                      onStart={onDownloadChromium}
                      variant={browsers.length === 0 ? 'primary' : 'secondary'}
                    />
                    {downloading ? (
                      <ProgressBar
                        aria-label="Chromium 下载进度"
                        value={downloadProgress && downloadProgress.percent > 0 ? downloadProgress.percent : undefined}
                      >
                        <ProgressBar.Output />
                        <ProgressBar.Track>
                          <ProgressBar.Fill />
                        </ProgressBar.Track>
                      </ProgressBar>
                    ) : null}
                    {downloading ? (
                      <p className="text-muted text-xs">
                        {downloadProgress?.totalBytes
                          ? `已下载 ${formatBytes(downloadProgress.downloadedBytes ?? 0)} / ${formatBytes(downloadProgress.totalBytes)}`
                          : '正在准备下载…'}
                      </p>
                    ) : null}
                    {downloadError ? <p className="text-danger text-xs">{downloadError}</p> : null}
                  </div>
                </Tabs.Panel>

                <Tabs.Panel id="defaults" className="flex flex-col gap-3 pt-3">
                  <SettingSelect
                    label="默认模板"
                    hint="仅在没有可恢复的上次会话时生效（排版微调等会话状态现在会记住）"
                    value={settings.defaultTemplate ?? NONE}
                    options={templateOptions}
                    onChange={(value) => onPatch({ defaultTemplate: value === NONE ? undefined : value })}
                  />
                  <SettingSelect
                    label="默认背景"
                    hint="覆盖模板自带背景；同样让位于上次会话恢复的背景"
                    value={settings.defaultBackground ?? NONE}
                    options={backgroundOptions}
                    onChange={(value) =>
                      onPatch({ defaultBackground: value === NONE ? undefined : value })
                    }
                  />
                  <SettingSelect
                    label="默认导出格式"
                    value={settings.format}
                    options={[
                      { id: 'png', label: 'PNG（无损）' },
                      { id: 'jpg', label: 'JPG（体积小）' },
                      { id: 'webp', label: 'WebP（更小）' }
                    ]}
                    onChange={(value) => onPatch({ format: value as ExportFormat })}
                  />
                  <SettingSelect
                    label="默认导出倍率"
                    value={String(settings.scale)}
                    options={[
                      { id: '1', label: '1x（标准）' },
                      { id: '2', label: '2x（推荐）' },
                      { id: '3', label: '3x（超清）' }
                    ]}
                    onChange={(value) => onPatch({ scale: Number(value) as 1 | 2 | 3 })}
                  />
                  <p className="text-muted text-xs">
                    默认模板与背景在下次启动时生效；导出格式与倍率即时生效。
                  </p>
                  <div className="flex flex-col gap-1">
                    <p className="text-foreground text-xs font-semibold">快捷键</p>
                    <p className="text-muted text-xs">
                      Ctrl+Enter 截图 · Ctrl+S 导出 · Ctrl+V 粘贴网址到地址栏
                    </p>
                  </div>
                </Tabs.Panel>

                <Tabs.Panel id="cache" className="flex flex-col gap-3 pt-3">
                  <p className="text-muted text-xs">
                    截图与导出产物先写入系统临时目录（%TEMP%\preview-craft），清理仅删除该目录中的文件，
                    不影响设置与自定义模板。
                  </p>
                  <div className="border-separator bg-surface/50 rounded-lg border p-3 text-xs">
                    <p className="text-foreground">
                      {cache ? `${cache.files} 个文件 · ${formatBytes(cache.bytes)}` : '统计中…'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      onPress={handleClearCache}
                      isDisabled={clearing || (cache?.files ?? 0) === 0}
                    >
                      <Trash2 />
                      {clearing ? '清理中…' : '清除缓存'}
                    </Button>
                    <Button size="sm" variant="tertiary" onPress={loadCache}>
                      <RefreshCw />
                      刷新
                    </Button>
                    <Button size="sm" variant="tertiary" onPress={() => void window.api?.cacheOpen?.()}>
                      <FolderOpen />
                      打开缓存目录
                    </Button>
                  </div>
                </Tabs.Panel>

                <Tabs.Panel id="about" className="flex flex-col gap-3 pt-3">
                  <div className="border-separator bg-surface/50 rounded-lg border p-3">
                    <p className="text-foreground text-xs font-semibold">
                      PreviewCraft {version || '—'}
                    </p>
                    <div className="text-muted mt-1">
                      <Description>
                        检查更新只比对 GitHub Releases 上的最新版本，确认后跳转浏览器下载安装包，
                        应用内不自动安装。
                      </Description>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={checking}
                      onPress={handleCheckUpdate}
                    >
                      <CircleArrowUp />
                      {checking ? '检查中…' : '检查更新'}
                    </Button>
                    {update?.ok && update.hasUpdate ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onPress={() => {
                          if (update.url) onOpenRelease(update.url);
                        }}
                      >
                        <ExternalLink />
                        前往下载
                      </Button>
                    ) : null}
                  </div>
                  {update ? (
                    <p className="text-foreground text-xs">
                      {update.ok
                        ? update.hasUpdate
                          ? `发现新版本 ${update.latest}（当前 ${update.current}）`
                          : `已是最新版本（${update.current}）`
                        : `检查失败：${update.error ?? '未知错误'}`}
                    </p>
                  ) : null}
                </Tabs.Panel>
              </Tabs>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                <X />
                关闭
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
