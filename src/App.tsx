import { type FC, useState } from 'react';

import Header from '@/components/Header';
import PreviewContainer from '@/components/PreviewContainer';
import { normalizeUrl } from '@/lib/utils';

const App: FC = () => {
  // 输入态（给 Header）
  const [url, setUrl] = useState(import.meta.env.VITE_APP_URL ?? '');
  const [deviceUrls, setDeviceUrls] = useState<Record<App.DeviceType, string>>({
    desktop: '',
    laptop: '',
    tablet: '',
    mobile: '',
  });

  // 生效态（给 iframe）
  const [activeUrl, setActiveUrl] = useState(url);
  const [activeDeviceUrls, setActiveDeviceUrls] = useState(deviceUrls);

  const handlePreview = () => {
    setActiveUrl(normalizeUrl(url));
    setActiveDeviceUrls(
      Object.fromEntries(
        Object.entries(deviceUrls).map(([k, v]) => [
          k,
          v ? normalizeUrl(v) : '',
        ])
      ) as typeof deviceUrls
    );
  };
  return (
    <main className="w-300 mx-auto min-h-screen grid grid-rows-[auto_1fr]">
      {/* 顶部操作栏 */}
      <Header url={url} setUrl={setUrl} deviceUrls={deviceUrls} setDeviceUrls={setDeviceUrls} onPreview={handlePreview} />
      {/* 预览区域 */}
      <PreviewContainer
        url={activeUrl}
        deviceUrls={activeDeviceUrls}
      />
    </main>
  )
}

export default App
