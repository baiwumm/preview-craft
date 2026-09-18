import { contextBridge } from 'electron';

// P0 骨架：IPC bridge 按 PLAN.md 第二节契约在 P1 起逐步补全。
// contextBridge.exposeInMainWorld('api', { ... })
contextBridge.exposeInMainWorld('api', {});
