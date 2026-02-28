const fs = require('fs');
const path = require('path');
const { createClient } = require('../lib/slack');
const { RATE_LIMIT_MS, SEARCH_PAGE_SIZE } = require('../lib/constants');

async function fetchMessages({ start, end, monthFolder, paths }) {
  const slack = createClient();
  const outputDir = path.join(paths.messages, monthFolder);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const query = `from:<@${process.env.SLACK_USER_ID}> after:${start} before:${end}`;
  console.log(`  Query:  ${query}`);
  console.log(`  Output: ${outputDir}\n`);

  const firstResponse = await slack.search.messages({ query, count: SEARCH_PAGE_SIZE, page: 1 });
  const totalPages = firstResponse.messages.pagination.page_count;
  const totalMessages = firstResponse.messages.pagination.total_count;

  if (totalMessages === 0) {
    console.log(`  ✅ No messages found for this period`);
    return;
  }

  console.log(`  Found ${totalMessages} message(s) across ${totalPages} page(s)\n`);

  fs.writeFileSync(path.join(outputDir, 'page1.json'), JSON.stringify(firstResponse, null, 2));
  console.log(`  [1/${totalPages}] page1.json`);

  for (let page = 2; page <= totalPages; page++) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    const response = await slack.search.messages({ query, count: SEARCH_PAGE_SIZE, page });
    fs.writeFileSync(path.join(outputDir, `page${page}.json`), JSON.stringify(response, null, 2));
    console.log(`  [${page}/${totalPages}] page${page}.json`);
  }

  console.log(`\n  ✅ Saved ${totalPages} file(s) to ${outputDir}`);
}

module.exports = { fetchMessages };
