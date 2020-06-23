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
const manifest = require('../manifest.json');
const VoiceDevice = require('./device');

class VoiceAdapter extends Adapter {
  constructor(addonManager, config) {
    super(addonManager, manifest.id, manifest.id);
    addonManager.addAdapter(this);
    this.config = config;
    this._savedDevices = {};
    this._dsInterface = new DeepSpeechInterface(this);
    this._deviceSavedTimeout = null;
    this.startPairing();
  }

  startPairing() {
    if (!this.devices['voice-controller']) {
      this.handleDeviceAdded(new VoiceDevice(this));
    }
  }

  triggerEvent(name, data) {
    const device = this.devices['voice-controller'];
    if (device) {
      device.eventNotify(new Event(device, name, data));
    }
  }

  handleDeviceSaved(deviceId, device) {
    if (this._deviceSavedTimeout) {
      clearTimeout(this._deviceSavedTimeout);
    }

    this._savedDevices[deviceId] = device;

    this._deviceSavedTimeout = setTimeout(() => {
      this._dsInterface.generateLocalLM(Object.values(this._savedDevices));
    }, 1000);
  }

  unload() {
    this._dsInterface.stopMicrophone();
    return Promise.resolve();
  }
}

module.exports = VoiceAdapter;
