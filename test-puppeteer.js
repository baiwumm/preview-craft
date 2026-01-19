import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });

  console.log("puppeteer ok");

  await browser.close();
})();
