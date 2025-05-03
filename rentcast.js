const api = require('@actual-app/api');
const jsdom = require("jsdom");
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getTagValue, openBudget, showPercent, sleep } = require('./utils');
require("dotenv").config();

async function getRentCast(URL) {
    console.log('RentCast URL:', URL);
    const response = await fetch(URL, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'X-Api-Key': process.env.RENTCAST_API_KEY || '',
        }
    });

    return await response.json();
}

(async function () {
    await openBudget();

    const payeeId = await ensurePayee(process.env.RENTCAST_PAYEE_NAME || 'RentCast');

    const accounts = await api.getAccounts();
    for (const account of accounts) {
        const note = await getAccountNote(account);

        if (note) {
            let address = getTagValue(note, 'address');
            if (address) {
                let URL = "https://api.rentcast.io/v1/avm/value?";
                URL += `address=${address}`;

                let propertyType = getTagValue(note, 'propertyType', 'Single%20Family');
                if (propertyType) URL += `&propertyType=${propertyType}`;
                let bedrooms = parseInt(getTagValue(note, 'bedrooms'));
                if (bedrooms) URL += `&bedrooms=${bedrooms}`;
                let bathrooms = parseFloat(getTagValue(note, 'bathrooms'));
                if (bathrooms) URL += `&bathrooms=${bathrooms}`;
                let squareFootage = parseInt(getTagValue(note, 'squareFootage'));
                if (squareFootage) URL += `&squareFootage=${squareFootage}`;
                let compCount = parseInt(getTagValue(note, 'compCount', 25));
                if (compCount) URL += `&compCount=${compCount}`;

                let ownership = 1;
                if (note.indexOf('ownership:') > -1) {
                  ownership = parseFloat(note.split('ownership:')[1].split(' ')[0]);
                }
          
                console.log('Fetching RentCast for account:', account.name);

                const rc = await getRentCast(URL);
                const value = rc.price * 100; // Convert to cents
                const balance = await getAccountBalance(account);
                const diff = (value * ownership) - balance;
    
                console.log('RentCast Value:', value);
                console.log('Ownership:', value * ownership);
                console.log('Balance:', balance);
                console.log('Difference:', diff);
    
                if (diff != 0) {
                    await api.importTransactions(account.id, [{
                        date: new Date(),
                        payee: payeeId,
                        amount: diff,
                        cleared: true,
                        reconciled: true,
                        notes: `Update Value to ${value * ownership / 100} (${value / 100}*${showPercent(ownership)})`,
                    }]);
                }
    
                await sleep(200); // 1/4 the "20 per second" rate limit, just to be safe
            }
        }
    }

  await closeBudget();
}) ();
