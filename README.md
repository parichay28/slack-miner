# Slack Message Extractor

Extract all your Slack messages, threads, and complete conversations with an interactive CLI.

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set environment variables**
   ```bash
   export SLACK_USER_TOKEN=xoxp-your-token-here
   export SLACK_USER_ID=UXXXXXXXXXX
   ```

3. **Run**
   ```bash
   node init.js
   # or
   npm start
   ```

That's it! The interactive wizard will guide you through the rest.

---

## How It Works

### Interactive Wizard

When you run `node init.js`, you'll be guided through:

1. **Select Fiscal Year** — FY24, FY25, or FY26
2. **Select Months** — multi-select with spacebar, `a` to select all
3. **Confirm** — review selections before starting

If output already exists for the chosen FY, you'll be asked:
- **Resume** — keep existing conversations, skip already-fetched threads in step 3
- **Fresh** — delete existing conversation output and re-fetch everything
- **Cancel**

### 3-Step Extraction

**Step 1 — Fetch Messages**
Searches Slack for your messages in each selected month and saves paginated results locally.

**Step 2 — Extract Thread Links**
Scans all saved message pages, deduplicates thread links per channel, and writes one file per channel.

**Step 3 — Fetch Conversations**
For each thread link from step 2, fetches the full conversation (all replies). Saves incrementally after each thread for crash safety.

### Output Structure

All output is scoped to the selected FY so runs for different years never overwrite each other:

```
output-fy25/
├── messages/                          # Raw search results (one folder per month)
│   ├── apr-2025/
│   │   ├── page1.json
│   │   └── page2.json
│   └── may-2025/
│       └── page1.json
│
├── threads/                           # Unique thread links per channel
│   ├── general_threads.json
│   └── team-updates_threads.json
│
├── conversations/                     # Complete conversation data
│   ├── general_conversations.json
│   └── team-updates_conversations.json
│
├── extract-threads-anomalies.json     # Step 2 errors (if any)
└── fetch-conversations-anomalies.json # Step 3 errors (if any)
```

---

## Getting Your Credentials

### 1. Slack User Token (`xoxp-...`)

1. Go to https://api.slack.com/apps
2. Create a new app or use an existing one
3. Go to **OAuth & Permissions**
4. Add **User Token Scopes**: `search:read`, `channels:history`, `channels:read`
5. Install app to workspace
6. Copy the **User OAuth Token** (starts with `xoxp-`)

### 2. Your Slack User ID

1. Click your profile in Slack
2. Click **More** → **Copy member ID**
3. Example format: `UXXXXXXXXXX`

---

## Features

- **FY-scoped output** — each fiscal year writes to its own `output-fy{N}/` folder
- **Rerun detection** — warns if output already exists, lets you resume or start fresh
- **Resume support** — step 3 skips already-fetched threads (safe to Ctrl+C and re-run)
- **Progress counters** — real-time `[1/N]` indicators at every step
- **Automatic pagination** — handles both search results and threads >1000 messages
- **Rate limit retry** — exponential backoff (1s → 2s → 4s)
- **Incremental saving** — writes after each thread so no work is lost on crash
- **Public channels only** — filters out DMs, group DMs, and private channels
- **Anomaly logging** — unprocessable messages logged with full context

---

## Resume Behaviour

It is safe to interrupt (`Ctrl+C`) at any time and re-run `node init.js`.

| Step | Re-run behaviour |
|------|-----------------|
| Step 1 — Fetch Messages | Always re-fetches and overwrites page files |
| Step 2 — Extract Threads | Always rebuilds thread files from local pages (no API calls) |
| Step 3 — Fetch Conversations | Skips threads already present in the conversations file |

If you want step 3 to re-fetch everything, choose **Fresh** at the rerun prompt.

---

## Troubleshooting

**`not_allowed_token_type`** — you're using a bot token (`xoxb-`). Use the user token (`xoxp-`) from OAuth & Permissions → User OAuth Token.

**`invalid_auth`** — token expired or revoked. Regenerate from Slack App settings.

**`missing_scope`** — add `search:read`, `channels:history`, `channels:read` scopes and reinstall the app to your workspace.

**Rate limited** — the script retries automatically with backoff. If errors persist, they are logged to the anomaly files in the output folder.

---

## Data Format

### Thread Links (`threads/*.json`)
```json
[
  "https://your-workspace.slack.com/archives/CXXXXXXXXXX/p1746020103958889",
  "https://your-workspace.enterprise.slack.com/archives/CYYYYYYYYYY/p1747829241543759"
]
```

### Conversations (`conversations/*.json`)
```json
{
  "https://your-workspace.slack.com/archives/CXXXXXXXXXX/p1746020103958889": {
    "thread_ts": "1746020103.958889",
    "channel_id": "CXXXXXXXXXX",
    "message_count": 15,
    "participants": ["UXXXXXXXXXX", "UYYYYYYYYYY"],
    "messages": [
      {
        "user": "UXXXXXXXXXX",
        "text": "Message content here",
        "ts": "1746020103.958889",
        "thread_ts": "1746020103.958889"
      }
    ]
  }
}
```

---

## License

MIT
