const api = require('@actual-app/api');
require("dotenv").config();

module.exports = {
  openBudget: async function () {
    const url = process.env.ACTUAL_SERVER_URL || '';
    const password = process.env.ACTUAL_SERVER_PASSWORD || '';
    const file_password = process.env.ACTUAL_FILE_PASSWORD || '';
    const sync_id = process.env.ACTUAL_SYNC_ID || '';
    const cache = process.env.IMPORTER_CACHE_DIR || './cache';

    if (!url || !password || !sync_id) {
      console.error('Required settings for Actual not provided.');
      process.exit(1);
    }

    console.log("connect");
    await api.init({ serverURL: url, password: password, dataDir: cache });

    console.log("open file");
    if (file_password) {
      await api.downloadBudget(sync_id, { password: file_password, });
    } else {  
      await api.downloadBudget(sync_id);
    }
  },

  closeBudget: async function () {
    console.log("done");
    await api.shutdown();
  },

  getAccountBalance: async function (account, cutoffDate=new Date()) {
    const data = await api.runQuery(
      api.q('transactions')
      .filter({
        'account': account.id,
        'date': { $lt: cutoffDate },
      })
      .calculate({ $sum: '$amount' })
      .options({ splits: 'grouped' })
    );
    return data.data;
  },

  getLastTransactionDate: async function (account, cutoffDate=new Date()) {
    const data = await api.runQuery(
      api.q('transactions')
        .filter({
          'account': account.id,
          'date': { $lt: cutoffDate },
          'amount': { $gt: 0 },
        })
        .select('date')
        .orderBy({ 'date': 'desc' })
        .limit(1)
        .options({ splits: 'grouped' })
    );
    if (!data.data.length) {
      return undefined;
    }
    return data.data[0].date;
  },

  ensurePayee: async function (payeeName) {
    const payees = await api.getPayees();
    let payeeId = payees.find(p => p.name === payeeName)?.id;
    if (!payeeId) {
      payeeId = await api.createPayee({ name: payeeName });
    }
    if (!payeeId) {
      console.error('Failed to create payee:', payeeName);
      process.exit(1);
    }
  },

  ensureCategory: async function (categoryName) {
    const categories = await api.getCategories();
    let categoryId = categories.find(c => c.name === categoryName)?.id;
    if (!categoryId) {
      categoryId = await api.createCategory({ name: categoryName });
    }
    if (!categoryId) {
      console.error('Failed to create category:', categoryName);
      process.exit(1);
    }
  },

  getTagValue: function (note, tag, defaultValue=undefined) {
    tag += ':'
    const tagIndex = note.indexOf(tag);
    if (tagIndex === -1) {
      return defaultValue;
    }
    return note.split(tag)[1].split(/[\s]/)[0]
  },

  getNote: async function (id) {
    const notes = await api.runQuery(
      api.q('notes')
        .filter({ id })
        .select('*')
      );
    if (notes.data.length && notes.data[0].note) {
      return notes.data[0].note;
    }
    return undefined;
  },

  getAccountNote: async function (account) {
    const notes = await api.runQuery(
      api.q('notes')
        .filter({ id: `account-${account.id}` })
        .select('*')
      );
    if (notes.data.length && notes.data[0].note) {
      return notes.data[0].note;
    }
    return undefined;
  },

  sleep: function (ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },  
};
