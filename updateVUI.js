// updateVUI.js
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// ── Función 1: Extraer VUI de la página ──
async function extractVUI(page) {
  // ✅ Buscamos por texto visible, no por estructura frágil
  await page.waitForFunction(() => {
    const span = Array.from(document.querySelectorAll('span')).find(el =>
      el.textContent.trim().startsWith('Bs.')
    );
    return span ? span.textContent.trim() : null;
  }, { timeout: 45000 });

  const vuiText = await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll('span')).find(el =>
      el.textContent.trim().startsWith('Bs.')
    );
    return span?.textContent.trim() || '';
  });

  if (!vuiText.startsWith('Bs.')) {
    throw new Error(`VUI inválido: "${vuiText}"`);
  }

  // Parseo seguro: "Bs. 1.234,56" → 1234.56
  return parseFloat(
    vuiText.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim()
  );
}

// ── Función 2: Actualizar Google Sheets ──
async function updateSheet(date, vui) {
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
}

// ── Función principal ──
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

    // 👇 Espera adicional si hay carga dinámica o banners
    await page.waitForTimeout(2000);

    const vui = await extractVUI(page);
    const date = new Date().toISOString().split('T')[0];
    console.log(`[${date}] VUI = ${vui}`);

    await updateSheet(date, vui);
    console.log('✅ Actualizado correctamente');

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

updateVUI().catch(() => process.exit(1));
