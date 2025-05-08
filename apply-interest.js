const api = require('@actual-app/api');
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getLastTransactionDate, getTagValue, openBudget, showPercent } = require('./utils');
require("dotenv").config();

function daysInYear(year) {
  // Check if the year is a leap year
  return ((year % 4 === 0 && year % 100 > 0) || year %400 == 0) ? 366 : 365;
}

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
      let interestRate = parseFloat(getTagValue(note, 'interestRate', 0.0));
      const interestDay = parseInt(getTagValue(note, 'interestDay', 0));

      if (interestRate && interestDay) {
        const kind = getTagValue(note, 'interest', 'monthly');
        const isDaily = kind == 'daily';

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

        let period = 12;
        let numPeriods = 1
        switch (kind) {
          case 'daily':
            period = daysInYear(interestTransactionDate.getFullYear());
            numPeriods = daysPassed;
            break;
          case 'actual':
            period = daysInYear(interestTransactionDate.getFullYear()) / daysPassed;
            break;
          default:
            break;
        }

        const balance = await getAccountBalance(account, interestTransactionDate);
        const compoundedInterest = Math.round(balance * (Math.pow(1 + interestRate / period, numPeriods) - 1));

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
            notes: `Interest for ${daysPassed} days, ${balance / 100.0} at ${interestRate} (${isDaily ? "daily" : "monthly"})`,
          }]);
        }
      }
    }
  }

  await closeBudget();
})();
