// core modules
const { createServer } = require('https');
const { readFileSync } = require('fs');
// modules installed from npm
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const _ = require('lodash');
// application modules
const logger = require('./logger');
const { makeOutboundCall, bridgeCall } = require('./voiceapi');

// Express app setup
const app = express();

let server;

// shutdown the node server forcefully
function shutdown() {
  server.close(() => {
    logger.info('Shutting down the server');
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(1);
  }, 10000);
}

// Set webhook event url
function onListening() {
  logger.info(`Listening on Port ${process.env.SERVICE_PORT}`);
}

// Handle error generated while creating / starting an http server
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  switch (error.code) {
    case 'EACCES':
      logger.error(`Port ${process.env.SERVICE_PORT} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`Port ${process.env.SERVICE_PORT} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

// create and start an HTTPS node app server
// An SSL Certificate (Self Signed or Registered) is required
function createAppServer(serverPort) {
  const options = {
    key: readFileSync(process.env.CERTIFICATE_SSL_KEY).toString(),
    cert: readFileSync(process.env.CERTIFICATE_SSL_CERT).toString(),
  };
  if (process.env.CERTIFICATE_SSL_CACERTS) {
    options.ca = [];
    options.ca.push(readFileSync(process.env.CERTIFICATE_SSL_CACERTS).toString());
  }

  // Create https express server
  server = createServer(options, app);
  app.set('port', serverPort);
  server.listen(serverPort);
  server.on('error', onError);
  server.on('listening', onListening);
}

/* Initializing WebServer */
const servicePort = process.env.SERVICE_PORT || 5000;
createAppServer(servicePort);

process.on('SIGINT', () => {
  logger.info('Caught interrupt signal');
  shutdown();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('client'));

// outbound voice call
// req contains fromNumber, toNumber
app.post('/outbound-call', (req, res) => {
  /* Initiating Outbound Call */
  makeOutboundCall(req.body, (response) => {
    const msg = JSON.parse(response);
    const callVoiceId = msg.voice_id;
    if (callVoiceId) {
      bridgeCall(callVoiceId, req.body.toNumber, (response) => {
        const msg = JSON.parse(response);
        res.send(msg);
        res.status(200);
      });
    } else {
      res.send(msg);
      res.status(200);
    }
  });
});
