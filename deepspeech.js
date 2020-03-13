'use strict';

const path = require('path');
const fs = require('fs');
const Ds = require('deepspeech');

class DeepSpeechWorker {
  constructor() {
    console.log('Running DeepSpeechWorker as PID ' + process.pid);
    this._modelsDir = process.argv[process.argv.length - 2];
    this._wsPort = process.argv[process.argv.length - 1];
    this._model = null;
    console.log('Running DeepSpeechWorker on models: ' + this._modelsDir);
    this.startWebSocket();
    this.loadModel();
  }

  loadModel() {
    this._modelRoot = path.join(this._modelsDir, 'en-us');
    console.log(`Loading model from ${this._modelRoot}`);
    this._modelJson = JSON.parse(fs.readFileSync(path.join(this._modelRoot, 'info.json')));
    this._model = new Ds.Model(path.join(this._modelRoot, 'output_graph.tflite'), 500);
    console.log(`Enabling decoder on model ${this._modelRoot}`);
    this._model.enableDecoderWithLM(path.join(this._modelRoot, 'local_lm.binary'),
                                    path.join(this._modelRoot, 'local_lm.trie'),
                                    this._modelJson['parameters']['lmAlpha'],
                                    this._modelJson['parameters']['lmBeta']);
    console.log('Decoder enabled successfully.');
  }

  startWebSocket() {
    const express = require('express');
    const app = express();
    const ws = require('express-ws')(app);
    app.ws('/stream', this.handleStream.bind(this));
    app.listen(this._wsPort);
  }

  handleStream(ws, req) {
    console.log('handle stream');
    const dsStream = this._model.createStream();
    const sampleRate = this._model.sampleRate();
    console.log('model sample rate: ' + sampleRate);

    let streamFinished = false;

    console.log('setup intermediate decoding');
    const interimTimer = setInterval(() => {
      let transcript = this._model.intermediateDecode(dsStream);
      console.debug('interim: transcript', transcript);
    }, 3*1000);

    console.log('setup websocket on message');
    ws.on('message', (rawAudio) => {
      // Detect when it is time to finish
      if ((typeof rawAudio) === 'string' && rawAudio === 'end') {
        streamFinished = true;
        clearInterval(interimTimer);
        let transcript = this._model.finishStream(dsStream);
        console.debug('end: transcript', transcript);
        ws.send(JSON.stringify({'transcript': transcript}));
        return;
      }

      if ((typeof rawAudio) === 'string' && rawAudio === 'sample-rate') {
        console.debug('query model sample rate');
        ws.send(JSON.stringify({'sampleRate': sampleRate}));
        return;
      }

      if (!streamFinished) {
        this._model.feedAudioContent(dsStream, rawAudio.slice(0, rawAudio.length / 2));
      } else {
        console.debug('stream finished, sorry');
      }
    });

    console.log('setup websocket on close');
    ws.on('close', (data) => {
      console.log('websocket closed by client');
    });
  }
}

new DeepSpeechWorker();
