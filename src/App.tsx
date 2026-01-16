import { TriangleAlert } from 'lucide-react';
import { type FC, useState } from 'react';
import { toast, Toaster } from 'sonner';

import Header from '@/components/Header';
import PreviewContainer from '@/components/PreviewContainer';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { normalizeAndValidate } from '@/lib/utils';

const App: FC = () => {
  // 当前模式
  const [mode, setMode] = useState<App.Mode>('export');
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

  // 点击预览回调
  const handlePreview = () => {
    const validUrl = normalizeAndValidate(url)

    if (!validUrl) {
      toast.custom(
        (t) => (
          <Alert variant="destructive" onClose={() => toast.dismiss(t)}>
            <AlertIcon>
              <TriangleAlert />
            </AlertIcon>
            <AlertTitle>请输入有效的网址</AlertTitle>
          </Alert>
        ),
        {
          duration: 3000,
        },
      )
      return
    }

    const nextDeviceUrls = Object.fromEntries(
      Object.entries(deviceUrls).map(([k, v]) => {
        if (!v) return [k, '']
        const nv = normalizeAndValidate(v)
        return [k, nv ?? '']
      })
    ) as typeof deviceUrls

    setActiveUrl(validUrl)
    setActiveDeviceUrls(nextDeviceUrls)
  }
  return (
    <>
      <main className="w-300 mx-auto min-h-screen grid grid-rows-[auto_1fr]">
        {/* 顶部操作栏 */}
        <Header
          url={url}
          setUrl={setUrl}
          deviceUrls={deviceUrls}
          setDeviceUrls={setDeviceUrls}
          onPreview={handlePreview}
          mode={mode}
          setMode={setMode}
        />
        {/* 预览区域 */}
        <PreviewContainer url={activeUrl} deviceUrls={activeDeviceUrls} mode={mode} />
      </main>
      <Toaster position="top-center" />
    </>
  )
}

export default App
