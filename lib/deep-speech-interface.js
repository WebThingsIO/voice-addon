'use strict';

const EventEmitter = require('events');
const {fork, spawnSync} = require('child_process');
const fs = require('fs');
const manifest = require('../manifest.json');
const path = require('path');
const WebSocket = require('ws');

const DEBUG = true;

class DeepSpeechInterface {
  constructor(adapter) {
    this._micType = adapter.config.microphone;
    this._modelsDir =
      path.join(adapter.userProfile.dataDir, manifest.id, 'models');
    this._binDir =
      path.join(adapter.userProfile.baseDir, 'addons', manifest.id, 'bin');
    this.events = new EventEmitter();
    this._wsPort = 3000;
    this._dsWorker = null;

    if (DEBUG) {
      console.debug('Starting setup process');
    }

    this.setup().then((success) => {
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

      setTimeout(this.startMicrophone.bind(this), 10 * 1000);
    }).catch((err) => {
      console.error('Setup failed:', err);
      adapter.manager.sendError('Voice Add-on failed to set up speech models');
    });
  }

  async setup() {
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
      [this._modelsDir, this._wsPort]
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

  startMicrophone() {
    if (DEBUG) {
      console.debug('Starting microphone');
    }

    this._ws = new WebSocket(`ws://127.0.0.1:${this._wsPort}/stream`);

    this._ws.on('message', (m) => {
      const msg = JSON.parse(m);

      if (DEBUG) {
        console.debug(`Received message: ${m}`);
      }

      if (msg.sampleRate) {
        if (this._micType === 'MATRIX') {
          const MatrixMicrophone = require('./matrix-microphone');
          this._mic = new MatrixMicrophone(msg.sampleRate);
        } else {
          const SystemMicrophone = require('./system-microphone');
          this._mic = new SystemMicrophone(msg.sampleRate, this._micType);
        }

        const micStream = this._mic.getStream();
        micStream.pipe(WebSocket.createWebSocketStream(this._ws));

        micStream.on('silence', () => {
          if (DEBUG) {
            console.debug('Got silence event');
          }

          this.stopMicrophone();
          this.events.emit('silence', {});
        });

        this._ws.send('stream-start');
        this._mic.start();

        if (DEBUG) {
          console.debug('Microphone started');
        }
      }

      if (msg.transcript) {
        if (DEBUG) {
          console.debug(`Computed transcript was: ${msg.transcript}`);
        }

        this.events.emit('transcript', msg);
        this._ws.send('stream-start');
        this._mic.start();
      }
    });

    this._ws.on('open', () => {
      this._ws.send('get-sample-rate');
    });
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
      this._ws.send('stream-end');
    }
  }
}

module.exports = DeepSpeechInterface;
