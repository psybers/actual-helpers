const api = require('@actual-app/api');
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getTagValue, openBudget, showPercent, sleep } = require('./utils');
require("dotenv").config();

const TERRASCOUTX_URL = 'https://api.terrascoutx.com/v1/suggest';

async function getTerraScoutX(address) {
  const URL = `${TERRASCOUTX_URL}?${new URLSearchParams({ q: address, limit: 1 })}`;
  console.log('TerraScoutX URL:', URL);
  const response = await fetch(URL, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Api-Key': process.env.TERRASCOUTX_API_KEY || '',
    }
  });

  let body = {};
  try {
    body = await response.json();
  } catch (e) {
    // not JSON, e.g. a proxy error page
  }
  return {
    status: response.status,
    body: body,
    retryAfter: parseInt(response.headers.get('retry-after')),
  };
}

(async function () {
  if (!process.env.TERRASCOUTX_API_KEY) {
    console.error('TERRASCOUTX_API_KEY is not set. Get a free key at https://terrascoutx.com/developers/');
    process.exit(1);
  }

  await openBudget();

  const payeeId = await ensurePayee(process.env.TERRASCOUTX_PAYEE_NAME || 'TerraScoutX');

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    if (account.closed) {
      continue;
    }

    const note = await getAccountNote(account);

    if (note && note.indexOf('terrascoutx:') > -1) {
      let address = getTagValue(note, 'terrascoutx') || '';
      try {
        address = decodeURIComponent(address.replace(/\+/g, ' ')).trim();
      } catch (e) {
        console.log('Could not URL decode the terrascoutx tag, using it as is');
      }
      if (address.length < 2 || address.length > 200) {
        console.log('The terrascoutx tag must hold an address of 2 to 200 characters, skipping', account.name);
        continue;
      }

      let ownership = 1;
      if (note.indexOf('ownership:') > -1) {
        ownership = parseFloat(getTagValue(note, 'ownership'));
      }

      console.log('Fetching TerraScoutX for account:', account.name);

      let tsx;
      try {
        tsx = await getTerraScoutX(address);
        // per-minute rate limit: wait as asked and retry once
        if (tsx.status === 429 && tsx.body.error !== 'monthly_request_limit_exceeded' && tsx.retryAfter > 0) {
          console.log(`Rate limited, retrying in ${tsx.retryAfter} seconds`);
          await sleep(Math.min(tsx.retryAfter, 60) * 1000);
          tsx = await getTerraScoutX(address);
        }
      } catch (error) {
        console.log('Error contacting TerraScoutX, skipping:', error.message);
        continue;
      }
      await sleep(600); // stay under the 120 requests per minute limit

      if (tsx.status === 401 || tsx.status === 402) {
        console.error(`TerraScoutX rejected the API key (${tsx.body.error || tsx.status}). Check TERRASCOUTX_API_KEY, or get a free key at https://terrascoutx.com/developers/`);
        process.exitCode = 1;
        break;
      }
      if (tsx.status === 429) {
        if (tsx.body.error === 'monthly_request_limit_exceeded') {
          console.error(`TerraScoutX monthly request limit reached (${tsx.body.used}/${tsx.body.limit}); it resets on the 1st of the month (UTC)`);
        } else {
          console.error('TerraScoutX rate limit reached, try again in a minute');
        }
        process.exitCode = 1;
        break;
      }
      if (tsx.status !== 200) {
        console.log(`TerraScoutX request failed (${tsx.body.error || tsx.status}), skipping`);
        continue;
      }

      const property = (tsx.body.results || [])[0];
      if (!property) {
        console.log('TerraScoutX found no property matching:', address);
        continue;
      }

      const matched = property.address || {};
      console.log('Matched:', property.id, [matched.street, matched.city, matched.state, matched.zip].filter(Boolean).join(', '));

      // the county's value for its latest tax roll, not a market estimate
      const price = property.marketValue ?? property.totalAppraised;
      if (!price) {
        console.log('The county does not publish a value for this property, skipping');
        continue;
      }

      const value = Math.round(price * 100); // Convert to cents
      // include transactions dated today, as sync-metals.js does
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + 1);
      const balance = await getAccountBalance(account, cutoffDate);
      const diff = Math.round(value * ownership) - balance;

      console.log('TerraScoutX Value:', value);
      console.log('Ownership:', value * ownership);
      console.log('Balance:', balance);
      console.log('Difference:', diff);

      if (diff != 0) {
        await api.importTransactions(account.id, [{
          date: new Date(),
          payee: payeeId,
          amount: diff,
          cleared: true,
          reconciled: true,
          notes: `Update Value to ${value * ownership / 100} (${value / 100}*${showPercent(ownership)}) ${property.id}`,
        }]);
      }
    }
  }

  await closeBudget();
})();
