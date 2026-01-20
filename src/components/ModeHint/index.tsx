/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-19 15:29:57
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-20 09:24:34
 * @Description: 截图说明
 */
import { AnimatePresence, motion } from 'motion/react';
import { type FC } from 'react';

import { MODE } from '@/enums';

type ModeHintProps = {
  mode: App.Mode;
}

const ModeHint: FC<ModeHintProps> = ({ mode }) => {
  return (
    <div className="flex items-center justify-center text-xs text-red-500">
      <AnimatePresence mode="wait" initial={false}>
        {mode === MODE.PREVIEW ? (
          <motion.p
            key={MODE.PREVIEW}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            transition={{ duration: 0.35 }}>
            注: 预览模式只支持手动截图，由于 iframe 处于跨域沙盒中，无法安全访问其内部 DOM.
          </motion.p>
        ) : (
          <motion.p
            key={MODE.EXPORT}
            initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.35 }}>
            注: 截图由 <a
              href="https://microlink.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary hover:text-primary transition-colors"
            > Microlink API</a> 提供，有速率限制，属于“云端代拍”方案，速度快，但不对像素级完美负责.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
export default ModeHint;