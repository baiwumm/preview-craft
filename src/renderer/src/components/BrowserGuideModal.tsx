import { Button, Modal, ProgressBar } from '@heroui/react';
import type { ReactElement } from 'react';

import { formatBytes } from '@/lib/format';

import type { BrowserDownloadProgress, BrowserInfo } from '@shared/types';

interface BrowserGuideModalProps {
  open: boolean;
  /** 已检测到的浏览器（引导场景下通常为空） */
  browsers: BrowserInfo[];
  downloading: boolean;
  progress: BrowserDownloadProgress | null;
  error: string | null;
  onDownload: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

/**
 * 无浏览器引导：说明为何需要浏览器 + 一键下载 Chromium（带真实进度）+ 手动指定路径入口。
 */
export default function BrowserGuideModal({
  open,
  browsers,
  downloading,
  progress,
  error,
  onDownload,
  onOpenSettings,
  onDismiss
}: BrowserGuideModalProps): ReactElement {
  const chromiumPath = browsers.find((b) => b.kind === 'chromium');

  return (
    <Modal isOpen={open} onOpenChange={(next) => (next ? undefined : onDismiss())}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[480px]">
            <Modal.Header>
              <Modal.Heading>未检测到可用浏览器</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-sm">
                PreviewCraft 的截图能力依赖本机浏览器引擎（Chrome / Edge /
                Chromium）。未找到可用浏览器时，可以一键下载 Chromium。
              </p>
              <ul className="text-muted list-disc gap-1 pl-5 text-xs">
                <li>下载体积约 150 MB，保存到应用数据目录，仅本工具使用</li>
                <li>不会改动系统里已有的浏览器，也不会写入注册表</li>
                <li>已装好 Chrome / Edge 时，在「设置 → 浏览器」里手动指定路径即可</li>
              </ul>

              {chromiumPath ? (
                <p className="text-success text-xs">
                  已找到本地 Chromium：{chromiumPath.path}
                </p>
              ) : null}

              {downloading ? (
                <ProgressBar
                  aria-label="Chromium 下载进度"
                  value={progress && progress.percent > 0 ? progress.percent : undefined}
                >
                  <ProgressBar.Output />
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              ) : null}
              {downloading ? (
                <p className="text-muted text-xs">
                  {progress?.totalBytes
                    ? `正在下载 Chromium ${formatBytes(progress.downloadedBytes ?? 0)} / ${formatBytes(progress.totalBytes)}…`
                    : '正在准备下载 Chromium…'}
                </p>
              ) : null}
              {error ? <p className="text-danger text-xs">{error}</p> : null}
            </Modal.Body>
            <Modal.Footer className="flex-wrap">
              <Button variant="ghost" onPress={onDismiss}>
                稍后再说
              </Button>
              <Button variant="secondary" onPress={onOpenSettings}>
                指定浏览器路径
              </Button>
              <Button variant="primary" onPress={onDownload} isDisabled={downloading}>
                {downloading ? '下载中…' : '下载 Chromium'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
