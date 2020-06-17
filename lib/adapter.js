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
    this.config = config;
    this._savedDevices = {};
    this._dsInterface = new DeepSpeechInterface(this);
  }

  handleDeviceSaved(deviceId, device) {
    this._savedDevices[deviceId] = device;
    this._dsInterface.generateLocalLM(Object.values(this._savedDevices));
  }

  unload() {
    this._dsInterface.stopMicrophone();
    this._dsInterface.stopWorker();
    return Promise.resolve();
  }
}

module.exports = VoiceAdapter;
