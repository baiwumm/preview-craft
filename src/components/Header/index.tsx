/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-15 14:17:45
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-15 14:18:57
 * @Description: 顶部操作栏
 */
import { Download, Eye, Globe } from "lucide-react";
import { type FC } from 'react';

import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';

type HeaderProps = {
  url: string;
  setUrl: (url: string) => void;
}

const Header: FC<HeaderProps> = ({ url, setUrl }) => {
  return (
    <div className="p-4 flex gap-2 items-center justify-center">
      <div className="w-80">
        <InputWrapper>
          <Globe />
          <Input variant='sm' value={url} onChange={(e) => setUrl(e.target.value)} placeholder="请输入网址" />
        </InputWrapper>
      </div>
      <Button size='sm'>
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