const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const repliesPath = path.join(projectRoot, 'data', 'replies.json');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalNumberEnv(name) {
  const value = process.env[name];
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function loadReplies() {
  const raw = fs.readFileSync(repliesPath, 'utf8');
  return JSON.parse(raw);
}

loadEnvFile(envPath);

function getConfig() {
  return {
    botToken: getRequiredEnv('BOT_TOKEN'),
    botName: process.env.BOT_NAME || 'UrbanThread',
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 1500),
    adminChatId: getOptionalNumberEnv('ADMIN_CHAT_ID'),
    repliesPath,
    replies: loadReplies()
  };
}

module.exports = {
  getConfig,
  loadReplies,
  repliesPath
};
