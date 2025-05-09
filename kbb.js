const api = require('@actual-app/api');
const jsdom = require("jsdom");
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, getLastTransactionDate, getTagValue, openBudget, setAccountNote, sleep } = require('./utils');
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

  const advisor = dom.window.document.getElementById('PriceAdvisor');
  if (advisor) {
    const kbbText = advisor.getElementsByTagName('text')[3].textContent;
    return parseInt(kbbText.replace('$', '').replaceAll(',', '')) * 100;
  }

  const regex = /"value":\s*(\d+)/;
  const match = html.match(regex);
  return parseInt(match[1]) * 100;
}

(async function() {
  await openBudget();

  const payeeId = await ensurePayee(process.env.KBB_PAYEE_NAME || 'KBB');

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

        let mileage = parseInt(getTagValue(note, 'kbbMileage', 30000));
        if (mileage) URL += `&mileage=${mileage}`;

        const vehicleid = getTagValue(note, 'kbbVehicleid');
        if (vehicleid) URL += `&vehicleid=${vehicleid}`;

        const options = getTagValue(note, 'kbbOptions');
        if (options) URL += `&optionids=${options}`;

        const pricetype = getTagValue(note, 'kbbPriceType');
        if (pricetype) URL += `&pricetype=${pricetype}`;

        console.log('Fetching KBB for account:', account.name);

        const kbb = await getKBB(URL);
        const balance = await getAccountBalance(account);
        const diff = kbb - balance;

        console.log('KBB:', kbb);
        console.log('Balance:', balance);
        console.log('Difference:', diff);

        if (diff != 0) {
          const daily = parseInt(getTagValue(note, 'kbbDailyMileage'));
          if (mileage && daily) {
            let lastDate = await getLastTransactionDate(account, undefined, true);
            if (lastDate) {
              const parts = lastDate.split('-');
              lastDate = new Date(parts[0], parts[1] - 1, parts[2]);
              if (lastDate < new Date()) {
                let today = new Date();
                today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const days = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
                if (days > 0) {
                  mileage += days * daily;
  
                  const newNote = note.replace(/kbbMileage:\d+/, `kbbMileage:${mileage}`);
                  await setAccountNote(account, newNote);
  
                  console.log('daily mileage:', daily);
                  console.log('days since last update:', days);
                  console.log('Updated mileage to:', mileage);
                }
              }
            }
          }

          await api.importTransactions(account.id, [{
            date: new Date(),
            payee: payeeId,
            amount: diff,
            cleared: true,
            reconciled: true,
            notes: `Update KBB to ${kbb / 100} (${mileage} miles)`,
          }]);
        }

        await sleep(1324);
      }
    }
  }

  await closeBudget();
})();
