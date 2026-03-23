// Script to run all bank syncs
// Useful for running bank syncs on a daily/weekly schedule
const { closeBudget, openBudget } = require('./utils');
const api = require('@actual-app/api');

(async () => {
  await openBudget();

  console.log("syncing banks...");
  const accounts = await api.getAccounts();
  const errors = [];

  for (const account of accounts) {
    try {
      console.log(`syncing account: ${account.name}...`);
      await api.runBankSync({ accountId: account.id });
      console.log(`  ✓ ${account.name} synced successfully`);
    } catch (err) {
      console.error(`  ✗ ${account.name} failed: ${err.message}`);
      errors.push({ account: account.name, error: err.message });
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} account(s) failed to sync:`);
    errors.forEach(e => console.error(`  - ${e.account}: ${e.error}`));
  } else {
    console.log("\nall accounts synced successfully!");
  }

  await closeBudget();
})();
