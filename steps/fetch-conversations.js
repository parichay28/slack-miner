const fs = require('fs');
const path = require('path');
const { createClient } = require('../lib/slack');
const { RATE_LIMIT_MS, RETRY_MAX, REPLIES_PAGE_SIZE } = require('../lib/constants');
const { extractChannelId, extractThreadTs } = require('../lib/threads');

async function retryWithBackoff(fn) {
  for (let i = 0; i < RETRY_MAX; i++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error.data?.error === 'rate_limited';
      const isLastAttempt = i === RETRY_MAX - 1;
      if (!isRateLimit || isLastAttempt) throw error;
      const delay = Math.pow(2, i) * 1000;
      console.log(`    ⏳ Rate limited, retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function fetchThread(slack, threadLink) {
  const channelId = extractChannelId(threadLink);
  const threadTs = extractThreadTs(threadLink);

  if (!channelId || !threadTs) {
    throw new Error('Could not extract channel ID or thread_ts from link');
  }

  let allMessages = [];
  let cursor = undefined;

  do {
    const response = await retryWithBackoff(() =>
      slack.conversations.replies({ channel: channelId, ts: threadTs, limit: REPLIES_PAGE_SIZE, cursor })
    );
    allMessages = allMessages.concat(response.messages || []);
    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  const participants = [...new Set(allMessages.map(m => m.user).filter(Boolean))];
  return { thread_ts: threadTs, channel_id: channelId, message_count: allMessages.length, participants, messages: allMessages };
}

function loadAnomalies(anomalyFile) {
  if (fs.existsSync(anomalyFile)) {
    try {
      return JSON.parse(fs.readFileSync(anomalyFile, 'utf8'));
    } catch {
      return []; // Corrupted anomaly file — start fresh
    }
  }
  return [];
}

function saveAnomaly(anomalyFile, anomaly) {
  const anomalies = loadAnomalies(anomalyFile);
  anomalies.push(anomaly);
  fs.writeFileSync(anomalyFile, JSON.stringify(anomalies, null, 2));
}

async function fetchConversations({ inputFile, paths }) {
  const slack = createClient();
  const inputFileName = path.basename(inputFile, '_threads.json');
  const outputFile = path.join(paths.conversations, `${inputFileName}_conversations.json`);

  if (!fs.existsSync(paths.conversations)) {
    fs.mkdirSync(paths.conversations, { recursive: true });
  }

  console.log(`  Channel: ${inputFileName}`);
  console.log(`  Output:  ${outputFile}\n`);

  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  const inputThreads = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  if (!Array.isArray(inputThreads)) {
    throw new Error(`Input file must contain a JSON array of thread links`);
  }

  if (inputThreads.length === 0) {
    console.log('  ✅ No threads to fetch (empty input file)');
    return;
  }

  // Load existing conversations for resume
  let conversations = {};
  if (fs.existsSync(outputFile)) {
    try {
      conversations = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    } catch {
      console.log('  ⚠️  Existing conversations file is corrupted — starting fresh for this channel');
    }
    const alreadyCount = Object.keys(conversations).length;
    console.log(`  Threads: ${inputThreads.length} total, ${alreadyCount} already fetched`);
  } else {
    console.log(`  Threads: ${inputThreads.length} total`);
  }

  const alreadyFetched = new Set(Object.keys(conversations));
  const threadsToFetch = inputThreads.filter(link => !alreadyFetched.has(link));

  if (threadsToFetch.length === 0) {
    console.log('  ✅ All threads already fetched!');
    return;
  }

  console.log(`  To fetch: ${threadsToFetch.length}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < threadsToFetch.length; i++) {
    const threadLink = threadsToFetch[i];
    const progress = `  [${i + 1}/${threadsToFetch.length}]`;

    try {
      const conversation = await fetchThread(slack, threadLink);
      conversations[threadLink] = conversation;
      fs.writeFileSync(outputFile, JSON.stringify(conversations, null, 2));
      successCount++;
      console.log(`${progress} ✅  ${conversation.message_count} msg · ${conversation.participants.length} participants`);

      if (i < threadsToFetch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
      }
    } catch (error) {
      errorCount++;
      console.log(`${progress} ❌  ${error.message}`);
      saveAnomaly(paths.conversationAnomalies, {
        channel: inputFileName,
        threadLink,
        channelId: extractChannelId(threadLink),
        threadTs: extractThreadTs(threadLink),
        error: error.message,
        errorData: error.data || null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log(`\n  📊 Summary`);
  console.log(`     Fetched: ${successCount}  |  Errors: ${errorCount}  |  Total in file: ${Object.keys(conversations).length}`);

  if (errorCount > 0) {
    console.log(`\n  ⚠️  Errors logged to: ${paths.conversationAnomalies}`);
  }
}

module.exports = { fetchConversations };
