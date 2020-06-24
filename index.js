/**
 * index.js - Loads the voice adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const {Database} = require('gateway-addon');
const manifest = require('./manifest.json');
const VoiceAdapter = require('./lib/adapter');

function loadVoiceAdapter(addonManager, _, errorCallback) {
  const db = new Database(manifest.id);
  db.open().then(() => {
    return db.loadConfig();
  }).then((config) => {
    if (!config.token) {
      errorCallback(manifest.id, 'Add-on must be configured before use');
      return;
    }

    if (!config.keyword) {
      config.keyword = manifest.options.default.keyword;
    }

    if (!config.speaker) {
      config.speaker = manifest.options.default.speaker;
    }

    if (!config.microphone) {
      config.microphone = manifest.options.default.microphone;
    }

    if (config.microphone === 'MATRIX') {
      try {
        require('@matrix-io/matrix-lite');
      } catch (e) {
        console.error(e);
        errorCallback(manifest.id, 'Failed to load matrix module');
        return;
      }
    }

    new VoiceAdapter(addonManager, config);
  }).catch(console.error);
}

module.exports = loadVoiceAdapter;
