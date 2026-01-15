import { Download, Eye, Globe } from "lucide-react";
import { useState } from 'react';

import DeviceFrame from '@/components/DeviceFrame';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import { deviceBg } from '@/components/ui/device';
import { Input, InputWrapper } from '@/components/ui/input';

function App() {
  // 网址
  const [url, setUrl] = useState(import.meta.env.VITE_APP_URL);
  return (
    <main className="w-300 mx-auto min-h-screen grid grid-rows-[auto_1fr]">
      {/* 顶部按钮 */}
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
      {/* 设备预览 */}
      <div className="flex items-center justify-center">
        <div className="relative w-full h-162.5">
          {/* <div className={deviceBg({ type: 'desktop' })}>
            <iframe id="desktop" src={url} className="w-full h-101 rounded-lg" />
          </div> */}
          <DeviceFrame url={url} type='desktop' />
          <DeviceFrame url={url} type='laptop' />
          <DeviceFrame url={url} type='tablet' />
          <DeviceFrame url={url} type='mobile' />
          {/* <div className={deviceBg({ type: 'laptop' })}>
            <iframe id="laptop" src={url} className="absolute w-117 h-73.5 rounded-t-md rounded-b-sm left-1/2 -translate-x-1/2" />
          </div>
          <div className={deviceBg({ type: 'tablet' })}>
            <iframe id="tablet" src={url} className="w-full h-full rounded-lg" />
          </div>
          <div className={deviceBg({ type: 'mobile' })}>
            <iframe id="mobile" src={url} className="w-full h-full rounded-4xl" />
          </div> */}
        </div>
      </div>
    </main>
  )
}

export default App
