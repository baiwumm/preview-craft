import { useState } from 'react';

import DeviceFrame from '@/components/DeviceFrame';
import Header from '@/components/Header';

function App() {
  // 网址
  const [url, setUrl] = useState(import.meta.env.VITE_APP_URL);
  return (
    <main className="w-300 mx-auto min-h-screen grid grid-rows-[auto_1fr]">
      {/* 顶部操作栏 */}
      <Header url={url} setUrl={setUrl} />
      {/* 设备预览 */}
      <div className="flex items-center justify-center">
        <div className="relative w-full h-162.5">
          <DeviceFrame url={url} type='desktop' />
          <DeviceFrame url={url} type='laptop' />
          <DeviceFrame url={url} type='tablet' />
          <DeviceFrame url={url} type='mobile' />
        </div>
      </div>
    </main>
  )
}

export default App
