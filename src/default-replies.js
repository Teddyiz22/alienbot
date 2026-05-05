function buildKeyboard() {
  return {
    keyboard: [
      [{ text: '/start' }, { text: '/order' }],
      [{ text: '/help' }, { text: '/cancel' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getCommandReply(command, replies) {
  const normalized = command.toLowerCase();

  switch (normalized) {
    case '/start':
      return replies.welcome;
    case '/help':
      return replies.help;
    case '/order':
      return replies.orderStart;
    case '/cancel':
      return replies.cancelOrder;
    default:
      return null;
  }
}

const keywordRules = [
  { keywords: ['hello', 'hi', 'hey', 'mingalar'], replyKey: 'welcome' }
];

function getAutoReply(text, replies) {
  const normalized = String(text || '').toLowerCase();

  for (const rule of keywordRules) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return replies[rule.replyKey] || replies.fallback;
    }
  }

  return replies.fallback;
}

module.exports = {
  buildKeyboard,
  getCommandReply,
  getAutoReply
};
