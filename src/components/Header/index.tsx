/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-15 14:17:45
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-20 09:23:27
 * @Description: 顶部操作栏
 */
"use client";
import { snapdom } from '@zumer/snapdom';
import { Download, Eye, Globe, TriangleAlert } from "lucide-react";
import { DynamicIcon } from 'lucide-react/dynamic';
import { type Dispatch, type FC, type KeyboardEventHandler, type SetStateAction, useState } from 'react';
import { toast } from 'sonner';

import ModeHint from '@/components/ModeHint';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, InputAddon, InputGroup, InputWrapper } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { DEVICES, EXPORT_FORMAT, MODE } from '@/enums';

type HeaderProps = {
  url: string;
  setUrl: Dispatch<SetStateAction<string>>;
  deviceUrls: Record<App.DeviceType, string>;
  setDeviceUrls: Dispatch<SetStateAction<Record<App.DeviceType, string>>>;
  onPreview: VoidFunction;
  mode: App.Mode;
  setMode: Dispatch<SetStateAction<App.Mode>>;
  isPuppeteerSupported: boolean;
}

const Header: FC<HeaderProps> = ({ url, setUrl, deviceUrls, setDeviceUrls, onPreview, mode, setMode, isPuppeteerSupported }) => {
  // 导出格式
  const [exportFormat, setExportFormat] = useState<App.ExportFormat>(EXPORT_FORMAT.PNG);
  // 导出 Loading
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  // 回车预览
  const handleEnterPreview: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' && url.trim()) {
      e.preventDefault();
      onPreview();
    }
  };

  // 点击预览
  const handlePreview = () => {
    if (url.trim()) {
      onPreview()
    }
  };

  // 导出图片
  const handleExport = async () => {
    const el = document.getElementById('preview');
    if (!el) {
      toast.custom(
        (t) => (
          <Alert variant="destructive" onClose={() => toast.dismiss(t)}>
            <AlertIcon>
              <TriangleAlert />
            </AlertIcon>
            <AlertTitle>指定元素不存在!</AlertTitle>
          </Alert>
        ),
        {
          duration: 3000,
        },
      )
      return
    }
    // 开启 Loading
    setExportLoading(true);
    // 预览模式，如果支持 puppeteer，则直接导出图片
    if (mode === MODE.PREVIEW && isPuppeteerSupported) {
      const url = window.location.origin + window.location.pathname;

      const res = await fetch('/api/puppeteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          selector: '#preview',
        }),
      }).finally(() => {
        setExportLoading(false)
      });

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'preview.png';
      a.click();

      URL.revokeObjectURL(downloadUrl);
    }
    // 导出模式
    if (mode === MODE.EXPORT) {
      await snapdom.download(el, {
        type: exportFormat,
        filename: 'preview',
        useProxy: "https://proxy.corsfix.com/?",
        cache: 'disabled'
      }).finally(() => {
        setExportLoading(false)
      });
    }
  };
  return (
    <div className="p-4 flex flex-col gap-2">
      <div className="flex gap-2 items-center justify-center">
        <Select value={mode} onValueChange={(value) => setMode(value as App.Mode)}>
          <SelectTrigger className="w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODE.items.map(({ value, label, raw }) => (
              <SelectItem key={value} value={value}>
                <span className="flex items-center gap-2 text-xs">
                  <DynamicIcon name={raw.icon} className="size-4 opacity-60" />
                  <span>{label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-80">
          <InputWrapper>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="dim" mode="icon">
                  <Globe />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <div className="flex flex-col gap-2">
                  {DEVICES.items.map(({ value, label, raw }) => (
                    <InputGroup key={value}>
                      <InputAddon>
                        <div className="flex items-center gap-2 text-xs w-20">
                          <DynamicIcon name={raw.icon} />
                          <span>{label}</span>
                        </div>
                      </InputAddon>
                      <Input
                        variant='sm'
                        value={deviceUrls[value]}
                        onChange={(e) => setDeviceUrls(prev => ({
                          ...prev,
                          [value]: e.target.value,
                        }))}
                        placeholder="请输入网址"
                      />
                    </InputGroup>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Input
              variant='sm'
              value={url}
              onKeyDown={handleEnterPreview}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="请输入网址（回车预览）"
            />
          </InputWrapper>
        </div>
        <Button variant="secondary" size='sm' disabled={exportLoading} onClick={handlePreview}>
          <Eye />
          预览
        </Button>
        <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as App.ExportFormat)}>
          <SelectTrigger className="w-40 text-xs">
            导出格式：<SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPORT_FORMAT.items.map(({ value, label }) => (
              <SelectItem key={value} value={value} disabled={value !== EXPORT_FORMAT.PNG} className="text-xs">{label} </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" size='sm' disabled={!isPuppeteerSupported || exportLoading} onClick={handleExport}>
          {exportLoading ? (
            <Spinner variant="circle" />
          ) : (
            <Download />
          )}
          导出
        </Button>
        <ThemeSwitcher />
      </div>
      {/* 截图说明 */}
      <ModeHint mode={mode} />
    </div>
  )
}
export default Header;