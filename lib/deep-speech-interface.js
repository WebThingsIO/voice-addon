'use strict';

const EventEmitter = require('events');
const fetch = require('node-fetch');
const {fork, spawnSync} = require('child_process');
const fs = require('fs');
const manifest = require('../manifest.json');
const path = require('path');
const unzip = require('unzipper');
const WebSocket = require('ws');

const DEBUG = true;

class DeepSpeechInterface {
  constructor(adapter) {
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

      this._dsWorker = fork(
        `${__dirname}/deep-speech-worker.js`,
        [this._modelsDir, this._wsPort]
      );
      this._dsWorker.on('close', (code) => {
        console.log(`DeepSpeech Worker process terminated with code ${code}`);
      });
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

    const success = await this.downloadModel(this._modelsDir);
    if (!success) {
      console.error('Unable to find the DeepSpeech model, please check logs.');
      return false;
    }

    return true;
  }

  async downloadModel(rootDir) {
    const kTflite = 'output_graph.tflite';
    const kInfo = 'info.json';

    const kModelURL =
      'https://github.com/lissyx/DeepSpeech/releases/download/v0.6.0/en-us.zip';
    const kModelDir = path.join(rootDir, 'en-us');
    const kModelFile = path.join(kModelDir, kTflite);
    const kModelZip = path.join(kModelDir, 'en-us.zip');

    if (fs.existsSync(kModelFile)) {
      if (DEBUG) {
        console.debug(`Model file already exists: ${kModelFile}`);
      }

      return true;
    }

    fs.mkdirSync(kModelDir);


    console.log(`Model file does not yet exist: ${kModelFile}`);
    console.log(`Fetching: ${kModelURL}`);

    const response = await fetch(kModelURL);
    const rv = await new Promise((resolve, reject) => {
      const fStream = fs.createWriteStream(kModelZip);

      if (DEBUG) {
        console.debug(`opening stream to: ${kModelZip}`);
      }

      response.body.pipe(fStream);

      if (DEBUG) {
        console.debug(`writing stream to: ${kModelZip}`);
      }

      response.body.on('error', (err) => {
        console.error(`download failure ${err}`);
        reject(err);
      });

      if (DEBUG) {
        console.debug('waiting for download to finish');
      }

      fStream.on('finish', function() {
        console.log('Model download complete');

        let hasModel = false;
        let hasInfo = false;
        fs.createReadStream(kModelZip)
          .pipe(unzip.Parse())
          .on('entry', (entry) => {
            if (DEBUG) {
              console.debug(`archive entry: ${entry.path}`);
            }

            if (entry.path === kTflite || entry.path === kInfo) {
              entry.pipe(fs.createWriteStream(path.join(kModelDir, entry.path)))
                .on('finish', () => {
                  if (DEBUG) {
                    console.debug(`archive entry: ${entry.path} finished`);
                  }

                  if (entry.path === kTflite) {
                    hasModel = true;
                  }

                  if (entry.path === kInfo) {
                    hasInfo = true;
                  }

                  if (hasModel && hasInfo) {
                    resolve(true);
                  }
                });
            } else {
              entry.autodrain();
            }
          });
      });
    });

    fs.unlinkSync(kModelZip);

    if (DEBUG) {
      console.debug(`removed ${kModelZip}`);
    }

    return rv;
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

    const localLMTxt = path.join(this._modelsDir, 'en-us', 'local_lm.txt');
    const localLMArpa = path.join(this._modelsDir, 'en-us', 'local_lm.arpa');
    const localLMBinary =
      path.join(this._modelsDir, 'en-us', 'local_lm.binary');
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
    this._dsWorker.on('close', (code, signal) => {
      console.log(
        `child process terminated due to receipt of signal ${
          signal} with exit code ${code}`
      );
      this._dsWorker = null;
    });
  }

  stopWorker() {
    if (this._dsWorker) {
      this._dsWorker.kill();
    }
  }

  startMatrixMic() {
    if (DEBUG) {
      console.debug('Starting Matrix microphone');
    }

    const matrix = require('@matrix-io/matrix-lite');

    this._ws = new WebSocket(`ws://127.0.0.1:${this._wsPort}/stream`);

    this._ws.on('message', (m) => {
      const msg = JSON.parse(m);

      if (DEBUG) {
        console.debug(`Received message: ${msg}`);
      }

      if (msg.sampleRate) {
        const modelSampleRate = msg.sampleRate;

        if (DEBUG) {
          console.debug(`Setting sample rate to: ${modelSampleRate}`);
        }

        this._mic = matrix.alsa.mic({ // or configure settings
          endian: 'little',
          encoding: 'signed-integer',
          device: 'plughw:CARD=MATRIXIOSOUND,DEV=0',
          bitwidth: 16,
          rate: modelSampleRate,
          debug: false,
          exitOnSilence: 96, // in frames
          // up to 8 channels
          channels: 1,
        });

        // Pipe mic data to file
        const micStream = this._mic.getAudioStream();
        micStream.pipe(WebSocket.createWebSocketStream(this._ws));

        micStream.on('silence', () => {
          if (DEBUG) {
            console.debug('Got SIGNAL silence');
          }

          this.stopMatrixMic();
          this.events.emit('silence', {});
        });

        this._mic.start();

        if (DEBUG) {
          console.debug('Matrix mic started');
        }
      }

      if (msg.transcript) {
        if (DEBUG) {
          console.debug(`Computed transcript was: ${msg.transcript}`);
        }

        this.events.emit('transcript', msg);
        this._ws.close();
        this._ws = null;
      }
    });

    this._ws.on('open', () => {
      this._ws.send('get-sample-rate');
    });
  }

  stopMatrixMic() {
    if (DEBUG) {
      console.debug('Stopping Matrix microphone');
    }

    if (this._mic) {
      this._mic.stop();
      this._mic = null;
    }

    if (this._ws) {
      this._ws.send('end');
    }
  }
}

module.exports = DeepSpeechInterface;
