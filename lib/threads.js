// Shared thread URL parsing helpers used by both extract-threads and fetch-conversations steps.

// Sanitize a channel name so it's safe to use as a filename.
function sanitizeChannelName(name) {
  return name.replace(/[\/\\:*?"<>|]/g, '_');
}

// Extract channel ID from a Slack permalink.
// e.g. https://foo.slack.com/archives/CXXXXXXXXXX/p17... → CXXXXXXXXXX
function extractChannelId(link) {
  const match = link.match(/\/archives\/([^\/]+)/);
  return match ? match[1] : null;
}

// Extract thread_ts from a Slack permalink's /p<digits> segment.
// e.g. /p1746020103958889 → 1746020103.958889
function extractThreadTs(link) {
  const match = link.match(/\/p(\d+)/);
  if (!match) return null;
  const ts = match[1];
  return ts.slice(0, -6) + '.' + ts.slice(-6);
}

// Derive the canonical parent-thread URL for a message.
// Replies have ?thread_ts= in their permalink; parent messages don't.
// Pushes an anomaly entry and returns null if required fields are missing.
function getParentThreadLink(msg, context, anomalies) {
  if (!msg || !msg.channel || !msg.channel.id || !msg.permalink) {
    const missingFields = [];
    if (!msg) missingFields.push('entire message object');
    else {
      if (!msg.channel) missingFields.push('channel');
      else if (!msg.channel.id) missingFields.push('channel.id');
      if (!msg.permalink) missingFields.push('permalink');
    }
    anomalies.push({
      ...context,
      reason: 'Missing required fields for parent link extraction',
      missingFields,
      messageTs: msg?.ts || 'unknown',
      channelName: msg?.channel?.name || 'unknown',
    });
    return null;
  }

  const { permalink } = msg;
  const threadTsMatch = permalink.match(/thread_ts=([\d.]+)/);

  if (threadTsMatch) {
    // Reply → reconstruct the parent message URL.
    // Domain is extracted from the permalink itself; SLACK_WORKSPACE_URL is only
    // used if extraction fails (should not happen in practice).
    const domainMatch = permalink.match(/(https:\/\/[^\/]+)/);
    const domain = domainMatch ? domainMatch[1] : process.env.SLACK_WORKSPACE_URL;

    if (!domain) {
      anomalies.push({
        ...context,
        reason: 'Could not extract workspace domain from permalink and SLACK_WORKSPACE_URL is not set',
        permalink,
        messageTs: msg?.ts || 'unknown',
        channelName: msg?.channel?.name || 'unknown',
      });
      return null;
    }

    const parentTs = threadTsMatch[1].replace(/\./g, '');
    return `${domain}/archives/${msg.channel.id}/p${parentTs}`;
  }

  // Parent or standalone message → strip query params to normalise
  return permalink.split('?')[0];
}

// Return the thread identifier used for deduplication.
// For replies this is the parent thread_ts; for parent messages it's the message's own ts.
// Pushes an anomaly entry and returns null if required fields are missing.
function getThreadIdentifier(msg, context, anomalies) {
  if (!msg || !msg.permalink || !msg.ts) {
    const missingFields = [];
    if (!msg) missingFields.push('entire message object');
    else {
      if (!msg.permalink) missingFields.push('permalink');
      if (!msg.ts) missingFields.push('ts');
    }
    anomalies.push({
      ...context,
      reason: 'Missing required fields for thread ID extraction',
      missingFields,
      messageTs: msg?.ts || 'unknown',
      channelName: msg?.channel?.name || 'unknown',
    });
    return null;
  }

  const threadTsMatch = msg.permalink.match(/thread_ts=([\d.]+)/);
  return threadTsMatch ? threadTsMatch[1] : msg.ts;
}

module.exports = {
  sanitizeChannelName,
  extractChannelId,
  extractThreadTs,
  getParentThreadLink,
  getThreadIdentifier,
};
