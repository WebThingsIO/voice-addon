/**
 * voice-adapter.js - Voice adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const {Adapter} = require('gateway-addon');
const DeepSpeechInterface = require('./deep-speech-interface');
const manifest = require('../manifest.json');

class VoiceAdapter extends Adapter {
  constructor(addonManager, config) {
    super(addonManager, manifest.id, manifest.id);
    addonManager.addAdapter(this);
    this._config = config;
    this._savedDevices = new Set();
    this._dsInterface = new DeepSpeechInterface(this);

    if (this._config.microphone === 'MATRIX') {
      this._dsInterface.startMatrixMic();
    }
  }

  handleDeviceSaved(deviceId, deviceFull) {
    this._savedDevices.add(deviceFull);
    if (this._dsInterface) {
      this._dsInterface.generateLocalLM(this._savedDevices);
    }
  }

  unload() {
    this._dsInterface.stopWorker();
    return Promise.resolve();
  }
}

module.exports = VoiceAdapter;
