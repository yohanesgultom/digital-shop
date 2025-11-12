# Digital Photo Shop

Simple SPA digital Photo shop

## Features

- Browse preview photos loaded from Google Drive folder
- Store orders in Google Sheet 
- When order status updated to `PAID`, send original photos from Google Drive through email

## Limitations

- Only support selling photos
- Can only sell 1 qty per photo
- Tightly coupled with Google Sheet and Drive as backend
- Only support service-account.json as authentication method

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open http://localhost:3000 in your browser

## Development

For development with auto-reload:
```bash
npm run dev
```

