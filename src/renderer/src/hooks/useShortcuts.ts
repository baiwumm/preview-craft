import { useEffect } from 'react';

interface ShortcutHandlers {
  /** Ctrl/Cmd + Enter：截图 */
  onCapture: () => void;
  /** Ctrl/Cmd + S：导出 */
  onExport: () => void;
  /** Ctrl/Cmd + V（焦点不在输入框时）：读取剪贴板填入 URL */
  onPasteUrl: () => void;
  /** 弹出层打开时暂停快捷键 */
  enabled: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/**
 * 窗口级快捷键（仅窗口聚焦时生效，不注册全局快捷键）。
 * Ctrl+V 只在焦点不在输入区时接管，避免与原生粘贴重复插入。
 */
export function useShortcuts({
  onCapture,
  onExport,
  onPasteUrl,
  enabled
}: ShortcutHandlers): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key === 'enter') {
        event.preventDefault();
        onCapture();
        return;
      }
      if (key === 's') {
        event.preventDefault();
        onExport();
        return;
      }
      if (key === 'v' && !isEditableTarget(event.target)) {
        // 不拦截 Ctrl+Shift+V（粘贴为纯文本）
        if (event.shiftKey) return;
        event.preventDefault();
        onPasteUrl();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCapture, onExport, onPasteUrl, enabled]);
}
