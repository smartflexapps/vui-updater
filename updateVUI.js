// updateVUI.js
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');

async function updateVUI() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://www.per-capital.com/fondos', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // ✅ Selector CSS completo y preciso
    const selector = 'body > main > section > div > div:nth-child(2) > article > div > div > div:nth-child(1) > div.mt-6.text-4xl.md\\:text-3xl.lg\\:text-5xl.font-extrabold.flex.items-center.justify-center.gap-3 > span';

    await page.waitForSelector(selector, { timeout: 45000 });
    const vuiText = await page.$eval(selector, el => el.textContent.trim());

    if (!vuiText || !vuiText.startsWith('Bs.')) {
      throw new Error('VUI inválido: ' + vuiText);
    }

    const vui = parseFloat(
      vuiText
        .replace('Bs.', '')
        .replace(/\./g, '')
        .replace(',', '.')
    );

    const date = new Date().toISOString().split('T')[0];
    console.log(`[${date}] VUI = ${vui}`);

    // === Google Sheets ===
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['VUI'];
    if (!sheet) throw new Error('Pestaña "VUI" no encontrada');

    await sheet.loadCells('A1:B2');
    sheet.getCellByA1('A2').value = date;
    sheet.getCellByA1('B2').value = vui;
    await sheet.saveUpdatedCells();

    console.log('✅ Actualizado correctamente');

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

updateVUI().catch(() => process.exit(1));
