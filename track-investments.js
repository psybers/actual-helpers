const api = require('@actual-app/api');
const fs = require('fs');
const readline = require('readline-sync');
const { closeBudget, ensureCategory, ensureCategoryGroup, ensurePayee, getAccountBalance, getAccountNote, getSimpleFinID, getTransactions, openBudget } = require('./utils');
require("dotenv").config();


const getCredentials = async () => {
  if (process.env.SIMPLEFIN_CREDENTIALS) {
    return process.env.SIMPLEFIN_CREDENTIALS;
  }

  const token = readline.question('Enter your SimpleFIN setup token: ');
  const url = atob(token.trim());

  const response = await fetch(url, { method: 'post' });
  const api_url = await response.text();

  const rest = api_url.split('//', 2)[1];
  const auth = rest.split('@', 1)[0];
  const username = auth.split(':')[0];
  const pw = auth.split(':')[1];

  const data = `${username}:${pw}`;
  const cache = process.env.ACTUAL_CACHE_DIR || './cache';
  fs.writeFileSync(cache + '/simplefin.credentials', data);
  console.log('SimpleFIN credentials:', data);
  return data;
};

const loadCredentials = () => {
  try {
    const cache = process.env.ACTUAL_CACHE_DIR || './cache';
    return fs.readFileSync(cache + '/simplefin.credentials', 'utf8');
  } catch (err) {
    return undefined;
  }
};

const getSimplefinBalances = async () => {
  let credentials = loadCredentials();
  if (!credentials) {
    credentials = await getCredentials();
  }
  const username = credentials.split(':')[0];
  const pw = credentials.split(':')[1];

  try {
    const url = `https://beta-bridge.simplefin.org/simplefin/accounts?start-date=${new Date().getTime()}&end-date=${new Date().getTime()}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${btoa(`${username}:${pw}`)}`
      }
    });
    const data = await response.json();
    const accounts = data.accounts;
    const balances = {};
    accounts.forEach(a => balances[a.id] = parseFloat(a.balance));
    return balances;
  } catch (e) {
    return undefined;
  }
};

const shouldDrop = (payment) => {
  const note = payment.notes;
  return note && (note.indexOf('YOU BOUGHT ') > -1 || note == 'Buy Other' || note == 'Sell Other');
};

const zeroTransaction = async (payment) => {
  await api.updateTransaction(
    payment.id,
    { 'amount': 0 }
  );
}

(async () => {
  await openBudget();

  const payeeId = await ensurePayee(process.env.INVESTMENT_PAYEE_NAME || 'Investment');
  const categoryGroupId = await ensureCategoryGroup(process.env.INVESTMENT_CATEGORY_GROUP_NAME || 'Income');
  const categoryId = await ensureCategory(process.env.INVESTMENT_CATEGORY_NAME || 'Investment', categoryGroupId, true);

  const simplefinBalances = await getSimplefinBalances();
  if (simplefinBalances) {
    const accounts = await api.getAccounts();
    for (const account of accounts) {
      if (account.closed) {
        continue;
      }

      const note = await getAccountNote(account);

      if (note) {
        const data = await getTransactions(account);

        if (note.indexOf('zeroSmall') > -1) {
          const payments = data.filter(payment => payment.amount > -10000 && payment.amount < 10000 && payment.amount != 0 && payment.category == categoryId)
          for (const payment of payments) {
            if (shouldDrop(payment)) {
              await zeroTransaction(payment);
            }
          }
        }

        if (note.indexOf('dropPayments') > -1) {
          const payments = data.filter(payment => payment.amount < 0)
          for (const payment of payments) {
            if (shouldDrop(payment)) {
              await zeroTransaction(payment);
            }
          }
        }

        if (note.indexOf('calcInvestment') > -1) {
          const currentBalance = await getAccountBalance(account);
          const simpleFinID = await getSimpleFinID(account);
          const simplefinBalance = parseInt(simplefinBalances[simpleFinID] * 100);
          const diff = simplefinBalance - currentBalance;

          console.log('Account:', account.name);
          console.log('Simplefin Balance:', simplefinBalance);
          console.log('Current Balance:', currentBalance);
          console.log('Difference:', diff);

          if (diff) {
            await api.importTransactions(account.id, [{
              date: new Date(),
              payee: payeeId,
              amount: diff,
              cleared: true,
              reconciled: true,
              category: categoryId,
              notes: `Update investment balance to ${simplefinBalance / 100}`,
            }]);
          }
        }
      }
    }
  }

  await closeBudget();
})();
