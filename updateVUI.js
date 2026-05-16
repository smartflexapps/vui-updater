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

    // NUEVA URL
    await page.goto('https://www.per-capital.com/fondos/abierto', {
      waitUntil: 'networkidle2', // Espera a que cargue el contenido dinámico
      timeout: 60000
    });

    // Espera a que aparezca el texto "Precio de la Unidad de Inversión"
    await page.waitForFunction(
      () => document.body.innerText.includes('Precio de la Unidad de Inversión'),
      { timeout: 30000 }
    );
    console.log('✅ Texto "Precio de la Unidad de Inversión" encontrado.');

    // Extrae el valor usando expresión regular (busca Bs. 123.456,78 o Bs.123,45)
    const vuiText = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const match = bodyText.match(/Bs\.?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
      return match ? match[0] : null;
    });

    if (!vuiText) {
      throw new Error('No se pudo encontrar el valor del VUI con el patrón de búsqueda.');
    }

    console.log(`Valor VUI encontrado (crudo): ${vuiText}`);

    // Limpiar el texto para obtener el número
    let vuiNumero = vuiText
      .replace('Bs.', '')
      .replace('Bs', '')
      .trim()
      .replace(/\./g, '')   // quita puntos de miles
      .replace(',', '.');   // cambia coma decimal a punto

    const vui = parseFloat(vuiNumero);

    if (isNaN(vui)) {
      throw new Error(`No se pudo convertir "${vuiText}" a número.`);
    }

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
