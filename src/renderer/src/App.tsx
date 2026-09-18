import { Card } from '@heroui/react';
import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

import Canvas from '@/components/Canvas';
import UrlBar from '@/components/UrlBar';
import { useTheme } from '@/hooks/useTheme';
import { presets } from '@templates/presets';
import type { DeviceId } from '@shared/types';

export default function App(): ReactElement {
  const { theme, toggleTheme } = useTheme();

  // 已提交的 URL 状态：仅回车/点击刷新时更新，触发 iframe 重载
  const [mainUrl, setMainUrl] = useState('');
  const [deviceUrls, setDeviceUrls] = useState<Partial<Record<DeviceId, string>>>({});

  // P2 先接 classic，P3 模板画廊接管
  const [template] = useState(presets[0]);

  const handleApply = useCallback(
    (nextMain: string, nextDeviceUrls: Partial<Record<DeviceId, string>>) => {
      setMainUrl(nextMain);
      setDeviceUrls(nextDeviceUrls);
    },
    []
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-separator border-b px-4 py-3">
        <UrlBar
          url={mainUrl}
          deviceUrls={deviceUrls}
          onApply={handleApply}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="bg-background min-w-0 flex-1 p-6">
          <Canvas template={template} mainUrl={mainUrl} deviceUrls={deviceUrls} />
        </main>

        <aside className="border-separator w-80 shrink-0 overflow-y-auto border-l p-4">
          <Card className="bg-surface text-surface-foreground p-4">
            <Card.Header>
              <Card.Title>模板与样式</Card.Title>
              <Card.Description>P3 阶段开放模板画廊与样式定制</Card.Description>
            </Card.Header>
          </Card>
        </aside>
      </div>
    </div>
  );
}
