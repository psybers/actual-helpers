const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const api = require('@actual-app/api');
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getTagValue, openBudget, showPercent, sleep } = require('./utils');
require("dotenv").config();

puppeteer.use(StealthPlugin());

async function getZestimate(URL) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const html = await page.content();

    try {
      let match = html.match(/"zestimate":"(\d+)"/);
      if (match) {
        return parseInt(match[1]) * 100;
      }
      match = html.match(/\\"zestimate\\":\\"(\d+)\\"/);
      if (match) {
        return parseInt(match[1]) * 100;
      }
    } catch (error) {
      console.log('Error parsing Zillow page:');
      console.log(error);
      console.log(html);
    }
  } finally {
    await browser.close();
  }

  return undefined;
}

(async function () {
  await openBudget();

  const payeeId = await ensurePayee(process.env.ZESTIMATE_PAYEE_NAME || 'Zestimate');

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    const note = await getAccountNote(account);

    if (note && note.indexOf('zestimate:') > -1) {
      const URL = getTagValue(note, 'zestimate');

      let ownership = 1;
      if (note.indexOf('ownership:') > -1) {
        ownership = parseFloat(getTagValue(note, 'ownership'));
      }

      console.log('Fetching zestimate for account:', account.name);
      console.log('Zillow URL:', URL);

      const zestimate = await getZestimate(URL);
      if (!zestimate) {
        console.log('Was unable to get Zestimate, skipping');
        continue;
      }
      const balance = await getAccountBalance(account);
      const diff = (zestimate * ownership) - balance;

      console.log('Zestimate:', zestimate);
      console.log('Ownership:', zestimate * ownership);
      console.log('Balance:', balance);
      console.log('Difference:', diff);

      if (diff != 0) {
        await api.importTransactions(account.id, [{
          date: new Date(),
          payee: payeeId,
          amount: diff,
          cleared: true,
          reconciled: true,
          notes: `Update Zestimate to ${zestimate * ownership / 100} (${zestimate / 100}*${showPercent(ownership)})`,
        }]);
      }

      await sleep(1324);
    }
  }

  await closeBudget();
})();