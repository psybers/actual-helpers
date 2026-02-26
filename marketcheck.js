const api = require('@actual-app/api');
const jsdom = require("jsdom");
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getTagValue, openBudget, showPercent, sleep } = require('./utils');
require('dotenv').config();

const marketcheckBaseUrl = 'https://api.marketcheck.com/';
const marketCheckPriceApiRoute = '/v2/predict/car/us/marketcheck_price';
const requiredQueryParams = ['miles', 'zip']

async function getMarketCheckPrice(URL) {
    console.log('MarketCheck URL:', URL);
    const response = await fetch(URL, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        }
    });

    return await response.json();
}

(async function () {
    await openBudget();

    const payeeId = await ensurePayee(process.env.MARKETCHECK_PAYEE_NAME || 'MarketCheck');

    const accounts = await api.getAccounts();
    for (const account of accounts) {
        const note = await getAccountNote(account);

        if (note) {
            const apiKey = process.env.MARKETCHECK_API_KEY;
            const vin = getTagValue(note,'marketcheckvin')
            if (vin) {
                const targetUrl = new URL(marketCheckPriceApiRoute, marketcheckBaseUrl);
                targetUrl.searchParams.set('api_key', apiKey);
                targetUrl.searchParams.set('vin', vin);
                targetUrl.searchParams.set('zip', getTagValue(note, 'marketcheckzip'));
                targetUrl.searchParams.set('miles', getTagValue(note, 'marketcheckmiles'));
                targetUrl.searchParams.set('dealer_type', getTagValue(note, 'marketcheckdealertype') ?? 'franchise');
                if(requiredQueryParams.filter(key => {
                    if(targetUrl.searchParams.get(key) === 'undefined'){
                        console.error(`Missing required value marketcheck${key}`);
                        return true;
                    }
                    return false;
                }).length > 0){
                    break;
                }

                const marginTag = getTagValue(note, 'marketcheckmargin');
                const margin = marginTag ? parseFloat(marginTag) : 0.85;
          
                console.log('Fetching MarketCheck price for account:', account.name);

                const rc = await getMarketCheckPrice(targetUrl.toString());
                if(rc.code === 400){
                    console.error(rc.message.detail);
                    break;
                }
                const value = rc.marketcheck_price * 100; // Convert to cents
                if(isNaN(value)){
                    console.error("Failure getting the marketCheck value, verify your note is correct");
                    break;
                }
                const likelySalePrice = value * margin
                const balance = await getAccountBalance(account);
                const diff = likelySalePrice - balance;
    
                console.log('MarketCheck Value:', value);
                console.log('Adjustment for profit margin:', value * margin);
                console.log('Balance:', balance);
                console.log('Difference:', diff);
                
                if (diff != 0) {
                    await api.importTransactions(account.id, [{
                        date: new Date(),
                        payee: payeeId,
                        amount: diff,
                        cleared: true,
                        reconciled: true,
                        notes: `Update Value to ${likelySalePrice / 100} (${value / 100}*${showPercent(margin)})`,
                    }]);
                }
                
                await sleep(200); // 1/4 the "20 per second" rate limit, just to be safe
            }
        }
    }

  await closeBudget();
}) ();