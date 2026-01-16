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

    // === 2. Navegar a la página ===
    await page.goto('https://www.per-capital.com/fondos', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // === 3. Esperar y extraer el VUI de forma precisa ===
    await page.waitForFunction(
      () => document.body.innerText.includes('VUI') && document.body.innerText.includes('Bs.'),
      { timeout: 45000 }
    );

    const vuiText = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n').map(line => line.trim()).filter(line => line);
      
      // Encontrar la línea que dice exactamente "VUI"
      const vuiIndex = lines.findIndex(line => line === 'VUI');
      if (vuiIndex === -1) return null;

      // Buscar el primer valor "Bs." después de "VUI"
      for (let i = vuiIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith('Bs.')) {
          return lines[i];
        }
      }
      return null;
    });

    if (!vuiText) {
      throw new Error('No se encontró el VUI después del texto "VUI"');
    }

    // === 4. Limpiar y convertir el valor ===
    const vui = parseFloat(
      vuiText
        .replace('Bs.', '')
        .replace(/\./g, '')   // elimina puntos de miles
        .replace(',', '.')    // convierte coma decimal a punto
    );

    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    console.log(`[${date}] VUI = ${vui}`);

    // === 5. Actualizar Google Sheets ===
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
