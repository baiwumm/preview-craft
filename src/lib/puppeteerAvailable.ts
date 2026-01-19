let cached: boolean | null = null;

export async function isPuppeteerAvailable() {
  if (cached !== null) return cached;

  try {
    const puppeteer = await import('puppeteer');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });

    await browser.close();

    cached = true;
    return true;
  } catch {
    cached = false;
    return false;
  }
}
