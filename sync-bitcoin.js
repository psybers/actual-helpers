const { closeBudget, openBudget, getTransactions, getAccountNote, getAccountBalance, ensurePayee } = require('./utils');
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

async function getBitcoinPrice() {
  const url = process.env.BITCOIN_PRICE_URL || "https://api.kraken.com/0/public/Ticker?pair=xbtusd"
  const path = process.env.BITCOIN_PRICE_JSON_PATH || "result.XXBTZUSD.c[0]"
  try {
    response = await fetch(url);
    const json = await response.json();
    return getValueAtPath(json, path);
  } catch (error) {
    return undefined;
  }
}

(async () => {
  const bitcoinPrice = await getBitcoinPrice();
  if (!bitcoinPrice) {
    throw new Error("Unable to retrieve Bitcoin price. Check your BITCOIN_PRICE_URL and BITCOIN_PRICE_JSON_PATH environment variables");
  }
  await openBudget();
  const payeeId = await ensurePayee(process.env.BITCOIN_PAYEE_NAME || 'Bitcoin Price Change');
  const accounts = await api.getAccounts();
  for (const account of accounts) {
    if (account.closed) {
      continue;
    }
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + 1);
    const note = await getAccountNote(account, cutoffDate);
    if (!note || note.indexOf("BTC:") === -1) {
      continue;
    }
    const btc_amount = note.split('BTC:')[1].split(' ')[0];
    const currentBalance = await getAccountBalance(account);
    const targetBalance = Math.round(bitcoinPrice * btc_amount * 100);
    const diff = targetBalance - currentBalance;
    if (diff != 0) {
      await api.importTransactions(account.id, [{
        date: new Date(),
        payee: payeeId,
        amount: diff,
        cleared: true,
        reconciled: true,
        notes: "Updated Bitcoin Price",
      }])
    }
  }
  await closeBudget();
})();
