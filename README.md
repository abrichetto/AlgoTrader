# AlgoTrader

Algorithmic trading application for cryptocurrency futures markets.

## Features

- Automated trading using OCR-based signal detection
- Support for multiple trading platforms (IntentX, ApolloX)
- Web interface for monitoring and control
- Enhanced TradingView strategy integration
- Automated region detection and calibration
- Robust error handling and graceful shutdown

## Requirements

- Node.js 18 or higher
- Tesseract OCR
- Platform-specific dependencies (see Installation)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure your environment:
```bash
cp .env.example .env
```

3. Update configuration in `config/default.json`

## Usage

Start the application:
```bash
npm start
```

Development mode:
```bash
npm run dev
```

## License

MIT License - See LICENSE file for details
