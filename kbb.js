const api = require('@actual-app/api');
const jsdom = require("jsdom");
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getTagValue, openBudget, sleep } = require('./utils');
require("dotenv").config();

async function getKBB(URL) {
  URL = URL + '&format=html&requesteddataversiondate=' + new Date().toLocaleDateString();
  console.log('KBB URL:', URL);
  const response = await fetch(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.6',
      'Referer': 'https://www.google.com/',
    }
  });

  const html = await response.text();
  const dom = new jsdom.JSDOM(html);

  const kbbText = dom.window.document.getElementById('PriceAdvisor').getElementsByTagName('text')[3].textContent;
  return parseInt(kbbText.replace('$', '').replace(',', '')) * 100;
}

(async function() {
  await openBudget();

  const payeeId = await ensurePayee(process.env.IMPORTER_KBB_PAYEE_NAME || 'KBB');

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    const note = await getAccountNote(account);

    if (note) {
      let URL = getTagValue(note, 'kbbURL');
      if (URL) {
        const zip = getTagValue(note, 'kbbZipcode', '46237');
        if (zip) URL += `&zipcode=${zip}`;

        const condition = getTagValue(note, 'kbbCondition', 'good');
        if (condition) URL += `&condition=${condition}`;

        const mileage = getTagValue(note, 'kbbMileage', 30000);
        if (mileage) URL += `&mileage=${mileage}`;

        const vehicleid = getTagValue(note, 'kbbVehicleid');
        if (vehicleid) URL += `&vehicleid=${vehicleid}`;

        const options = getTagValue(note, 'kbbOptions');
        if (options) URL += `&optionids=${options}`;

        console.log('Fetching KBB for account:', account.name);

        const kbb = await getKBB(URL);
        const balance = await getAccountBalance(account);
        const diff = kbb - balance;

        console.log('KBB:', kbb);
        console.log('Balance:', balance);
        console.log('Difference:', diff);

        if (diff != 0) {
          await api.importTransactions(account.id, [{
            date: new Date(),
            payee: payeeId,
            amount: diff,
            notes: `Update KBB to ${kbb / 100}`,
          }]);
        }

        await sleep(1324);
      }
    }
  }

  await closeBudget();
})();
