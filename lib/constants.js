// Returns all output paths scoped to a fiscal year key (e.g. 'FY25' → 'output-fy25/...').
// Anomaly files live inside the same output folder so each FY run is fully self-contained.
function getOutputPaths(fyKey) {
  const base = `output-${fyKey.toLowerCase()}`;
  return {
    base,
    messages:              `${base}/messages`,
    threads:               `${base}/threads`,
    conversations:         `${base}/conversations`,
    threadAnomalies:       `${base}/extract-threads-anomalies.json`,
    conversationAnomalies: `${base}/fetch-conversations-anomalies.json`,
  };
}

module.exports = {
  getOutputPaths,
  RATE_LIMIT_MS:    1000,
  RETRY_MAX:        3,
  SEARCH_PAGE_SIZE: 100,
  REPLIES_PAGE_SIZE: 1000,
};
