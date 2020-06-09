/**
 * voice-adapter.js - Voice adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {Adapter, Device, Property, Event} = require('gateway-addon');

const DsAPIHandler = require('./ds-api-handler');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let token, speaker, microphone;

class ActiveProperty extends Property {
  constructor(device, name, propertyDescription) {
    super(device, name, propertyDescription);
    this.setCachedValue(propertyDescription.value);
    this.device.notifyPropertyChanged(this);
    console.log(`ActiveProperty:${name}`);
  }

  /**
   * Set the value of the property.
   *
   * @param {*} value The new value to set
   * @returns a promise which resolves to the updated value.
   *
   * @note it is possible that the updated value doesn't match
   * the value passed in.
   */
  setValue(value) {
    if (value) {
      console.log(`ActiveProperty:${name} -> ${value}`);
      // spawn training
      this.device.eventNotify(new Event(this.device,
                                        'training',
                                        'started'));
    } else {
      console.log('shutdown training');
      // shutdown training
      if (this.training_process) {
        this.device.eventNotify(new Event(this.device,
                                          'training',
                                          'ended'));
      }
    }
    return new Promise((resolve, reject) => {
      super.setValue(value).then((updatedValue) => {
        resolve(updatedValue);
        this.device.notifyPropertyChanged(this);
      }).catch((err) => {
        reject(err);
      });
    });
  }
}

class VoiceDevice extends Device {
  constructor(adapter, id, deviceDescription) {
    super(adapter, id);
    console.log(`VoiceDevice:${deviceDescription.name}`);

    this.name = deviceDescription.name;
    this.type = deviceDescription.type;
    this['@type'] = deviceDescription['@type'];
    this.description = deviceDescription.description;
    for (const propertyName in deviceDescription.properties) {
      const propertyDescription = deviceDescription.properties[propertyName];
      console.log(`VoiceDevice:${deviceDescription.name}:${propertyName}`);
      const property = new ActiveProperty(this, propertyName,
                                          propertyDescription);
      this.properties.set(propertyName, property);
    }

    for (const event in deviceDescription.events) {
      console.log(
        'addedEvent',
        deviceDescription.events[event].name,
        deviceDescription.events[event].metadata
      );
      this.addEvent(deviceDescription.events[event].name,
                    deviceDescription.events[event].metadata);
    }

    this.ds = adapter.getDsApi();

    this.ds.events.on('transcript', this.dsEvent.bind(this));
    this.ds.events.on('silence', this.dsEvent.bind(this));

    console.log(`VoiceDevice:${deviceDescription.name}: start listening`);

    console.log('Waiting on acoustic deepspeech model to be ready');
    this.ds.events.on('acoustic-model-ready', () => {
      console.log('Starting Matrix');
      this.ds.startMatrixMic();
    });
  }

  dsEvent(ev) {
    console.log(`VoiceDevice:dsEvent: ${JSON.stringify(ev)}`);
  }
}

class VoiceAdapter extends Adapter {
  constructor(addonManager, packageName) {
    super(addonManager, 'VoiceAdapter', packageName);
    addonManager.addAdapter(this);
    console.log(`VoiceAdapter:${packageName}`);
    this.savedDevices = new Set();
    this._dsApi = this.startDsApi(addonManager);
  }

  getDsApi() {
    return this._dsApi;
  }

  startDsApi(addonManager) {
    console.log('Launching DsAPI from DsAdapter');
    return new DsAPIHandler(addonManager);
  }

  handleDeviceSaved(deviceId, deviceFull) {
    console.log(`DsAdapter discover device: ${deviceId}`);
    this.savedDevices.add(deviceFull);
    if (this._dsApi) {
      this._dsApi.generateLocalLM(this.savedDevices);
    }
  }

  /**
   * Example process to add a new device to the adapter.
   *
   * The important part is to call: `this.handleDeviceAdded(device)`
   *
   * @param {String} deviceId ID of the device to add.
   * @param {String} deviceDescription Description of the device to add.
   * @return {Promise} which resolves to the device added.
   */
  addDevice(deviceId, deviceDescription) {
    console.log(`VoiceAdapter:addDevice${deviceId}`);
    return new Promise((resolve, reject) => {
      if (deviceId in this.devices) {
        reject(`Device: ${deviceId} already exists.`);
      } else {
        const device = new VoiceDevice(this, deviceId, deviceDescription);
        this.handleDeviceAdded(device);
        resolve(device);
      }
    });
  }

  /**
   * Example process ro remove a device from the adapter.
   *
   * The important part is to call: `this.handleDeviceRemoved(device)`
   *
   * @param {String} deviceId ID of the device to remove.
   * @return {Promise} which resolves to the device removed.
   */
  removeDevice(deviceId) {
    console.log(`VoiceAdapter:removeDevice${deviceId}`);
    return new Promise((resolve, reject) => {
      const device = this.devices[deviceId];
      if (device) {
        this.handleDeviceRemoved(device);
        resolve(device);
      } else {
        reject(`Device: ${deviceId} not found.`);
      }
    });
  }

  /**
   * Start the pairing/discovery process.
   *
   * @param {Number} timeoutSeconds Number of seconds to run before timeout
   */
  startPairing(_timeoutSeconds) {
    console.log('VoiceAdapter:', this.name,
                'id', this.id, 'pairing started');
  }

  /**
   * Cancel the pairing/discovery process.
   */
  cancelPairing() {
    console.log('VoiceAdapter:', this.name, 'id', this.id,
                'pairing cancelled');
  }

  /**
   * Unpair the provided the device from the adapter.
   *
   * @param {Object} device Device to unpair with
   */
  removeThing(device) {
    console.log('VoiceAdapter:', this.name, 'id', this.id,
                'removeThing(', device.id, ') started');

    this.removeDevice(device.id).then(() => {
      console.log('VoiceAdapter: device:', device.id, 'was unpaired.');
    }).catch((err) => {
      console.error('VoiceAdapter: unpairing', device.id, 'failed');
      console.error(err);
    });
  }

  /**
   * Cancel unpairing process.
   *
   * @param {Object} device Device that is currently being paired
   */
  cancelRemoveThing(device) {
    console.log('VoiceAdapter:', this.name, 'id', this.id,
                'cancelRemoveThing(', device.id, ')');
  }

  // cleanup
  unload() {
    return new Promise(() => {
      console.log('VoiceAdapter: unload');
    });
  }
}

function loadVoiceAdapter(addonManager, manifest, _errorCallback) {
  token = manifest.moziot.config.token;
  speaker = manifest.moziot.config.speaker;
  microphone = manifest.moziot.config.microphone;
  console.log(`microphone ${microphone}`);
  console.log(`speaker ${speaker}`);

  let capture_pcm = '';
  let playback_pcm = '';

  if (microphone === 'USB') {
    capture_pcm = 'capture.pcm { \n type plug \n slave.pcm \'hw:1,0\' \n }';
  }

  if (speaker === 'USB') {
    playback_pcm = 'playback.pcm { \n type plug \n slave.pcm \'hw:1,0\' \n }';
  } else {
    playback_pcm = 'playback.pcm { \n type plug \n slave.pcm \'hw:0,0\' \n }';
  }

  console.log('writing asound.conf');
  const asound_tpl =
    `pcm.!default { \n type asym \n ${playback_pcm} \n ${capture_pcm} \n } \n`;
  fs.writeFileSync(path.join(__dirname, 'asound.conf'), asound_tpl);
  console.log('asound.conf written');

  const adapter = new VoiceAdapter(addonManager, manifest.name);
  const device = new VoiceDevice(adapter, 'voice-controller', {
    name: 'voice-controller',
    '@type': ['OnOffSwitch'],
    description: 'Voice Controller',
    properties: {
      on: {
        '@type': 'OnOffProperty',
        title: 'On/Off',
        name: 'on',
        type: 'boolean',
        value: false,
      },
    },
    events: [
      {
        name: 'wakeword',
        metadata: {
          description: 'A wakeword was deteced',
          type: 'string',
        },
      },
      {
        name: 'speechinput',
        metadata: {
          description: 'A voice command was detected',
          type: 'string',
        },
      },
      {
        name: 'command',
        metadata: {
          description: 'A web thing command was executed',
          type: 'string',
        },
      },
      {
        name: 'training',
        metadata: {
          description: 'Wakeword training started',
          type: 'string',
        },
      },
    ],
  });
  adapter.handleDeviceAdded(device);
}

module.exports = loadVoiceAdapter;
