const fs = require('fs');
const path = require('path');
const { MONTH_ORDER } = require('../lib/dates');
const { sanitizeChannelName, getParentThreadLink, getThreadIdentifier } = require('../lib/threads');

async function extractThreads({ paths }) {
  const threadsPerChannel = {};
  const anomalies = [];

  // Discover all month folders, sorted chronologically
  if (!fs.existsSync(paths.messages)) {
    throw new Error(`Messages directory not found: ${paths.messages}/\nRun Step 1 first.`);
  }

  const months = fs.readdirSync(paths.messages)
    .filter(item => fs.statSync(path.join(paths.messages, item)).isDirectory())
    .sort((a, b) => {
      const [aMonth, aYear] = a.split('-');
      const [bMonth, bYear] = b.split('-');
      if (aYear !== bYear) return parseInt(aYear) - parseInt(bYear);
      return (MONTH_ORDER[aMonth] || 0) - (MONTH_ORDER[bMonth] || 0);
    });

  if (months.length === 0) {
    throw new Error(`No month folders found in ${paths.messages}/\nRun Step 1 first.`);
  }

  console.log(`Found ${months.length} month folder(s): ${months.join(', ')}\n`);

  // Process each month folder
  months.forEach((month, monthIndex) => {
    const monthDir = path.join(paths.messages, month);
    const monthProgress = `[${monthIndex + 1}/${months.length}]`;

    if (!fs.existsSync(monthDir)) {
      console.log(`${monthProgress} ⚠️  Skipping ${month} (folder not found)`);
      return;
    }

    const files = fs.readdirSync(monthDir).filter(f => f.endsWith('.json')).sort();
    let monthThreadCount = 0;

    files.forEach(file => {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(monthDir, file), 'utf8'));
      } catch {
        console.log(`  ⚠️  Skipping corrupted file: ${path.join(monthDir, file)}`);
        return;
      }
      const matches = data.messages?.matches || [];

      matches.forEach((msg, msgIndex) => {
        const ch = msg.channel;

        // Only public channels
        if (!ch || ch.is_im || ch.is_mpim || ch.is_private) return;

        const context = { month, file, messageIndex: msgIndex };

        if (!ch.name) {
          anomalies.push({
            ...context,
            reason: 'Public channel message missing channel name',
            messageTs: msg.ts || 'unknown',
            channelId: ch.id || 'unknown',
          });
          return;
        }

        const channelName = sanitizeChannelName(ch.name);
        const threadId = getThreadIdentifier(msg, context, anomalies);
        const parentLink = getParentThreadLink(msg, context, anomalies);

        if (!threadId || !parentLink) return;

        if (!threadsPerChannel[channelName]) {
          threadsPerChannel[channelName] = new Map();
        }

        if (!threadsPerChannel[channelName].has(threadId)) {
          threadsPerChannel[channelName].set(threadId, parentLink);
          monthThreadCount++;
        }
      });
    });

    console.log(`${monthProgress} ${month.padEnd(12)}  →  ${monthThreadCount} new threads`);
  });

  // Write one file per channel
  if (!fs.existsSync(paths.threads)) {
    fs.mkdirSync(paths.threads, { recursive: true });
  }

  const channelEntries = Object.entries(threadsPerChannel);
  console.log(`\nWriting ${channelEntries.length} channel file(s)...`);

  let totalThreads = 0;

  channelEntries.forEach(([channelName, threadsMap]) => {
    const threads = Array.from(threadsMap.values()).sort();
    const filename = `${channelName}_threads.json`;
    fs.writeFileSync(path.join(paths.threads, filename), JSON.stringify(threads, null, 2));
    console.log(`  ✅ ${filename}  (${threads.length} threads)`);
    totalThreads += threads.length;
  });

  console.log(`\n📊 Summary`);
  console.log(`   Channels:  ${channelEntries.length}`);
  console.log(`   Threads:   ${totalThreads}`);
  console.log(`   Output:    ${paths.threads}/`);

  if (anomalies.length > 0) {
    fs.writeFileSync(paths.threadAnomalies, JSON.stringify(anomalies, null, 2));
    console.log(`\n⚠️  ${anomalies.length} anomalies logged to: ${paths.threadAnomalies}`);
  } else {
    console.log(`\n✅ No anomalies found`);
  }
}

module.exports = { extractThreads };
