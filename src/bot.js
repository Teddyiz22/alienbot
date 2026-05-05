const { getConfig, loadReplies } = require('./config');
const { buildKeyboard, getCommandReply, getAutoReply } = require('./default-replies');

const TELEGRAM_API = 'https://api.telegram.org';
const orderSessions = new Map();
const adminMessageMap = new Map();

const ORDER_STEPS = {
  WAITING_PRICE: 'waiting_price',
  NAME: 'name',
  PHONE: 'phone',
  ADDRESS: 'address',
  PAYMENT_SCREENSHOT: 'payment_screenshot'
};

async function telegramRequest(token, method, body) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram API request failed for ${method}`);
  }

  return payload.result;
}

async function setCommands(token) {
  const commands = [
    { command: 'start', description: 'Welcome message' },
    { command: 'help', description: 'See available bot help' },
    { command: 'order', description: 'Start order process' },
    { command: 'cancel', description: 'Cancel current order flow' }
  ];

  await telegramRequest(token, 'setMyCommands', { commands });
}

async function sendMessage(token, chatId, text) {
  return telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: buildKeyboard()
  });
}

async function sendAdminMessage(token, config, text) {
  if (!config.adminChatId) {
    return null;
  }

  return telegramRequest(token, 'sendMessage', {
    chat_id: config.adminChatId,
    text
  });
}

async function sendAdminPhoto(token, config, photo, caption) {
  if (!config.adminChatId || !photo) {
    return null;
  }

  return telegramRequest(token, 'sendPhoto', {
    chat_id: config.adminChatId,
    photo,
    caption
  });
}

async function sendAdminDocument(token, config, document, caption) {
  if (!config.adminChatId || !document) {
    return null;
  }

  return telegramRequest(token, 'sendDocument', {
    chat_id: config.adminChatId,
    document,
    caption
  });
}

async function sendAdminImage(token, config, image, caption) {
  if (!image || !image.fileId) {
    return null;
  }

  if (image.type === 'document') {
    return sendAdminDocument(token, config, image.fileId, caption);
  }

  return sendAdminPhoto(token, config, image.fileId, caption);
}

function getLargestPhotoFileId(message) {
  if (!Array.isArray(message.photo) || !message.photo.length) {
    return '';
  }

  return message.photo[message.photo.length - 1].file_id;
}

function isImageDocument(document) {
  if (!document) {
    return false;
  }

  const mimeType = String(document.mime_type || '').toLowerCase();
  if (mimeType.startsWith('image/')) {
    return true;
  }

  const fileName = String(document.file_name || '').toLowerCase();
  return /\.(avif|bmp|gif|heic|heif|jfif|jpe|jpeg|jpg|png|svg|tif|tiff|webp)$/.test(fileName);
}

function getImageAttachment(message) {
  const photoFileId = getLargestPhotoFileId(message);
  if (photoFileId) {
    return {
      type: 'photo',
      fileId: photoFileId,
      fileName: '',
      mimeType: ''
    };
  }

  if (isImageDocument(message.document)) {
    return {
      type: 'document',
      fileId: message.document.file_id,
      fileName: message.document.file_name || '',
      mimeType: message.document.mime_type || ''
    };
  }

  return null;
}

function startOrderSession(chatId, source, details = {}) {
  orderSessions.set(chatId, {
    step: source === 'photo' ? ORDER_STEPS.WAITING_PRICE : ORDER_STEPS.NAME,
    source,
    orderImage: details.orderImage || null,
    orderCaption: details.orderCaption || '',
    paymentScreenshot: null,
    priceText: '',
    customerName: '',
    phone: '',
    address: ''
  });
}

function clearOrderSession(chatId) {
  orderSessions.delete(chatId);
}

function formatTemplate(template, value) {
  return String(template).replace('%s', value);
}

function formatBuyerName(user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return fullName || '-';
}

function formatAdminOrderSummary(message, session, replies) {
  const username = message.from && message.from.username ? `@${message.from.username}` : '-';
  const orderCaption = session.orderCaption || '-';

  return [
    replies.adminOrderComplete || '📦 Order completed',
    '━━━━━━━━━━━━━━━━',
    '',
    '👤 CUSTOMER',
    `Name: ${session.customerName}`,
    `Phone: ${session.phone}`,
    `Address: ${session.address}`,
    '',
    '💬 TELEGRAM',
    `Name: ${formatBuyerName(message.from || {})}`,
    `Username: ${username}`,
    `Chat ID: ${message.chat.id}`,
    '',
    '🧾 ORDER',
    `Price: ${session.priceText || '-'}`,
    `Photo caption: ${orderCaption}`,
    '',
    '📎 ATTACHMENTS',
    `Order image: ${session.orderImage ? 'sent below' : 'missing'}`,
    `Payment screenshot: ${session.paymentScreenshot ? 'sent below' : 'missing'}`
  ].join('\n');
}

async function sendCompletedOrderToAdmin(token, config, message, session, replies) {
  const adminSummary = formatAdminOrderSummary(message, session, replies);
  await sendAdminMessage(token, config, adminSummary);
  await sendAdminImage(token, config, session.orderImage, replies.adminOrderPhotoCaption || 'Customer order photo');
  await sendAdminImage(token, config, session.paymentScreenshot, replies.adminPaymentScreenshotCaption || 'Payment screenshot');
}

async function sendPhotoToAdmin(token, config, message, replies) {
  if (!config.adminChatId) {
    return;
  }

  const captionParts = [
    formatTemplate(replies.adminNewPhoto, String(message.chat.id)),
    replies.adminReplyHelp
  ];

  if (message.caption) {
    captionParts.push(`Buyer caption: ${message.caption}`);
  }

  const sentMessage = await sendAdminImage(
    token,
    config,
    getImageAttachment(message),
    captionParts.join('\n\n')
  );

  adminMessageMap.set(sentMessage.message_id, message.chat.id);
}

async function handleAdminPriceReply(token, config, message, replies) {
  if (!config.adminChatId || message.chat.id !== config.adminChatId) {
    return false;
  }

  const text = (message.text || '').trim();
  if (!text) {
    return false;
  }

  const repliedMessageId = message.reply_to_message && message.reply_to_message.message_id;
  if (!repliedMessageId || !adminMessageMap.has(repliedMessageId)) {
    await sendMessage(token, message.chat.id, replies.adminReplyMissing);
    return true;
  }

  const buyerChatId = Number(adminMessageMap.get(repliedMessageId));
  const priceText = text;
  const session = orderSessions.get(buyerChatId);

  if (!session) {
    await sendMessage(token, message.chat.id, 'ဒီ customer အတွက် active order session မတွေ့ပါ။');
    return true;
  }

  session.priceText = priceText;
  session.step = ORDER_STEPS.NAME;

  await sendMessage(
    token,
    buyerChatId,
    formatTemplate(replies.priceConfirmed, priceText)
  );
  await sendMessage(token, message.chat.id, replies.adminReplySuccess);
  return true;
}

async function handleOrderStep(token, config, message, session, replies) {
  const chatId = message.chat.id;
  const userText = (message.text || '').trim();

  if (session.step === ORDER_STEPS.WAITING_PRICE) {
    await sendMessage(token, chatId, replies.waitingForPrice);
    return;
  }

  if (session.step === ORDER_STEPS.NAME) {
    session.customerName = userText;
    session.step = ORDER_STEPS.PHONE;
    await sendMessage(token, chatId, replies.askPhone);
    return;
  }

  if (session.step === ORDER_STEPS.PHONE) {
    session.phone = userText;
    session.step = ORDER_STEPS.ADDRESS;
    await sendMessage(token, chatId, replies.askAddress);
    return;
  }

  if (session.step === ORDER_STEPS.ADDRESS) {
    session.address = userText;

    const summary = [
      replies.orderSummaryPrefix,
      `Price: ${session.priceText || '-'}`,
      `Name: ${session.customerName}`,
      `Phone: ${session.phone}`,
      `Address: ${session.address}`,
      replies.paymentInstructions,
      replies.askPaymentScreenshot || 'Please send your payment screenshot.'
    ].join('\n\n');

    session.step = ORDER_STEPS.PAYMENT_SCREENSHOT;
    await sendMessage(token, chatId, summary);
  }
}

async function handlePaymentScreenshot(token, config, message, session, replies) {
  const chatId = message.chat.id;

  if (session.step !== ORDER_STEPS.PAYMENT_SCREENSHOT) {
    return false;
  }

  const paymentScreenshot = getImageAttachment(message);
  if (!paymentScreenshot) {
    await sendMessage(token, chatId, replies.askPaymentScreenshot || 'Please send your payment screenshot.');
    return true;
  }

  session.paymentScreenshot = paymentScreenshot;
  await sendCompletedOrderToAdmin(token, config, message, session, replies);
  clearOrderSession(chatId);

  await sendMessage(
    token,
    chatId,
    [replies.orderCompleteSuccess, replies.deliveryEstimate, replies.thankYouOrder].filter(Boolean).join('\n\n')
  );
  return true;
}

async function processUpdate(config, update) {
  const message = update.message;
  if (!message || !message.chat) {
    return;
  }

  const replies = loadReplies();
  const chatId = message.chat.id;
  const session = orderSessions.get(chatId);
  const text = (message.text || '').trim();
  const imageAttachment = getImageAttachment(message);

  if (text && await handleAdminPriceReply(config.botToken, config, message, replies)) {
    return;
  }

  if (text === '/cancel') {
    clearOrderSession(chatId);
    await sendMessage(config.botToken, chatId, replies.cancelOrder);
    return;
  }

  if (text === '/order') {
    startOrderSession(chatId, 'manual');
    await sendMessage(config.botToken, chatId, replies.orderStart);
    return;
  }

  if (session && await handlePaymentScreenshot(config.botToken, config, message, session, replies)) {
    return;
  }

  if (imageAttachment) {
    startOrderSession(chatId, 'photo', {
      orderImage: imageAttachment,
      orderCaption: message.caption || ''
    });
    await sendMessage(config.botToken, chatId, replies.photoReply);
    await sendPhotoToAdmin(config.botToken, config, message, replies);
    return;
  }

  if (session && text) {
    await handleOrderStep(config.botToken, config, message, session, replies);
    return;
  }

  if (!text) {
    return;
  }

  const replyText = text.startsWith('/')
    ? getCommandReply(text.split(/\s+/)[0], replies) || replies.fallback
    : getAutoReply(text, replies);

  await sendMessage(config.botToken, chatId, replyText);
}

async function pollLoop(config) {
  let offset = 0;
  console.log(`Bot "${config.botName}" is running in polling mode.`);

  while (true) {
    try {
      const updates = await telegramRequest(config.botToken, 'getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message']
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        await processUpdate(config, update);
      }
    } catch (error) {
      console.error(`[bot-error] ${error.message}`);
      await wait(config.pollIntervalMs);
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = getConfig();
  await setCommands(config.botToken);
  await pollLoop(config);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
