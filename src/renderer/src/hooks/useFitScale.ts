import { useEffect, useRef, useState } from 'react';

/** 画布自适应缩放：在容器内等比缩放到最大可容纳尺寸 */
export function useFitScale(canvasWidth: number, canvasHeight: number): {
  ref: React.RefObject<HTMLDivElement | null>;
  scale: number;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setScale(Math.min(width / canvasWidth, height / canvasHeight));
      }
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  return { ref, scale };
}
