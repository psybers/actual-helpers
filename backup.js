// Script to run all bank syncs
// Useful for running bank syncs on a daily/weekly schedule
const { closeBudget, openBudget, exportBudget } = require('./utils');
const api = require('@actual-app/api');
const fs = require('fs');
const archiver = require('archiver');
const path = require("node:path");

(async () => {
  const cache = process.env.ACTUAL_CACHE_DIR || './cache';
  const backup = process.env.ACTUAL_BACKUP_DIR || './backup';
  
  await openBudget();
  await closeBudget();
  console.log("backing up...");
  try{
    const directory = await fs.readdirSync(cache);

    let sourceFolder = "";
    let sourceBudgetName = "";
    for( const folder of directory){
      const metadataPath = path.join(cache, folder, "metadata.json");
      if(fs.existsSync(metadataPath)) {
        const file = fs.readFileSync(metadataPath, 'utf8');
        const jsonObj = JSON.parse(file);
        if (jsonObj["groupId"] === process.env.ACTUAL_SYNC_ID) {
          sourceFolder = path.join(cache, folder);
          sourceBudgetName = jsonObj["budgetName"];
          break;
        }
      }
    }
    const formatter = Intl.DateTimeFormat("it-IT", {
      year: "numeric",
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const now = new Date();
    const dateString = now.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll("/","-");
    const timeString = now.toLocaleTimeString("it-IT").replaceAll(":","");
    const zipFileName = dateString + "_[" + timeString  + "]_" + sourceBudgetName + ".zip";
    const outPath = path.join(backup, zipFileName);

    console.log("📦 Zipping Budget '" + sourceBudgetName + "' in [" + sourceFolder + "] to [" + outPath + "]" );

    const stream = fs.createWriteStream(outPath)
    const archive = archiver('zip', { zlib: {level:9}});
    archive.on('error', function(err){
      throw err;
    });
    await archive.pipe(stream);
    await archive.directory(sourceFolder, false);
    await archive.finalize();

  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

