import { useState } from 'react';

import DeviceFrame from '@/components/DeviceFrame';
import Header from '@/components/Header';
import { DEVICES } from '@/enums';

function App() {
  // 网址
  const [url, setUrl] = useState(import.meta.env.VITE_APP_URL);

  // 各设备独立 URL
  const [deviceUrls, setDeviceUrls] = useState<Record<typeof DEVICES.valueType, string>>({
    desktop: '',
    laptop: '',
    tablet: '',
    mobile: '',
  });
  return (
    <main className="w-300 mx-auto min-h-screen grid grid-rows-[auto_1fr]">
      {/* 顶部操作栏 */}
      <Header url={url} setUrl={setUrl} />
      {/* 设备预览 */}
      <div className="flex items-center justify-center">
        <div className="relative w-full h-162.5">
          {DEVICES.items.map(({ value }) => (
            <DeviceFrame key={value} url={deviceUrls[value] || url} type={value} />
          ))}
        </div>
      </div>
    </main>
  )
}

export default App
