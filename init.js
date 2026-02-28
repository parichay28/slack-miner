const inquirer = require('inquirer');
const fs = require('fs');
const { FY_DEFINITIONS, MONTHS, getMonthName, getMonthDates, getMonthChoices } = require('./lib/dates');
const { getOutputPaths } = require('./lib/constants');
const { fetchMessages } = require('./steps/fetch-messages');
const { extractThreads } = require('./steps/extract-threads');
const { fetchConversations } = require('./steps/fetch-conversations');

function validateEnv() {
  if (!process.env.SLACK_USER_TOKEN) {
    console.error('❌ SLACK_USER_TOKEN is not set');
    console.error('   export SLACK_USER_TOKEN=xoxp-your-token');
    process.exit(1);
  }
  if (!process.env.SLACK_USER_ID) {
    console.error('❌ SLACK_USER_ID is not set');
    console.error('   export SLACK_USER_ID=UXXXXXXXXXX');
    process.exit(1);
  }
}

async function promptSelections() {
  let selectedFY = 'FY25';
  let selectedMonths = [];
  let step = 'fy'; // 'fy' | 'months' | 'confirm'

  while (true) {
    if (step === 'fy') {
      const { fy } = await inquirer.prompt([{
        type: 'list',
        name: 'fy',
        message: 'Select Fiscal Year:',
        choices: Object.entries(FY_DEFINITIONS).map(([key, def]) => ({ name: def.label, value: key })),
        default: selectedFY,
      }]);
      selectedFY = fy;
      selectedMonths = [];
      step = 'months';
    }

    if (step === 'months') {
      const monthChoices = getMonthChoices(selectedFY, selectedMonths);

      if (monthChoices.length === 0) {
        console.log('⚠️  No available months for this FY (all are in the future)\n');
        step = 'fy';
        continue;
      }

      const { months } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'months',
        message: `Select months (space to toggle, 'a' to select all):`,
        choices: monthChoices,
        validate: input => input.length > 0 || 'Please select at least one month',
      }]);
      selectedMonths = months;
      step = 'confirm';
    }

    if (step === 'confirm') {
      console.log('\n📋 Selection:');
      console.log(`   Fiscal Year: ${FY_DEFINITIONS[selectedFY].label}`);
      console.log(`   Output:      output-${selectedFY.toLowerCase()}/`);
      selectedMonths.forEach((month, i) => {
        const [year, monthNum] = month.split('-');
        const monthName = MONTHS.find(m => m.value === monthNum).name;
        console.log(`   ${i + 1}. ${monthName} ${year}`);
      });
      console.log('');

      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Proceed with extraction', value: 'proceed' },
          { name: '← Change months',        value: 'change_months' },
          { name: '← Change fiscal year',   value: 'change_fy' },
        ],
      }]);

      if (action === 'proceed') break;
      step = action === 'change_months' ? 'months' : 'fy';
    }
  }

  return { selectedFY, selectedMonths };
}

// Check for existing conversation output and warn the user.
// Returns 'resume' | 'fresh' | 'cancel'.
async function confirmRerun(paths) {
  if (!fs.existsSync(paths.conversations)) return 'resume';

  const convFiles = fs.readdirSync(paths.conversations)
    .filter(f => f.endsWith('_conversations.json'));

  if (convFiles.length === 0) return 'resume';

  // Count already-fetched threads across all channels
  let totalFetched = 0;
  convFiles.forEach(f => {
    try {
      const data = JSON.parse(fs.readFileSync(`${paths.conversations}/${f}`, 'utf8'));
      totalFetched += Object.keys(data).length;
    } catch {
      // Corrupted file — skip the count, step 3 will handle it
    }
  });

  console.log('⚠️  Existing conversation output found for this FY:');
  console.log(`   ${convFiles.length} channel file(s), ${totalFetched} threads already fetched`);
  console.log('');
  console.log('   Steps 1 & 2 always run fresh (messages and thread links are overwritten).');
  console.log('   Step 3 will SKIP any thread already present in a conversations file.');
  console.log('   To re-fetch conversations from scratch, choose "Fresh run" below.\n');

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'How would you like to proceed?',
    choices: [
      { name: 'Resume  — keep existing conversations, skip already-fetched threads', value: 'resume' },
      { name: 'Fresh   — delete existing conversations and re-fetch everything',      value: 'fresh' },
      { name: 'Cancel',                                                               value: 'cancel' },
    ],
  }]);

  return action;
}

async function main() {
  console.log('========================================');
  console.log('🚀 Slack Message Extractor');
  console.log('========================================\n');

  validateEnv();
  console.log('✅ Environment validated\n');

  const { selectedFY, selectedMonths } = await promptSelections();
  const paths = getOutputPaths(selectedFY);

  // ── Rerun check ─────────────────────────────────────────────
  const runMode = await confirmRerun(paths);
  if (runMode === 'cancel') {
    console.log('\nCancelled.');
    return;
  }
  if (runMode === 'fresh') {
    fs.rmSync(paths.conversations, { recursive: true, force: true });
    console.log(`\n🗑️  Cleared ${paths.conversations}/\n`);
  }

  // ── Step 1: Fetch Messages ──────────────────────────────────
  console.log('\n========================================');
  console.log('📥 Step 1/3: Fetching Slack Messages');
  console.log('========================================\n');

  for (const [index, month] of selectedMonths.entries()) {
    const [year, monthNum] = month.split('-');
    const monthName = MONTHS.find(m => m.value === monthNum).name;
    const monthFolder = `${getMonthName(monthNum)}-${year}`;
    const { fetchStart, monthEnd } = getMonthDates(year, monthNum);

    console.log(`[${index + 1}/${selectedMonths.length}] ${monthName} ${year}`);
    await fetchMessages({ start: fetchStart, end: monthEnd, monthFolder, paths });
    console.log('');
  }

  console.log('========================================');
  console.log(`✅ Step 1/3 complete — ${paths.messages}/`);
  console.log('========================================\n');

  // ── Step 2: Extract Thread Links ───────────────────────────
  console.log('========================================');
  console.log('🔗 Step 2/3: Extracting Thread Links');
  console.log('========================================\n');

  await extractThreads({ paths });

  console.log('\n========================================');
  console.log(`✅ Step 2/3 complete — ${paths.threads}/`);
  console.log('========================================\n');

  // ── Step 3: Fetch Conversations ────────────────────────────
  console.log('========================================');
  console.log('💬 Step 3/3: Fetching Conversations');
  console.log('========================================\n');

  if (!fs.existsSync(paths.threads)) {
    console.log('⚠️  No threads directory found. Skipping step 3.');
    return;
  }

  const threadFiles = fs.readdirSync(paths.threads)
    .filter(f => f.endsWith('_threads.json'))
    .map(f => `${paths.threads}/${f}`);

  if (threadFiles.length === 0) {
    console.log('⚠️  No thread files found. Skipping step 3.');
    return;
  }

  console.log(`Found ${threadFiles.length} channel(s) to process\n`);

  for (const [index, file] of threadFiles.entries()) {
    const channelName = file.split('/').pop().replace('_threads.json', '');
    console.log(`[${index + 1}/${threadFiles.length}] ${channelName}`);
    await fetchConversations({ inputFile: file, paths });
    console.log('');
  }

  console.log('========================================');
  console.log(`✅ Step 3/3 complete — ${paths.conversations}/`);
  console.log('========================================\n');

  // ── Final Summary ───────────────────────────────────────────
  console.log('========================================');
  console.log('🎉 All steps completed!');
  console.log('========================================\n');
  console.log(`📂 Output folder: ${paths.base}/`);
  console.log('  • messages/');
  console.log('  • threads/');
  console.log('  • conversations/\n');
  console.log('⚠️  Anomaly logs (if any):');
  console.log(`  • ${paths.threadAnomalies}`);
  console.log(`  • ${paths.conversationAnomalies}`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
