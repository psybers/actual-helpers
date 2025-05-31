const { closeBudget, openBudget, getTransactions, getAccountNote, getAccountBalance, getTagValue, ensurePayee } = require('./utils');
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

async function getCryptoPrice(crypto, krakenPath) {
    const url = process.env[`CRYPTO_PRICE_URL_${crypto.toUpperCase()}`] || `https://api.kraken.com/0/public/Ticker?pair=${crypto}usd`;
    if (!krakenPath && !process.env[`CRYPTO_PRICE_JSON_PATH_${crypto.toUpperCase()}`]) {
        console.error(`No Kraken path provided for ${crypto}. Please set CRYPTO_PRICE_JSON_PATH_${crypto.toUpperCase()} environment variable or provide krakenPath argument.`);
        return undefined;
    }
    const path = process.env[`CRYPTO_PRICE_JSON_PATH_${crypto.toUpperCase()}`] || `result.${krakenPath}.c[0]`;
    try {
        const response = await fetch(url);
        const json = await response.json();
        return getValueAtPath(json, path);
    } catch (error) {
        console.error(`Error fetching price for ${crypto}:`, error);
        return undefined;
    }
}

(async () => {
    await openBudget();
    const payeeId = await ensurePayee(process.env.CRYPTO_PAYEE_NAME || 'Crypto Price Change');
    const accounts = await api.getAccounts();
    for (const account of accounts) {
        if (account.closed) {
            continue;
        }

        // Need to set cutoff date to tomorrow to ensure we get the latest transactions
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() + 1);

        const note = await getAccountNote(account, cutoffDate);

        // Get cryptos list from the note
        let cryptos = getTagValue(note, 'CRYPTO', null);
        if (!cryptos) continue;
        cryptos = cryptos.split(',').map(c => c.trim()).filter(c => c.length > 0);
        if (cryptos.length === 0) continue;

        console.log(`Processing account: ${account.name}, Cryptos: ${cryptos.join(', ')}`);

        let totalTargetBalance = 0;
        for (const crypto of cryptos) {
            const cryptoTag = getTagValue(note, crypto, 0.0);
            if (!cryptoTag) continue;
            cryptoTagSplit = cryptoTag.split(',');

            // Get the amount from the first part of the tag
            amount = parseFloat(cryptoTagSplit[0]);
            if (isNaN(amount) || amount <= 0) continue;
            console.log(`Crypto: ${crypto}, Amount: ${amount}`);

            // Get Kraken path from the second part of the tag, if it exists
            let krakenPath = cryptoTagSplit[1]
            console.log(`Kraken Path: ${krakenPath}`);

            // Get the crypto price
            const cryptoPrice = await getCryptoPrice(crypto, krakenPath);
            if (!cryptoPrice) {
                console.error(`Unable to retrieve price for ${crypto}. Check your CRYPTO_PRICE_URL_${crypto.toUpperCase()} and CRYPTO_PRICE_JSON_PATH_${crypto.toUpperCase()} environment variables`);
                continue;
            }

            console.log(`Crypto: ${crypto}, Price: ${cryptoPrice}`);

            const targetBalance = Math.round(cryptoPrice * amount * 100);
            totalTargetBalance += targetBalance;
        }

        // Now we need to check if the total target balance is different from the current balance and update it
        const currentBalance = await getAccountBalance(account, cutoffDate);
        const diff = totalTargetBalance - currentBalance;
        console.log(`Account: ${account.name}, Total Target Balance: ${totalTargetBalance}, Current Balance: ${currentBalance}, Diff: ${diff}`);
        if (diff != 0) {
            await api.importTransactions(account.id, [{
                date: new Date(),
                payee: payeeId,
                amount: diff,
                cleared: true,
                reconciled: true,
                notes: `Updated Crypto Price on ${new Date().toLocaleString()} (${cryptos.join(', ')})`,
            }])
        }
    }
    await closeBudget();
})();