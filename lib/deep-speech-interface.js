'use strict';

const {fork, spawnSync} = require('child_process');
const fetch = require('node-fetch');
const fs = require('fs');
const manifest = require('../manifest.json');
const path = require('path');
const SoundPlayer = require('sound-player');
const WebSocket = require('ws');

const DEBUG = true;
const STATE = {
  LISTENING_FOR_WAKE_WORD: 0,
  LISTENING_FOR_COMMAND: 1,
};
const SOUNDS = {
  ding: path.join(__dirname, '..', 'assets', 'ding.wav'),
  dong: path.join(__dirname, '..', 'assets', 'dong.wav'),
};

class DeepSpeechInterface {
  constructor(adapter) {
    this._wakeWord = adapter.config.keyword;
    this._microphoneType = adapter.config.microphone;
    this._customMicrophoneId = adapter.config.customMicrophoneId;
    this._speakerType = adapter.config.speaker;
    this._customSpeakerId = adapter.config.customSpeakerId;
    this._modelsDir =
      path.join(adapter.userProfile.dataDir, manifest.id, 'models');
    this._binDir =
      path.join(adapter.userProfile.baseDir, 'addons', manifest.id, 'bin');
    this._serverPort = 3000;
    this._dsWorker = null;
    this._state = STATE.LISTENING_FOR_WAKE_WORD;

    const success = this.setup();

    if (!success) {
      console.error(
        'Setup failure, please verify logs with',
        '`sudo journalctl -xe -f -u mozilla-iot-gateway.service`',
        'to find out more.'
      );
      adapter.manager.sendError(
        'Voice Add-on failed to set up speech models'
      );
      return;
    }

    if (DEBUG) {
      console.debug('Setup completed successfully');
    }

    this.startWorker();

    setTimeout(this.setupMicrophone.bind(this), 10 * 1000);
  }

  setup() {
    if (DEBUG) {
      console.debug(
        `Checking if models already exist under ${this._modelsDir}`
      );
    }

    if (!fs.existsSync(this._modelsDir)) {
      fs.mkdirSync(this._modelsDir);
    }

    return true;
  }

  async generateLocalLM(devices) {
    if (DEBUG) {
      console.debug(`Generating local LM for models under: ${this._modelsDir}`);
    }

    const grammar = [
      this._wakeWord,
      'Turn the <tag> light <on|off>',
      'Turn <tag> <on|off>',
      'Shut <tag> <on|off>',
      'Shut the <tag> light <on|off>',
      'When was <tag> last <boolean>',
      'Is <tag> <boolean>',
      'Is <tag> not <boolean>',
    ];

    const finalGrammar = [];

    const on_off = ['on', 'off'];
    const true_false = ['true', 'false'];
    const tags = [];
    devices.forEach((device) => {
      tags.push(device.title);
    });

    if (DEBUG) {
      console.debug(`Generating local LM for devices: ${JSON.stringify(tags)}`);
    }

    for (let gi of grammar) {
      tags.forEach((tag) => {
        gi = gi.replace(/<tag>/g, tag);

        const gii_on_off = gi;
        on_off.forEach((sw) => {
          gi = gii_on_off.replace(/<on\|off>/g, sw);

          const gii_true_false = gi;
          true_false.forEach((bool) => {
            gi = gii_true_false.replace(/<boolean>/g, bool).toLowerCase();

            if (finalGrammar.indexOf(gi) < 0) {
              finalGrammar.push(gi);
            }
          });
        });
      });
    }

    const localLMTxt = path.join(this._modelsDir, 'local_lm.txt');
    const localLMArpa = path.join(this._modelsDir, 'local_lm.arpa');
    const localLMBinary = path.join(this._modelsDir, 'local_lm.binary');
    fs.writeFileSync(localLMTxt, finalGrammar.join('\n'));

    const lmplz = spawnSync(
      path.join(this._binDir, 'lmplz'),
      [
        '--memory', '64M',
        '--order', '2',
        '--discount_fallback',
        '--text', localLMTxt,
        '--arpa', localLMArpa,
      ]
    );

    if (DEBUG) {
      console.debug('lmplz: status:', lmplz.status);
      console.debug('lmplz: stdout:', lmplz.stdout.toString());
      console.debug('lmplz: stderr:', lmplz.stderr.toString());
    }

    const buildBinary = spawnSync(
      path.join(this._binDir, 'build_binary'),
      [
        '-a', '255',
        '-q', '8',
        'trie',
        localLMArpa,
        localLMBinary,
      ]
    );

    if (DEBUG) {
      console.debug('build_binary: status:', buildBinary.status);
      console.debug('build_binary: stdout:', buildBinary.stdout.toString());
      console.debug('build_binary: stderr:', buildBinary.stderr.toString());
    }
  }

  startWorker() {
    this._dsWorker = fork(
      `${__dirname}/deep-speech-worker.js`,
      [this._modelsDir, this._serverPort]
    );
    this._dsWorker.on('close', (code) => {
      console.log(`DeepSpeech Worker process terminated with code ${code}`);
      this._dsWorker = null;
    });
  }

  stopWorker() {
    if (this._dsWorker) {
      this._dsWorker.kill();
    }
  }

  async setupMicrophone() {
    if (DEBUG) {
      console.debug('Setting up microphone');
    }

    const res = await fetch(`http://127.0.0.1:${this._serverPort}/sample-rate`);
    const {sampleRate} = await res.json();

    if (this._microphoneType === 'MATRIX') {
      const MatrixMicrophone = require('./matrix-microphone');
      this._mic = new MatrixMicrophone(sampleRate);
    } else {
      const SystemMicrophone = require('./system-microphone');
      this._mic = new SystemMicrophone(
        sampleRate,
        this._microphoneType,
        this._customMicrophoneId
      );
    }

    const micStream = this._mic.getStream();
    micStream.on('error', console.error);

    micStream.on('silence', () => {
      if (DEBUG) {
        console.debug('Got silence event');
      }

      this.pauseMicrophone();
    });

    micStream.once('startComplete', () => {
      this._mic.pause();
    });

    micStream.once('pauseComplete', () => {
      // now, get things in the proper state to start streaming
      this.resumeMicrophone();
    });

    // start the mic process to get it in a good state
    this._mic.start();
  }

  resumeMicrophone() {
    this._ws = new WebSocket(`ws://127.0.0.1:${this._serverPort}/stream`);

    this._ws.on('error', console.error);

    this._ws.on('message', (m) => {
      const msg = JSON.parse(m);

      if (DEBUG) {
        console.debug(`Received message: ${m}`);
      }

      if (!msg.hasOwnProperty('transcript')) {
        return;
      }

      if (DEBUG) {
        console.debug(`Computed transcript was: ${msg.transcript}`);
      }

      switch (this._state) {
        case STATE.LISTENING_FOR_WAKE_WORD:
          if (msg.transcript.endsWith(this._wakeWord)) {
            this.playSound('dong');
            this._state = STATE.LISTENING_FOR_COMMAND;
          }
          break;
        case STATE.LISTENING_FOR_COMMAND:
          this.playSound('ding');
          this._state = STATE.LISTENING_FOR_WAKE_WORD;
          break;
      }

      this._ws.close();
      this.resumeMicrophone();
    });

    this._ws.on('open', () => {
      const micStream = this._mic.getStream();
      const wsStream = WebSocket.createWebSocketStream(this._ws);

      micStream.once('pauseComplete', () => {
        if (DEBUG) {
          console.debug('Microphone stopped, waiting for transcript');
        }

        micStream.unpipe(wsStream);
        wsStream.end();
        this._ws.send('stream-end');
      });

      micStream.pipe(wsStream);

      if (DEBUG) {
        console.debug('Resuming microphone');
      }

      this._mic.resume();
    });
  }

  playSound(soundName) {
    if (!SOUNDS[soundName]) {
      return;
    }

    let speakerId;
    switch (this._speakerType) {
      case 'USB':
        speakerId = 'plughw:1,0';
        break;
      case 'Default':
        speakerId = 'hw:0,0';
        break;
      case 'Custom':
        speakerId = this._customSpeakerId;
        break;
    }

    const player = new SoundPlayer({
      filename: SOUNDS[soundName],
      gain: 1,
      device: speakerId,
    });

    player.play();
  }

  pauseMicrophone() {
    if (DEBUG) {
      console.debug('Pausing microphone');
    }

    if (this._mic) {
      this._mic.pause();
    }
  }

  stopMicrophone() {
    if (DEBUG) {
      console.debug('Stopping microphone');
    }

    if (this._mic) {
      this._mic.stop();
      this._mic = null;
    }

    if (this._ws) {
      this._ws.terminate();
    }
  }
}

module.exports = DeepSpeechInterface;
