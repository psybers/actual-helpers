const { closeBudget, openBudget, getAccountNote, getAccountBalance, getTagValue, ensurePayee } = require('./utils');
const api = require('@actual-app/api');

function getValueAtPath(obj, path) {
    const keys = path.split('.').filter(Boolean);

    return keys.reduce((acc, key) => {
        const match = key.match(/^([^\[\]]+)(\[(\d+)\])?$/);

        if (match) {
            const property = match[1];
            const index = match[3];

            acc = acc[property];

            if (index !== undefined) {
                acc = acc[parseInt(index, 10)];
            }
        } else {
            acc = acc[key];
        }

        return acc;
    }, obj);
}

async function getMetalPrice(metal) {
    const defaultUrl = metal === 'GOLD'
        ? 'https://api.gold-api.com/price/XAU'
        : 'https://api.gold-api.com/price/XAG';
    const url = (process.env[`${metal}_PRICE_URL`] || defaultUrl).replace(/^["']|["']$/g, '');
    const path = (process.env[`${metal}_PRICE_JSON_PATH`] || 'price').replace(/^["']|["']$/g, '');
    try {
        const response = await fetch(url);
        const json = await response.json();
        return getValueAtPath(json, path);
    } catch (error) {
        console.error(`Error fetching ${metal} price:`, error);
        return undefined;
    }
}

(async () => {
  const goldPrice = await getMetalPrice('GOLD');
  const silverPrice = await getMetalPrice('SILVER');
  if (!goldPrice && !silverPrice) {
    throw new Error("Unable to retrieve gold or silver price. Check your GOLD_PRICE_URL / GOLD_PRICE_JSON_PATH / SILVER_PRICE_URL / SILVER_PRICE_JSON_PATH environment variables");
  }

  await openBudget();
  const payeeId = await ensurePayee(process.env.METALS_PAYEE_NAME || 'Metals Price Change');
  const accounts = await api.getAccounts();
  for (const account of accounts) {
    if (account.closed) {
      continue;
    }
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + 1);
    const note = await getAccountNote(account, cutoffDate);

    const goldOz = parseFloat(getTagValue(note, 'GOLD', 0.0)) || 0;
    const silverOz = parseFloat(getTagValue(note, 'SILVER', 0.0)) || 0;
    if (!goldOz && !silverOz) {
      continue;
    }

    if ((goldOz && !goldPrice) || (silverOz && !silverPrice)) {
      console.error(`Skipping ${account.name}: missing required spot price`);
      continue;
    }

    const targetBalance = Math.round((goldOz * (goldPrice || 0) + silverOz * (silverPrice || 0)) * 100);
    const currentBalance = await getAccountBalance(account, cutoffDate);
    const diff = targetBalance - currentBalance;
    if (diff != 0) {
      await api.importTransactions(account.id, [{
        date: new Date(),
        payee: payeeId,
        amount: diff,
        cleared: true,
        reconciled: true,
        notes: "Updated Metals Price",
      }])
    }
  }
  await closeBudget();
})();
