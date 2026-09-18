import { Button } from '@heroui/react';
import type { ReactElement } from 'react';

import desktopFrame from '@frames/desktop.png';

export default function App(): ReactElement {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8">
      <Button variant="primary" onPress={() => console.log('P0 样式链路验证 OK')}>
        PreviewCraft 启动成功
      </Button>
      <img src={desktopFrame} alt="desktop 设备壳" className="w-[620px]" draggable={false} />
    </div>
  );
}
