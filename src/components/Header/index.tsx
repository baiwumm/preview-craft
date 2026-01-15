/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-15 14:17:45
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-15 16:27:15
 * @Description: 顶部操作栏
 */
import { Download, Eye, Globe } from "lucide-react";
import { DynamicIcon } from 'lucide-react/dynamic';
import { type Dispatch, type FC, type KeyboardEventHandler, type SetStateAction } from 'react';

import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import { Input, InputAddon, InputGroup, InputWrapper } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEVICES } from '@/enums';

type HeaderProps = {
  url: string;
  setUrl: Dispatch<SetStateAction<string>>;
  deviceUrls: Record<App.DeviceType, string>;
  setDeviceUrls: Dispatch<SetStateAction<Record<App.DeviceType, string>>>;
  onPreview: VoidFunction;
}

const Header: FC<HeaderProps> = ({ url, setUrl, deviceUrls, setDeviceUrls, onPreview }) => {
  // 回车预览
  const handleEnterPreview: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' && url.trim()) {
      e.preventDefault();
      onPreview();
    }
  };
  return (
    <div className="p-4 flex gap-2 items-center justify-center">
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
      <Button size='sm' onClick={onPreview}>
        <Eye />
        预览
      </Button>
      <Button variant="secondary" size='sm'>
        <Download />
        导出
      </Button>
      <ThemeSwitcher />
    </div>
  )
}
export default Header;