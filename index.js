/**
 * index.js - Loads the voice adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const {Database} = require('gateway-addon');
const fs = require('fs');
const manifest = require('./manifest.json');
const path = require('path');
const VoiceAdapter = require('./lib/adapter');

function loadVoiceAdapter(addonManager, _, errorCallback) {
  const db = new Database(manifest.id);
  db.open().then(() => {
    return db.loadConfig();
  }).then((config) => {
    if (process.platform === 'linux') {
      let capture = '';
      let playback = '';

      switch (config.microphone) {
        case 'Analog':
          capture = 'capture.pcm { \n type plug \n slave.pcm \'hw:0,0\' \n }';
          break;
        case 'USB':
          capture = 'capture.pcm { \n type plug \n slave.pcm \'hw:1,0\' \n }';
          break;
        case 'MATRIX':
          try {
            require('@matrix-io/matrix-lite');
          } catch (e) {
            console.error(e);
            errorCallback(manifest.id, 'Failed to load matrix module');
            return;
          }

          break;
      }

      switch (config.speaker) {
        case 'USB':
          playback = 'playback.pcm { \n type plug \n slave.pcm \'hw:1,0\' \n }';
          break;
        default:
          playback = 'playback.pcm { \n type plug \n slave.pcm \'hw:0,0\' \n }';
          break;
      }

      const asoundConf =
        `pcm.!default { \n type asym \n ${playback} \n ${capture} \n }\n`;
      fs.writeFileSync(path.join(__dirname, 'asound.conf'), asoundConf);
    }

    new VoiceAdapter(addonManager, config);
  }).catch(console.error);
}

module.exports = loadVoiceAdapter;
