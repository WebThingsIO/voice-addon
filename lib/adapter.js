/**
 * voice-adapter.js - Voice adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const {Adapter, Event} = require('gateway-addon');
const CoquiSttInterface = require('./coqui-stt-interface');
const levenshtein = require('js-levenshtein');
const manifest = require('../manifest.json');
const {normalizeDeviceName} = require('./command-utils');
const VoiceDevice = require('./device');
const {WebThingsClient} = require('webthings-client');

class VoiceAdapter extends Adapter {
  constructor(addonManager, config) {
    super(addonManager, manifest.id, manifest.id);

    this.config = config;
    this._savedDevices = {};
    this._nameMap = {};
    this._deviceSavedTimeout = null;
    this.promise = WebThingsClient.local(config.token).then((client) => {
      this._client = client;

      addonManager.addAdapter(this);

      this._sttInterface = new CoquiSttInterface(this);
      this.startPairing();
    });
  }

  startPairing() {
    if (!this.devices['voice-controller']) {
      this.handleDeviceAdded(new VoiceDevice(this, this._sttInterface));
    }
  }

  triggerEvent(name, data) {
    const device = this.devices['voice-controller'];
    if (device) {
      device.eventNotify(new Event(device, name, data));
    }
  }

  async handleInput(input) {
    const matches = {};
    for (const [id, name] of Object.entries(this._nameMap)) {
      const distance = levenshtein(name, input.deviceName);
      const percent =
        (1 - (distance / Math.max(name.length, input.deviceName.length)));
      matches[id] = percent;
    }

    const best = Object.entries(matches).sort((a, b) => b[1] - a[1])[0];

    if (best[1] < 0.7) {
      return false;
    }

    const device = this._savedDevices[best[0]];
    const property = Object.entries(device.properties)
      .find((x) => x[1]['@type'] === input.propertyType);

    if (!property) {
      return false;
    }

    const clientDevices = await this._client.getDevices();
    const clientDevice = clientDevices.find((d) => d.href() === device.href);
    if (!clientDevice) {
      return false;
    }

    const clientProperty = clientDevice.properties[property[0]];
    if (!clientProperty) {
      return false;
    }

    if (input.hasOwnProperty('value')) {
      await clientProperty.setValue(input.value);
      return true;
    }

    if (input.hasOwnProperty('adjustment')) {
      const currentValue = await clientProperty.getValue();
      const newValue = currentValue + input.adjustment;
      await clientProperty.setValue(newValue);
      return true;
    }

    if (input.hasOwnProperty('queryValue')) {
      const currentValue = await clientProperty.getValue();
      return currentValue === input.queryValue;
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
      this._sttInterface.generateLocalLM(Object.values(this._nameMap));
    }, 1000);
  }

  unload() {
    this._sttInterface.stopMicrophone();
    return Promise.resolve();
  }
}

module.exports = VoiceAdapter;
