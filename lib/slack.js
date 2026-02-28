const { WebClient } = require('@slack/web-api');

function createClient() {
  return new WebClient(process.env.SLACK_USER_TOKEN);
}

module.exports = { createClient };
