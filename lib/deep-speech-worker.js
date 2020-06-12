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
    this._wsPort = process.argv[process.argv.length - 1];
    this._model = null;

    if (DEBUG) {
      console.debug(
        'Running DeepSpeechWorker as PID',
        process.pid,
        'on models:',
        this._modelsDir
      );
    }

    this.startWebSocket();
    this.loadModel();
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

  startWebSocket() {
    const app = express();
    expressWs(app);
    app.ws('/stream', this.handleStream.bind(this));
    app.listen(this._wsPort);
  }

  handleStream(ws) {
    const dsStream = this._model.createStream();
    const sampleRate = this._model.sampleRate();

    if (DEBUG) {
      console.debug(`Expected model sample rate: ${sampleRate}`);
    }

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
      if (typeof message === 'string') {
        switch (message) {
          case 'get-sample-rate': {
            if (DEBUG) {
              console.debug('get-sample-rate:', sampleRate);
            }
            ws.send(JSON.stringify({sampleRate}));
            break;
          }
          case 'start-stream': {
            break;
          }
          case 'end-stream': {
            streamFinished = true;

            if (interimTimer) {
              clearInterval(interimTimer);
            }

            const transcript = this._model.finishStream(dsStream);

            if (DEBUG) {
              console.debug('end-stream:', transcript);
            }

            ws.send(JSON.stringify({transcript}));
            break;
          }
        }
      } else if (!streamFinished) {
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
