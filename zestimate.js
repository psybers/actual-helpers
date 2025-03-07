const { Builder, Browser, By, until } = require('selenium-webdriver')
const api = require('@actual-app/api');
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, openBudget, showPercent, sleep } = require('./utils');
require("dotenv").config();

async function getZestimate(URL) {
    let driver = await new Builder()
        .forBrowser(Browser.CHROME)
        .build();

    try {
      await driver.get(URL);
      const html = await driver.wait(until.elementLocated(By.css('body')), 5000).getAttribute('innerHTML');

      try {
        const match = html.match(/"zestimate":"(\d+)"/);
        if (match) {
          return parseInt(match[1]) * 100;
        }
      } catch (error) {
        console.log('Error parsing Zillow page:');
        console.log(error);
        console.log(html);
      }
    } finally {
      await driver.quit();
    }

    return undefined;
}

(async function() {
  await openBudget();

  const payeeId = await ensurePayee(process.env.ZESTIMATE_PAYEE_NAME || 'Zestimate');

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    const note = await getAccountNote(account);

    if (note && note.indexOf('zestimate:') > -1) {
      const URL = note.split('zestimate:')[1].split(' ')[0];

      let ownership = 1;
      if (note.indexOf('ownership:') > -1) {
        ownership = parseFloat(note.split('ownership:')[1].split(' ')[0]);
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
