import { Button, Description, Label, ListBox, ProgressBar, Select, Spinner } from '@heroui/react';
import { Camera, Download } from 'lucide-react';
import type { ReactElement } from 'react';

import type { ExportFormat } from '@shared/types';

export interface ExportProgress {
  phase: 'capturing' | 'composing' | 'saving';
  text: string;
  percent: number;
}

interface ExportPanelProps {
  format: ExportFormat;
  scale: 1 | 2 | 3;
  onFormatChange: (format: ExportFormat) => void;
  onScaleChange: (scale: 1 | 2 | 3) => void;
  onCapture: () => void;
  onExport: () => void;
  exporting: ExportProgress | null;
  canExport: boolean;
}

const FORMATS: Array<{ id: ExportFormat; label: string }> = [
  { id: 'png', label: 'PNG（无损）' },
  { id: 'jpg', label: 'JPG（体积小）' },
  { id: 'webp', label: 'WebP（更小）' }
];

const SCALES: Array<{ id: '1' | '2' | '3'; label: string; value: 1 | 2 | 3 }> = [
  { id: '1', label: '1x（标准）', value: 1 },
  { id: '2', label: '2x（推荐）', value: 2 },
  { id: '3', label: '3x（超清）', value: 3 }
];

/** 导出面板：格式/倍率选择 + 导出按钮 + 进度 */
export default function ExportPanel({
  format,
  scale,
  onFormatChange,
  onScaleChange,
  onCapture,
  onExport,
  exporting,
  canExport
}: ExportPanelProps): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <Select
        aria-label="导出格式"
        className="w-full"
        selectedKey={format}
        onSelectionChange={(key) => onFormatChange(key as ExportFormat)}
      >
        <Label>导出格式</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {FORMATS.map((f) => (
              <ListBox.Item key={f.id} id={f.id} textValue={f.label}>
                {f.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <Select
        aria-label="导出倍率"
        className="w-full"
        selectedKey={String(scale) as '1' | '2' | '3'}
        onSelectionChange={(key) => {
          const found = SCALES.find((s) => s.id === key);
          if (found) onScaleChange(found.value);
        }}
      >
        <Label>导出倍率</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {SCALES.map((s) => (
              <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                {s.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
            <div className="flex gap-2">
      <Button
        variant="secondary"
        onPress={onCapture}
        isDisabled={!canExport || exporting !== null}
      >
        {exporting?.phase === 'capturing' ? <Spinner /> : <Camera />}
        {exporting?.phase === 'capturing' ? '截取中…' : '仅截图'}
      </Button>
      <Button variant="primary" onPress={onExport} isDisabled={!canExport || exporting !== null}>
        {exporting ? <Spinner /> : <Download />}
        {exporting
          ? exporting.phase === 'capturing'
            ? '截取中…'
            : '导出中…'
          : '导出'}
      </Button>
      </div>
      <Description>
        仅截图 = 用真实截图替换画布预览；导出 = 截图 + 合成排版，完成后弹出保存对话框并复制到剪贴板。
      </Description>
      <Description>快捷键：Ctrl+Enter 截图 · Ctrl+S 导出 · Ctrl+V 贴网址</Description>

      {exporting ? (
        <ProgressBar aria-label="导出进度" value={exporting.percent}>
          <Label>{exporting.text}</Label>
          <ProgressBar.Output />
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : null}
    </div>
  );
}
