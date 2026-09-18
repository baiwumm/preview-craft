import { Button, Input, Label, Modal, TextField } from '@heroui/react';
import { useState } from 'react';
import type { ReactElement } from 'react';

interface SaveTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}

/** 另存为模板 Modal：输入名称保存当前会话排版 */
export default function SaveTemplateModal({
  open,
  onOpenChange,
  onSave
}: SaveTemplateModalProps): ReactElement {
  const [name, setName] = useState('');

  const handleSave = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName('');
    onOpenChange(false);
  };

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[420px]">
            <Modal.Header>
              <Modal.Heading>另存为模板</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField aria-label="模板名称" className="w-full">
                <Label>模板名称</Label>
                <Input
                  placeholder="如：我的首页排版"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                  }}
                />
              </TextField>
              <p className="text-muted text-xs">
                保存当前画布的设备布局与背景；圆角、阴影、缩放等样式不会保存。
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="tertiary">
                取消
              </Button>
              <Button variant="primary" onPress={handleSave} isDisabled={!name.trim()}>
                保存
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
