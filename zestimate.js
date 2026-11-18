const { Builder, Browser, By, until } = require('selenium-webdriver')
const api = require('@actual-app/api');
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getTagValue, openBudget, showPercent, sleep } = require('./utils');
require("dotenv").config();

async function getZestimate(URL) {
    let driver = await new Builder()
        .forBrowser(Browser.CHROME)
        .build();

    try {
      await driver.get(URL);
      const html = await driver.wait(until.elementLocated(By.css('body')), 5000).getAttribute('innerHTML');

      try {
        let match = html.match(/\\?"zestimate\\?":(\d+)/);
        if (match) {
          return parseInt(match[1]) * 100;
        }
        match = html.match(/\\?"price\\?":(\d+)/);
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

const PROPERTIESAPI_URL = 'https://api.propertiesapi.com/v1/zillow/property';

// Optional: with PROPERTIESAPI_API_KEY set, read the Zestimate from the
// PropertiesAPI JSON API instead of loading the Zillow page in Chrome.
async function getZestimateFromApi(URL) {
  const response = await fetch(`${PROPERTIESAPI_URL}?${new URLSearchParams({ url: URL })}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Api-Key': process.env.PROPERTIESAPI_API_KEY,
    },
    // a lookup usually takes a few seconds, but the API asks clients to allow 120
    signal: AbortSignal.timeout(130000),
  });

  let body = {};
  try {
    body = await response.json();
  } catch (e) {
    // not JSON, e.g. a proxy error page
  }
  return { status: response.status, body: body };
}

(async function() {
  await openBudget();

  const payeeId = await ensurePayee(process.env.ZESTIMATE_PAYEE_NAME || 'Zestimate');

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    if (account.closed) {
      continue;
    }

    const note = await getAccountNote(account);

    if (note && note.indexOf('zestimate:') > -1) {
      const URL = getTagValue(note, 'zestimate');

      let ownership = 1;
      if (note.indexOf('ownership:') > -1) {
        ownership = parseFloat(getTagValue(note, 'ownership'));
      }

      console.log('Fetching zestimate for account:', account.name);
      console.log('Zillow URL:', URL);

      let zestimate;
      if (process.env.PROPERTIESAPI_API_KEY) {
        let result;
        try {
          result = await getZestimateFromApi(URL);
        } catch (error) {
          console.log('Error contacting PropertiesAPI, skipping:', error.message);
          continue;
        }

        const error = result.body.error || {};
        if (result.status === 401 || result.status === 402) {
          console.error(`PropertiesAPI refused the request (${error.code || result.status}): ${error.message || 'check PROPERTIESAPI_API_KEY'}`);
          process.exitCode = 1;
          break;
        }
        if (result.status === 429) {
          console.error(`PropertiesAPI rate limit reached (${error.code || result.status}), try again later`);
          process.exitCode = 1;
          break;
        }
        if (result.status !== 200) {
          console.log(`PropertiesAPI lookup failed (${error.code || result.status}), skipping: ${error.message || ''}`);
          continue;
        }

        // null when Zillow shows no Zestimate; the listing price is not used
        // instead, since for a rental it is the monthly rent
        const value = (result.body.data || {}).zestimate;
        if (!value) {
          console.log('Zillow shows no Zestimate for this home, skipping');
          continue;
        }
        zestimate = Math.round(value * 100);
      } else {
        zestimate = await getZestimate(URL);
      }
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
