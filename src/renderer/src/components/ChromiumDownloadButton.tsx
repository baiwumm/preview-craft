import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

interface ChromiumDownloadButtonProps {
  downloading: boolean;
  onStart: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
}

const CONFIRM_WINDOW = 8000;

/**
 * 「下载 Chromium」两段式确认。
 *
 * 一旦开始就没法中断：@puppeteer/browsers 的 install() 不接受 AbortSignal，下载又跑在
 * 主进程里。所以把误触的成本提前到点击处承担 —— 第一下只把按钮换成明确的确认态
 * （写出体积与「无法中途取消」），第二下才真的开始。
 */
export default function ChromiumDownloadButton({
  downloading,
  onStart,
  variant = 'secondary',
  size = 'sm'
}: ChromiumDownloadButtonProps): ReactElement {
  const [pending, setPending] = useState(false);

  // 确认态超时自动收回；下载真正开始后也复位，避免回来时停在确认态
  useEffect(() => {
    if (downloading) setPending(false);
  }, [downloading]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), CONFIRM_WINDOW);
    return () => clearTimeout(timer);
  }, [pending]);

  if (downloading) {
    return (
      <Button size={size} variant={variant} isDisabled>
        下载中…
      </Button>
    );
  }

  if (!pending) {
    return (
      <Button size={size} variant={variant} onPress={() => setPending(true)}>
        下载 Chromium
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size={size}
        variant="primary"
        onPress={() => {
          setPending(false);
          onStart();
        }}
      >
        确认下载（约 150 MB，无法中途取消）
      </Button>
      <Button size={size} variant="tertiary" onPress={() => setPending(false)}>
        取消
      </Button>
    </div>
  );
}
