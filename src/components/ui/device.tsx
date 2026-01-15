import { cva } from "class-variance-authority";

export const deviceBg = cva(
  "absolute bg-no-repeat bg-contain bg-center overflow-hidden",
  {
    variants: {
      type: {
        desktop:
          "w-160 aspect-[671/629] top-0 left-1/2 -translate-x-1/2 p-3 bg-[url('/desktop.png')]",
        laptop:
          "w-150 aspect-[969/579] top-1/3 left-0 pt-4.5 bg-[url('/laptop.png')]",
        tablet:
          "w-75 aspect-[981/1293] top-1/4 right-1/10 p-3 bg-[url('/tablet.png')]",
        mobile:
          "w-42 aspect-[1000/2025] top-3/8 left-4/7 py-2 px-[9px] bg-[url('/mobile.png')]",
      },
    },
  }
);
