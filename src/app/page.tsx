/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-19 10:03:35
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-20 09:18:00
 * @Description: 预览页面
 */
"use client";
import { TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { type FC, useEffect, useState } from 'react';
import { toast } from 'sonner';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import PreviewContainer from '@/components/PreviewContainer';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { MODE } from '@/enums';
import { usePuppeteerSupport } from '@/hooks/usePuppeteerSupport';
import { normalizeAndValidate } from '@/lib/utils';

const DEFAULT_INPUT_URL = normalizeAndValidate(
  process.env.NEXT_PUBLIC_PREVIEW_URL ?? 'baiwumm.com'
)

const App: FC = () => {
  const [mounted, setMounted] = useState(false);
  // 是否支持 puppeteer
  const { isPuppeteerSupported } = usePuppeteerSupport();
  // 当前模式
  const [mode, setMode] = useState<App.Mode>(MODE.PREVIEW);
  // 输入态（给 Header）
  const [url, setUrl] = useState(DEFAULT_INPUT_URL || 'https://baiwumm.com');
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

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) {
    return null
  }
  return (
    <motion.main
      className="w-300 mx-auto min-h-screen grid grid-rows-[auto_1fr_auto]"
      initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.75 }}
    >
      {/* 顶部操作栏 */}
      <Header
        url={url}
        setUrl={setUrl}
        deviceUrls={deviceUrls}
        setDeviceUrls={setDeviceUrls}
        onPreview={handlePreview}
        mode={mode}
        setMode={setMode}
        isPuppeteerSupported={isPuppeteerSupported}
      />
      {/* 预览区域 */}
      <PreviewContainer url={activeUrl} deviceUrls={activeDeviceUrls} mode={mode} />
      {/* 底部版权 */}
      <Footer />
    </motion.main>
  )
}

export default App;
