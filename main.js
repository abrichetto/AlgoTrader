{
  "name": "algotrade",
  "version": "1.0.0",
  "description": "Algorithmic trading application for crypto futures",
  "main": "src/main.js",
  "scripts": {
    "start": "node src/main.js",
    "dev": "nodemon src/main.js",
    "server": "node server/app.js",
    "package": "pkg ."
  },
  "author": "Anthony Brichetto",
  "license": "MIT",
  "dependencies": {
    "robotjs": "^0.6.0",
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "tesseract.js": "^4.1.1",
    "jimp": "^0.22.10",
    "screenshot-desktop": "^1.15.0",
    "node-schedule": "^2.1.1",
    "winston": "^3.10.0",
    "config": "^3.3.9",
    "axios": "^1.5.0",
    "body-parser": "^1.20.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "tensorflow.js": "^4.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "pkg": "^5.8.1"
  },
  "bin": "src/main.js",
  "pkg": {
    "targets": [
      "node18-macos-arm64",
      "node18-win-x64"
    ],
    "outputPath": "dist"
  }
}
.gitignore

Copy
node_modules/
dist/
.env
.DS_Store
logs/
*.log
config/local.json
src/main.js
javascript
Copy
#!/usr/bin/env node

'use strict';

const robot = require('robotjs');
const { createWorker } = require('tesseract.js');
const screenshot = require('screenshot-desktop');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Jimp = require('jimp');

// Determine the correct paths based on your project structure
// Adjust these paths if needed
const srcPath = path.dirname(__dirname);
const serverPath = path.join(srcPath, 'server');

const logger = require(path.join(srcPath, 'utils/logger'));
const config = require(path.join(srcPath, 'utils/config'));
const { app } = require(path.join(serverPath, 'app'));

// Create necessary directories
const homeDir = path.join(os.homedir(), '.algotrade');
const templatesDir = path.join(__dirname, 'templates');
const signalsDir = path.join(homeDir, 'signals');
const tempDir = path.join(os.tmpdir(), 'algotrade');

[homeDir, templatesDir, signalsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.debug(`Created directory: ${dir}`);
  }
});

// Import enhanced modules
const enhancedOCR = require(path.join(srcPath, 'ocr/enhancedProcessor'));
const signalDetector = require(path.join(srcPath, 'ocr/signalDetector'));
const numericExtractor = require(path.join(srcPath, 'ocr/numericExtractor'));
const regionDetector = require(path.join(srcPath, 'automation/regionDetector'));
const regions = require(path.join(srcPath, 'ocr/regions'));

// Set RobotJS screen size
robot.setMouseDelay(2);
const screenSize = robot.getScreenSize();
logger.info(`Screen size detected: ${screenSize.width}x${screenSize.height}`);

// Initialize platform based on configuration
let platform;
const platformName = config.get('platform') || 'intentx';

try {
    if (platformName === 'intentx') {
        const { IntentXPlatform } = require(path.join(srcPath, 'platforms/intentx'));
        platform = new IntentXPlatform(config.get('platforms.intentx'));
    } else if (platformName === 'apollox') {
        const { ApolloXPlatform } = require(path.join(srcPath, 'platforms/apollox'));
        platform = new ApolloXPlatform(config.get('platforms.apollox'));
    } else {
        throw new Error(`Unsupported platform: ${platformName}`);
    }
} catch (error) {
    logger.error(`Failed to initialize platform ${platformName}:`, error);
    process.exit(1);
}

// Initialize enhanced strategy
const { EnhancedTradingViewStrategy } = require(path.join(srcPath, 'strategies/enhancedTradingView'));
const strategy = new EnhancedTradingViewStrategy(platform, config.get('strategies.tradingview'));

// Main application loop
async function start() {
  const PORT = config.get('server.port') || 3000;
  try {
    logger.info('AlgoTrade starting up...');
    
    if (!platform || typeof platform.setup !== 'function') {
      throw new Error('Trading platform not properly initialized');
    }
    
    // Start Express server
    app.server = app.listen(PORT, () => {
      logger.info(`Web interface running at http://localhost:${PORT}`);
    });
    
    await enhancedOCR.initialize();
    logger.info('OCR processor initialized');
    
    await regionDetector.calibrateRegions(platformName);
    logger.info('Screen regions calibrated');
    
    await platform.setup();
    await strategy.start();
    
    logger.info('AlgoTrade running. Use web interface to control.');
  } catch (error) {
    logger.error('Failed to start AlgoTrade:', error);
    throw error; // Propagate error to main startup function
  }
}

// Perform a test OCR to verify functionality
async function testOCR() {
    const TEST_TIMEOUT = 30000;
    let worker;
    
    try {
        const testPromise = new Promise(async (resolve, reject) => {
            logger.info('Performing OCR test...');
            const screenshotPath = await screenshot({ filename: path.join(tempDir, 'test_screenshot.png') });
            
            worker = await createWorker();
            await worker.load();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            
            const { data } = await worker.recognize(screenshotPath);
            
            if (data.confidence < 50) {
                reject(new Error(`Low OCR confidence: ${data.confidence}%`));
                return;
            }
            
            logger.info(`OCR test completed with confidence: ${data.confidence}%`);
            resolve(true);
        });
        
        return await Promise.race([
            testPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('OCR test timeout')), TEST_TIMEOUT)
            )
        ]);
    } catch (error) {
        logger.error('OCR test failed:', error);
        return false;
    } finally {
        if (worker) {
            await worker.terminate();
        }
    }
}

// Handle graceful shutdown with timeout
process.on('SIGINT', async () => {
  logger.info('Shutting down AlgoTrade...');
  
  const forceExitTimeout = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
  
  try {
    // Stop the strategy
    if (strategy) {
      await strategy.stop();
    }
    
    // Clean up OCR resources
    await enhancedOCR.cleanup();
    
    // Shutdown Express server properly
    if (app.server) {
      await new Promise((resolve) => {
        app.server.close(resolve);
      });
    }
    
    clearTimeout(forceExitTimeout);
    logger.info('Shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
});

// Start the app
(async () => {
  try {
    // Test OCR functionality first
    const ocrTestPassed = await testOCR();
    if (ocrTestPassed) {
      await start();
    } else {
      logger.error('OCR test failed. Please check your Tesseract installation.');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Fatal error during startup:', error);
    process.exit(1);
  }
})();

// Export key components for testing
module.exports = {
  enhancedOCR,
  signalDetector,
  numericExtractor,
  regionDetector,
  platform,
  strategy,
  regions
};
