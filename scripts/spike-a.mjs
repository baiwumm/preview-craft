/**
 * Spike A: verify whether capturePage of a hidden BrowserWindow produces a
 * non-empty PNG. Strategy 1: show:false; Strategy 2: off-screen coords +
 * show:true; Strategy 3: offscreen rendering mode. Conclusions go into
 * PLAN.md. This temp script is removed in P5.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

const PAGE =
  '<body style="margin:0"><div style="width:100vw;height:100vh;background:linear-gradient(135deg,#ff5f6d,#ffc371)"></div></body>';

const workDir = join(tmpdir(), 'preview-craft', 'spike-a');
const htmlPath = join(workDir, 'page.html');

function diagnose(win, label) {
  win.webContents.on('did-finish-load', () => console.log(`[${label}] did-finish-load`));
  win.webContents.on('did-fail-load', (_e, code, desc) =>
    console.log(`[${label}] did-fail-load code=${code} desc=${desc}`)
  );
  win.webContents.on('render-process-gone', (_e, details) =>
    console.log(`[${label}] render-process-gone: ${JSON.stringify(details)}`)
  );
}

async function capture(win, outPath, label) {
  diagnose(win, label);
  // In this environment the loadFile promise rejects with ERR_FAILED even
  // though did-finish-load fires, so wait on events instead.
  const loaded = new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', resolve);
    win.webContents.once('did-fail-load', (_e, code, desc) => reject(new Error(`${code} ${desc}`)));
  });
  win.loadFile(htmlPath).catch(() => {});
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await win.webContents.capturePage();
  const buffer = image.toPNG();
  await writeFile(outPath, buffer);
  win.destroy();
  return buffer.length;
}

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {}); // destroying windows must not quit the app here

app.whenReady().then(async () => {
  await mkdir(workDir, { recursive: true });
  await writeFile(htmlPath, PAGE);

  const results = {};

  const strategies = [
    ['hidden', new BrowserWindow({ show: false, width: 800, height: 600 }), 'hidden.png'],
    [
      'offscreenPos',
      new BrowserWindow({ show: true, x: -32000, y: -32000, width: 800, height: 600 }),
      'offscreen-pos.png'
    ],
    [
      'offscreenMode',
      new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: { offscreen: true }
      }),
      'offscreen-mode.png'
    ]
  ];

  for (const [label, win, file] of strategies) {
    try {
      results[label] = await capture(win, join(workDir, file), label);
    } catch (error) {
      results[label] = `FAILED: ${String(error)}`;
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  console.log('[Spike A]', JSON.stringify(results));
  await new Promise((resolve) => setTimeout(resolve, 500)); // let stdout flush
  app.exit(0);
});
