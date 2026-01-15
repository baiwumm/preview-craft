/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-15 16:06:16
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-15 16:19:33
 * @Description: 预览区域
 */
import { memo } from 'react';

import DeviceFrame from '@/components/DeviceFrame';
import { DEVICES } from '@/enums';

interface PreviewContainerProps {
  url: string;
  deviceUrls: Record<App.DeviceType, string>;
}

const PreviewContainer = memo(function PreviewContainer({
  url,
  deviceUrls,
}: PreviewContainerProps) {
  return (
    <div className="flex items-center justify-center">
      <div className="relative w-full h-162.5">
        {DEVICES.items.map(({ value }) => {
          const previewUrl = deviceUrls[value] || url;
          return (
            <DeviceFrame
              key={value}
              type={value}
              url={previewUrl}
            />
          )
        })}
      </div>
    </div>
  );
});

export default PreviewContainer;
