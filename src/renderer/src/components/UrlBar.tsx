import { Accordion, Button, Input, TextField } from '@heroui/react';
import { useCallback, useImperativeHandle, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement, Ref } from 'react';

import { deviceIds, devicePresets } from '@shared/devices';
import type { DeviceId } from '@shared/types';

import { normalizeUrl } from '@shared/url';

export interface UrlBarHandle {
  /** 写入并提交一个地址（Ctrl+V 粘贴到地址栏用） */
  applyText: (text: string) => void;
  /** 聚焦地址输入框 */
  focus: () => void;
}

interface UrlBarProps {
  url: string;
  deviceUrls: Partial<Record<DeviceId, string>>;
  onApply: (mainUrl: string, deviceUrls: Partial<Record<DeviceId, string>>) => void;
  onCapture: () => void;
  onOpenSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  ref?: Ref<UrlBarHandle>;
}

/** 顶栏：主 URL 输入（回车刷新预览）+ 截图 / 设置入口 + 分设备 URL 折叠区 */
export default function UrlBar({
  url,
  deviceUrls,
  onApply,
  onCapture,
  onOpenSettings,
  theme,
  onToggleTheme,
  ref
}: UrlBarProps): ReactElement {
  const [mainDraft, setMainDraft] = useState(url);
  const [deviceDrafts, setDeviceDrafts] = useState<Partial<Record<DeviceId, string>>>(deviceUrls);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 校验并提交：主 URL 非空时必须合法；分设备 URL 非空时必须合法，否则回落主地址 */
  const submit = useCallback(
    (mainText: string, drafts: Partial<Record<DeviceId, string>>, allowEmpty: boolean) => {
      if (!mainText.trim()) {
        if (!allowEmpty) {
          setError('请输入网址');
          return;
        }
        setError(null);
        return;
      }
      const normalizedMain = normalizeUrl(mainText);
      if (!normalizedMain) {
        setError('请输入有效的 http/https 网址');
        return;
      }

      const normalizedDevices: Partial<Record<DeviceId, string>> = {};
      for (const device of deviceIds) {
        const raw = drafts[device]?.trim();
        if (!raw) continue;
        const normalized = normalizeUrl(raw);
        if (!normalized) {
          setError(`${devicePresets[device].label}地址无效（需 http/https）`);
          return;
        }
        normalizedDevices[device] = normalized;
      }

      setError(null);
      setMainDraft(normalizedMain);
      setDeviceDrafts((prev) => {
        const next: Partial<Record<DeviceId, string>> = { ...prev };
        for (const device of deviceIds) next[device] = normalizedDevices[device] ?? '';
        return next;
      });
      onApply(normalizedMain, normalizedDevices);
    },
    [onApply]
  );

  const handleMainKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') submit(mainDraft, deviceDrafts, false);
    },
    [mainDraft, deviceDrafts, submit]
  );

  useImperativeHandle(
    ref,
    () => ({
      applyText: (text: string) => submit(text, deviceDrafts, false),
      focus: () => inputRef.current?.focus()
    }),
    [submit, deviceDrafts]
  );

  const handleDeviceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') submit(mainDraft, deviceDrafts, true);
    },
    [mainDraft, deviceDrafts, submit]
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-3">
        <TextField aria-label="网站地址" className="flex-1">
          <Input
            ref={inputRef}
            placeholder="输入网址，回车刷新预览（如 github.com）"
            value={mainDraft}
            onChange={(event) => {
              setMainDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={handleMainKeyDown}
            onBlur={() => submit(mainDraft, deviceDrafts, true)}
          />
        </TextField>
        <Button variant="primary" onPress={() => submit(mainDraft, deviceDrafts, false)}>
          刷新预览
        </Button>
        <Button variant="secondary" onPress={onCapture} aria-label="截图（Ctrl+Enter）">
          截图
        </Button>
        <Button variant="ghost" onPress={onOpenSettings} aria-label="打开设置">
          设置
        </Button>
        <Button variant="ghost" onPress={onToggleTheme} aria-label="切换明暗主题">
          {theme === 'dark' ? '浅色' : '深色'}
        </Button>
      </div>

      <Accordion className="w-full">
        <Accordion.Item>
          <Accordion.Heading>
            <Accordion.Trigger>
              <span className="text-sm">分设备 URL（可选，留空使用主地址）</span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <div className="grid grid-cols-2 gap-3 pb-2">
                {deviceIds.map((device) => (
                  <TextField
                    key={device}
                    aria-label={`${devicePresets[device].label}地址`}
                    className="w-full"
                  >
                    <Input
                      placeholder={`${devicePresets[device].label} · 留空使用主地址`}
                      value={deviceDrafts[device] ?? ''}
                      onChange={(event) => {
                        setDeviceDrafts((prev) => ({ ...prev, [device]: event.target.value }));
                      }}
                      onKeyDown={handleDeviceKeyDown}
                      onBlur={() => submit(mainDraft, deviceDrafts, true)}
                    />
                  </TextField>
                ))}
              </div>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
