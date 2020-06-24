/**
 * voice-adapter.js - Voice adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const {Adapter, Event} = require('gateway-addon');
const DeepSpeechInterface = require('./deep-speech-interface');
const levenshtein = require('js-levenshtein');
const manifest = require('../manifest.json');
const {normalizeDeviceName} = require('./command-utils');
const VoiceDevice = require('./device');

class VoiceAdapter extends Adapter {
  constructor(addonManager, config) {
    super(addonManager, manifest.id, manifest.id);
    addonManager.addAdapter(this);
    this.config = config;
    this._savedDevices = {};
    this._nameMap = {};
    this._dsInterface = new DeepSpeechInterface(this);
    this._deviceSavedTimeout = null;
    this.startPairing();
  }

  startPairing() {
    if (!this.devices['voice-controller']) {
      this.handleDeviceAdded(new VoiceDevice(this, this._dsInterface));
    }
  }

  triggerEvent(name, data) {
    const device = this.devices['voice-controller'];
    if (device) {
      device.eventNotify(new Event(device, name, data));
    }
  }

  handleInput(input) {
    const matches = {};
    for (const [id, name] of Object.entries(this._nameMap)) {
      const distance = levenshtein(name, input.deviceName);
      const percent =
        (1 - (distance / Math.max(name.length, input.deviceName.length)));
      matches[id] = percent;
    }

    const best = Object.entries(matches).sort((a, b) => b[1] - a[1])[0];

    if (best[1] >= 0.7) {
      console.log(input);
      console.log(best);
      // TODO
      return true;
    }

    return false;
  }

  handleDeviceSaved(deviceId, device) {
    if (this._deviceSavedTimeout) {
      clearTimeout(this._deviceSavedTimeout);
    }

    this._savedDevices[deviceId] = device;
    this._nameMap[deviceId] = normalizeDeviceName(device.title);

    this._deviceSavedTimeout = setTimeout(() => {
      this._dsInterface.generateLocalLM(Object.values(this._nameMap));
    }, 1000);
  }

  unload() {
    this._dsInterface.stopMicrophone();
    return Promise.resolve();
  }
}

module.exports = VoiceAdapter;
