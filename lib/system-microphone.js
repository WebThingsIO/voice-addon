'use strict';

const mic = require('mic');

class SystemMicrophone {
  constructor(sampleRate, micType, customMicId) {
    let micId;
    switch (micType) {
      case 'USB':
        micId = 'plughw:1,0';
        break;
      case 'Default':
        micId = 'hw:0,0';
        break;
      case 'Custom':
        micId = customMicId;
        break;
    }

    this._mic = mic({
      endian: 'little',
      encoding: 'signed-integer',
      device: micId,
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

module.exports = SystemMicrophone;
