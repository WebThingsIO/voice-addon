'use strict';

const Ds = require('deepspeech');
const express = require('express');
const expressWs = require('express-ws');
const fs = require('fs');
const path = require('path');

const DEBUG = true;

class DeepSpeechWorker {
  constructor() {
    this._assetsDir = path.join(__dirname, '..', 'assets');
    this._modelsDir = process.argv[process.argv.length - 2];
    this._serverPort = process.argv[process.argv.length - 1];
    this._model = null;

    if (DEBUG) {
      console.debug(
        'Running DeepSpeechWorker as PID',
        process.pid,
        'on models:',
        this._modelsDir
      );
    }

    this.loadModel();
    this.startServer();
  }

  loadModel() {
    if (DEBUG) {
      console.debug(`Loading model from ${this._modelsDir}`);
    }

    this._modelJson =
      JSON.parse(fs.readFileSync(path.join(this._assetsDir, 'info.json')));

    const extension = process.arch === 'x64' ? 'pbmm' : 'tflite';
    this._model = new Ds.Model(
      path.join(this._assetsDir, `output_graph.${extension}`),
      500
    );

    if (DEBUG) {
      console.debug(`Enabling decoder on model ${this._modelsDir}`);
    }

    this._model.enableDecoderWithLM(
      path.join(this._modelsDir, 'local_lm.binary'),
      path.join(this._modelsDir, 'local_lm.trie'),
      this._modelJson.parameters.lmAlpha,
      this._modelJson.parameters.lmBeta
    );

    if (DEBUG) {
      console.debug('Decoder enabled successfully.');
    }
  }

  startServer() {
    const app = express();
    expressWs(app);

    app.get('/sample-rate', (req, res) => {
      const sampleRate = this._model.sampleRate();

      if (DEBUG) {
        console.debug('GET /sample-rate:', {sampleRate});
      }

      res.json({sampleRate});
    });

    app.ws('/stream', this.handleStream.bind(this));

    app.listen(this._serverPort);
  }

  handleStream(ws) {
    if (DEBUG) {
      console.debug('WS /stream');
    }

    const dsStream = this._model.createStream();
    let streamFinished = false;
    let interimTimer = null;

    if (DEBUG) {
      console.debug('Setup intermediate decoding');
      interimTimer = setInterval(() => {
        const transcript = this._model.intermediateDecode(dsStream);
        console.debug('interim:', transcript);
      }, 3 * 1000);
    }

    ws.on('message', (message) => {
      if (typeof message === 'string' && message === 'stream-end') {
        streamFinished = true;

        if (interimTimer) {
          clearInterval(interimTimer);
          interimTimer = null;
        }

        const transcript = this._model.finishStream(dsStream);

        if (DEBUG) {
          console.debug('stream-end:', transcript);
        }

        ws.send(JSON.stringify({transcript}));
      } else if (typeof message !== 'string' && !streamFinished) {
        this._model.feedAudioContent(
          dsStream,
          message.slice(0, message.length / 2)
        );
      } else {
        console.error('audio received after stream ended');
      }
    });
  }
}

new DeepSpeechWorker();
