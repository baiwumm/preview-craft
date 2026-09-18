import { Button, ColorField, ColorSwatch, Label, parseColor, Slider, Switch,Description } from '@heroui/react';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { devicePresets } from '@shared/devices';
import type { DeviceId, Placement, Template } from '@shared/types';

import { backgrounds, isTransparentBackground, CHECKER_CSS } from '@templates/backgrounds';

import { buildCustomBackground, isCustomBackground, type StyleState } from '@/lib/design';

function toColor(hex: string) {
  try {
    return parseColor(hex);
  } catch {
    return null;
  }
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps): ReactElement {
  return (
    <div className="flex flex-col gap-3 border-separator border-b pb-4">
      <p className="text-foreground text-xs font-semibold">{title}</p>
      {children}
    </div>
  );
}

interface StylePanelProps {
  template: Template;
  style: StyleState;
  onTemplateChange: (updater: (template: Template) => Template) => void;
  onStyleChange: (patch: Partial<StyleState>) => void;
  onSaveAsTemplate: () => void;
  onResetPreset: () => void;
  canReset: boolean;
}

/** 右侧样式面板：背景 / 画布 / 设备微调 / 另存 */
export default function StylePanel({
  template,
  style,
  onTemplateChange,
  onStyleChange,
  onSaveAsTemplate,
  onResetPreset,
  canReset
}: StylePanelProps): ReactElement {
  const [selectedDevice, setSelectedDevice] = useState<DeviceId>(
    template.placements[0]?.device ?? 'desktop'
  );

  const placement: Placement | undefined = template.placements.find(
    (p) => p.device === selectedDevice
  );

  const updatePlacement = (patch: Partial<Placement>): void => {
    onTemplateChange((t) => ({
      ...t,
      placements: t.placements.map((p) => (p.device === selectedDevice ? { ...p, ...patch } : p))
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="背景">
        <div className="grid grid-cols-3 gap-2">
          {backgrounds.map((bg) => {
            const active = template.background === bg.key;
            return (
              <button
                key={bg.key}
                type="button"
                onClick={() => onTemplateChange((t) => ({ ...t, background: bg.key }))}
                className={`cursor-pointer rounded-lg border p-1 transition-all ${
                  active ? 'border-accent ring-accent ring-2' : 'border-separator'
                }`}
                title={bg.name}
              >
                <span
                  className="block h-6 w-full rounded"
                  style={{
                    background: isTransparentBackground(bg.key) ? CHECKER_CSS : bg.value
                  }}
                  aria-hidden
                />
                <span className="text-foreground mt-1 block text-center text-[10px]">
                  {bg.name}
                </span>
              </button>
            );
          })}
        </div>
        {isCustomBackground(template.background) ? (
          <p className="text-muted text-xs">自定义渐变已应用</p>
        ) : null}
        <div className="flex items-center gap-2">
          <ColorField
            aria-label="渐变起始色"
            className="flex-1"
            value={toColor(style.customFrom)}
            onChange={(c) => {
              if (!c) return;
              const hex = c.toString('hex');
              onStyleChange({ customFrom: hex });
              onTemplateChange((t) => ({
                ...t,
                background: buildCustomBackground(hex, style.customTo)
              }));
            }}
          >
            <Label>起始色</Label>
            <ColorField.Group>
              <ColorField.Prefix>
                <ColorSwatch color={style.customFrom || undefined} size="xs" />
              </ColorField.Prefix>
              <ColorField.Input />
            </ColorField.Group>
          </ColorField>
          <ColorField
            aria-label="渐变结束色"
            className="flex-1"
            value={toColor(style.customTo)}
            onChange={(c) => {
              if (!c) return;
              const hex = c.toString('hex');
              onStyleChange({ customTo: hex });
              onTemplateChange((t) => ({
                ...t,
                background: buildCustomBackground(style.customFrom, hex)
              }));
            }}
          >
            <Label>结束色</Label>
            <ColorField.Group>
              <ColorField.Prefix>
                <ColorSwatch color={style.customTo || undefined} size="xs" />
              </ColorField.Prefix>
              <ColorField.Input />
            </ColorField.Group>
          </ColorField>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            onTemplateChange((t) => ({
              ...t,
              background: buildCustomBackground(style.customFrom, style.customTo)
            }))
          }
        >
          应用自定义渐变
        </Button>
      </Section>

      <Section title="画布">
        <Slider
          className="w-full"
          minValue={0}
          maxValue={48}
          step={1}
          value={style.borderRadius}
          onChange={(v) => onStyleChange({ borderRadius: Array.isArray(v) ? v[0] : v })}
        >
          <div className="flex w-full justify-between">
            <Label>圆角</Label>
            <Slider.Output />
          </div>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Slider
          className="w-full"
          minValue={0.5}
          maxValue={1.5}
          step={0.05}
          value={style.zoom}
          onChange={(v) => onStyleChange({ zoom: Array.isArray(v) ? v[0] : v })}
        >
          <div className="flex w-full justify-between">
            <Label>整体缩放</Label>
            <Slider.Output />
          </div>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Switch
          isSelected={style.shadow}
          onChange={(selected) => onStyleChange({ shadow: selected })}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            设备阴影
          </Switch.Content>
        </Switch>
      </Section>

      <Section title="设备微调（仅当前会话生效）">
        <div className="flex gap-2">
          {template.placements.map((p) => (
            <button
              key={p.device}
              type="button"
              onClick={() => setSelectedDevice(p.device)}
              className={`cursor-pointer rounded-lg border px-3 py-1 text-xs transition-colors ${
                selectedDevice === p.device
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-separator text-foreground'
              }`}
            >
              {devicePresets[p.device].label}
            </button>
          ))}
        </div>
        {placement ? (
          <div className="flex flex-col gap-3">
            <Slider
              className="w-full"
              minValue={0}
              maxValue={template.canvas.width}
              step={1}
              value={placement.x}
              onChange={(v) => updatePlacement({ x: Array.isArray(v) ? v[0] : v })}
            >
              <div className="flex w-full justify-between">
                <Label>X</Label>
                <Slider.Output />
              </div>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <Slider
              className="w-full"
              minValue={0}
              maxValue={template.canvas.height}
              step={1}
              value={placement.y}
              onChange={(v) => updatePlacement({ y: Array.isArray(v) ? v[0] : v })}
            >
              <div className="flex w-full justify-between">
                <Label>Y</Label>
                <Slider.Output />
              </div>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <Slider
              className="w-full"
              minValue={80}
              maxValue={820}
              step={1}
              value={placement.width}
              onChange={(v) => updatePlacement({ width: Array.isArray(v) ? v[0] : v })}
            >
              <div className="flex w-full justify-between">
                <Label>宽度</Label>
                <Slider.Output />
              </div>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <Slider
              className="w-full"
              minValue={-45}
              maxValue={45}
              step={1}
              value={placement.rotation ?? 0}
              onChange={(v) => updatePlacement({ rotation: Array.isArray(v) ? v[0] : v })}
            >
              <div className="flex w-full justify-between">
                <Label>旋转</Label>
                <Slider.Output />
              </div>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          </div>
        ) : null}
      </Section>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
        <Button variant="primary" onPress={onSaveAsTemplate}>
          另存为模板
        </Button>
        <Button variant="tertiary" onPress={onResetPreset} isDisabled={!canReset}>
          还原预设
        </Button>
        </div>
        <Description>微调仅作用于当前会话，另存为模板后才会持久化。</Description>
      </div>
    </div>
  );
}
