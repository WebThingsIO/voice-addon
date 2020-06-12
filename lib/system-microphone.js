'use strict';

const mic = require('mic');

class SystemMicrophone {
  constructor(sampleRate, micType) {
    this._mic = mic({
      endian: 'little',
      encoding: 'signed-integer',
      device: micType === 'USB' ? 'plughw:1,0' : 'hw:0,0',
      bitwidth: 16,
      rate: sampleRate,
      debug: false,
      exitOnSilence: 96, // in frames
      // up to 8 channels
      channels: 1,
    });
  }

  getStream() {
    return this._mic.getAudioStream();
  }

  start() {
    this._mic.stop();
    this._mic.start();
  }

  stop() {
    if (this._mic) {
      this._mic.stop();
      this._mic = null;
    }
  }
}

module.exports = SystemMicrophone;
