# Telegram Clothing Bot

A simple Telegram order bot for a clothing shop. It uses long polling and guides buyers through a short order process.

## Features

- Starts automatically when a buyer sends a product photo
- Collects name, phone number, address, and payment method
- Sends payment details, delivery estimate, and thank-you message
- Editable replies in a JSON file
- No external npm dependencies

## Setup

1. Create your bot with `@BotFather` on Telegram.
2. Copy `.env.example` to `.env`.
3. Add your real bot token inside `.env`.
4. Start the bot:

```bash
npm start
```

## Files

- `src/bot.js`: main bot runtime
- `src/config.js`: loads environment variables and bot settings
- `src/default-replies.js`: simple command text and fallback routing
- `data/replies.json`: editable messages for your shop

## Customize Your Shop

Edit `data/replies.json` to update:

- Shop welcome message
- Payment number
- Account name
- Delivery time
- Thank-you message

## Commands

- `/start`
- `/help`
- `/order`
- `/cancel`

## How It Works

1. Buyer sends a product photo.
2. Bot asks for full name.
3. Bot asks for phone number.
4. Bot asks for address.
5. Bot asks for payment method.
6. Bot sends payment details.
7. Bot tells delivery time.
8. Bot sends thank-you message.

## Notes

- This project uses long polling, so you can run it on your laptop or server.
- The order flow starts from a photo or `/order`.
- You can expand it later with real pricing or admin notifications.
