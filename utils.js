const api = require('@actual-app/api');
require("dotenv").config();

const Utils = {
  openBudget: async function () {
    process.on('unhandledRejection', (reason, p) => {
      console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
      console.error(reason.stack);
      process.exit(1);
    });

    const url = process.env.ACTUAL_SERVER_URL || '';
    const password = process.env.ACTUAL_SERVER_PASSWORD || '';
    const file_password = process.env.ACTUAL_FILE_PASSWORD || '';
    const sync_id = process.env.ACTUAL_SYNC_ID || '';
    const cache = process.env.ACTUAL_CACHE_DIR || './cache';

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
    try {
      await api.shutdown();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
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

  getTransactions: async function (account) {
    const data = await api.runQuery(
      api.q('transactions')
        .select('*')
        .filter({
          'account': account.id,
        })
    );
    return data.data;
  },

  getLastTransactionDate: async function (account, cutoffDate=undefined, inbound=false) {
    if (cutoffDate === undefined || cutoffDate === null) {
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() + 1);
    }
    const filters = {
      'account': account.id,
      'date': { $lt: cutoffDate },
    };
    if (!inbound) {
      filters['amount'] = { $gt: 0 };
    }
    const data = await api.runQuery(
      api.q('transactions')
        .filter(filters)
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
    try {
      const payees = await api.getPayees();
      let payeeId = payees.find(p => p.name === payeeName)?.id;
      if (!payeeId) {
        payeeId = await api.createPayee({ name: payeeName });
      }
      if (payeeId) {
        return payeeId;
      }
    } catch (e) {
      console.error(e);
    }
    console.error('Failed to create payee:', payeeName);
    process.exit(1);
  },

  ensureCategoryGroup: async function (categoryGroupName) {
    try {
      const groups = await api.getCategoryGroups();
      let groupId = groups.find(g => g.name === categoryGroupName)?.id;
      if (!groupId) {
        groupId = await api.createCategoryGroup({ name: categoryGroupName });
      }
      if (groupId) {
        return groupId;
      }
    } catch (e) {
      console.error(e);
    }
    console.error('Failed to create category group:', categoryGroupName);
    process.exit(1);
  },

  ensureCategory: async function (categoryName, groupId, is_income=false) {
    try {
      const categories = await api.getCategories();
      let categoryId = categories.find(c => c.name === categoryName)?.id;
      if (!categoryId) {
        categoryId = await api.createCategory({
          name: categoryName,
          group_id: groupId,
          is_income: is_income,
          hidden: false,
        });
      }
      if (categoryId) {
        return categoryId;
      }
    } catch (e) {
      console.error(e);
    }
    console.error('Failed to create category:', categoryName);
    process.exit(1);
  },

  getTagValue: function (note, tag, defaultValue=undefined) {
    if (!note) {
      return undefined;
    }
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
    return Utils.getNote(`account-${account.id}`);
  },

  setAccountNote: async function (account, note) {
    api.internal.send('notes-save', {
        id: `account-${account.id}`,
        note: note,
    });
  },

  getSimpleFinID: async function (account) {
    const data = await api.runQuery(
      api.q('accounts')
        .filter({ id: account.id })
        .filter({ account_sync_source: 'simpleFin' })
        .select('account_id')
      );
    if (data.data.length && data.data[0].account_id) {
      return data.data[0].account_id;
    }
    return undefined;
  },

  sleep: function (ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },  

  showPercent: function (pct) {
    return Number(pct).toLocaleString(undefined,
        { style: 'percent', maximumFractionDigits: 4 })
  },
};

module.exports = Utils;
