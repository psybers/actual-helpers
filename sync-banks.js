// Script to run all bank syncs
// Useful for running bank syncs on a daily/weekly schedule
const { forEachBudget } = require('./utils');
const api = require('@actual-app/api');

(async () => {
  await forEachBudget(async () => {
    console.log("syncing banks...");
    await api.runBankSync();
  });
})();
