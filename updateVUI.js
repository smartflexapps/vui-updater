// updateVUI.js
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');

async function updateVUI() {
  let browser;
  try {
    // === 1. Lanzar navegador con configuración robusta ===
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-features=HttpsFirstBalancedModeAutoEnable'
      ],
      timeout: 60000
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navegar
await page.goto('https://www.per-capital.com/fondos', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});

// Esperar a que aparezca el valor
await page.waitForFunction(
  () => document.body.innerText.includes('Bs.'),
  { timeout: 45000 }
);

// Extraer con regex
const vuiText = await page.evaluate(() => {
  const match = document.body.innerText.match(/Bs\.\s*[\d.,]+/);
  return match ? match[0].trim() : null;
});

if (!vuiText) throw new Error('VUI no encontrado en la página');

    // === 3. Extraer el VUI ===
    const vuiText = await page.$eval(
      'div.mt-6.text-4xl.md\\:text-3xl.lg\\:text-5xl.font-extrabold.flex.items-center.justify-center.gap-3 > span',
      el => el.textContent.trim()
    );

    if (!vuiText || !vuiText.startsWith('Bs.')) {
      throw new Error('VUI no encontrado: ' + vuiText);
    }

    // Limpiar formato: Bs.228,45 → 228.45
    const vui = parseFloat(
      vuiText
        .replace('Bs.', '')
        .replace(/\./g, '')   // elimina puntos de miles
        .replace(',', '.')    // convierte coma decimal a punto
    );

    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    console.log(`[${date}] VUI = ${vui}`);

    // === 4. Actualizar Google Sheets ===
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['VUI'];
    if (!sheet) throw new Error('No se encontró la pestaña "VUI"');

    await sheet.loadCells('A1:B2');
    sheet.getCellByA1('A2').value = date;
    sheet.getCellByA1('B2').value = vui;
    await sheet.saveUpdatedCells();

    console.log('✅ Celdas A2 y B2 actualizadas');

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

updateVUI().catch(() => process.exit(1));
