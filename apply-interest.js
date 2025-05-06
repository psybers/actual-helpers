const api = require('@actual-app/api');
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getLastTransactionDate, getTagValue, openBudget, showPercent } = require('./utils');
require("dotenv").config();

(async () => {
  await openBudget();

  const payeeId = await ensurePayee(process.env.INTEREST_PAYEE_NAME || 'Loan Interest');

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    if (account.closed) {
      continue;
    }

    const note = await getAccountNote(account);

    if (note) {
      if (note.indexOf('interestRate:') > -1 && note.indexOf('interestDay:') > -1) {
        let interestRate = parseFloat(getTagValue(note, 'interestRate'));
        const interestDay = parseInt(getTagValue(note, 'interestDay'));

        const interestTransactionDate = new Date();
        if (interestTransactionDate.getDate() < interestDay) {
          interestTransactionDate.setMonth(interestTransactionDate.getMonth() - 1);
        }
        interestTransactionDate.setDate(interestDay);
        interestTransactionDate.setHours(5, 0, 0, 0);

        const cutoff = new Date(interestTransactionDate);
        cutoff.setMonth(cutoff.getMonth() - 1);
        cutoff.setDate(cutoff.getDate() + 1);

        const lastDate = await getLastTransactionDate(account, cutoff);
        if (!lastDate) continue;
        const daysPassed = Math.floor((interestTransactionDate - new Date(lastDate)) / 86400000);

        const balance = await getAccountBalance(account, interestTransactionDate);
        const compoundedInterest = Math.round(balance * (Math.pow(1 + interestRate / 12, 1) - 1));

        interestRate = showPercent(interestRate);

        console.log(`== ${account.name} ==`);
        console.log(` -> Balance:  ${balance}`);
        console.log(`      as of ${lastDate}`);
        console.log(` -> # days:   ${daysPassed}`);
        console.log(` -> Interest: ${compoundedInterest} (${interestRate})`)

        if (compoundedInterest) {
          await api.importTransactions(account.id, [{
            date: interestTransactionDate,
            payee: payeeId,
            amount: compoundedInterest,
            cleared: true,
            notes: `Interest for 1 month at ${interestRate}`,
          }]);
        }
      }
    }
  }

  await closeBudget();
})();
