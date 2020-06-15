'use strict';

const matrix = require('@matrix-io/matrix-lite');

class MatrixMicrophone {
  constructor(sampleRate) {
    this._mic = matrix.alsa.mic({
      endian: 'little',
      encoding: 'signed-integer',
      device: 'plughw:CARD=MATRIXIOSOUND,DEV=0',
      bitwidth: 16,
      rate: sampleRate,
      debug: false,
      exitOnSilence: 12, // in frames
      channels: 1,
    });
  }

  getStream() {
    return this._mic.getAudioStream();
  }

  start() {
    if (this._mic) {
      this._mic.start();
    }
  }

  stop() {
    if (this._mic) {
      this._mic.stop();
      this._mic = null;
    }
  }

  resume() {
    if (this._mic) {
      this._mic.resume();
    }
  }

  pause() {
    if (this._mic) {
      this._mic.pause();
    }
  }
}

module.exports = MatrixMicrophone;
