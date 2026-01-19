/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-19 14:15:44
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-19 14:44:10
 * @Description: 基于 microlink API 截图
 */
import { type MqlResponseData } from '@microlink/mql';
import useSWRMutation from 'swr/mutation';

import { DEVICES, THEME } from '@/enums';

export type ScreenshotParams = {
  url: string
  width: number
  height: number
  device: typeof DEVICES.valueType;
  theme: typeof THEME.valueType;
}

const screenshotFetcher = async (
  url: string,
  { arg }: { arg: ScreenshotParams }
): Promise<MqlResponseData> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(arg),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || '截图失败!')
  }

  return res.json()
}

export function useScreenshot() {
  const {
    trigger,
    data,
    error,
    isMutating,
    reset,
  } = useSWRMutation(
    '/api/screenshot',
    screenshotFetcher
  )
  return {
    screenshotUrl: data?.screenshot?.url,
    error,
    loading: isMutating,
    capture: trigger,
    reset,
  }
}
