'use strict';

const cp = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const manifest = require('../manifest.json');
const path = require('path');
const WebSocket = require('ws');

class DeepSpeechInterface {
  constructor(userProfile) {
    this._modelsDir = path.join(userProfile.dataDir, manifest.id, 'models');
    this._binDir = path.join(userProfile.baseDir, 'addons', manifest.id, 'bin');
    this.events = new EventEmitter();
    this._wsPort = 3000;
    this._dsWorker = null;
    console.log('Waiting to setup things ...');
    this.setup().then((setupSuccess) => {
      console.log(`Setup finished with: ${setupSuccess}`);
      if (!setupSuccess) {
        console.error(
          'Setup failure, please verify logs with',
          '`sudo journalctl -xe -f -u mozilla-iot-gateway.service`',
          'to find more.'
        );
        return;
      }

      this._dsWorker = cp.fork(
        `${__dirname}/deepspeech.js`,
        [this._modelsDir, this._wsPort]
      );
      this._dsWorker.on('close', (code, signal) => {
        console.log(
          `child process terminated due to receipt of signal ${
            signal} with exit code ${code}`
        );
      });

      // wrap in setTimeout to make sure forked process is listening on the port
      // 10 seconds should be safe to avoid racy startup of MATRIX microphone.
      // if the process it not yet listening, the WebSocket connection will
      // fail, the addon will crash and restart, and should be able to reconnect
      // at some point.
      setTimeout(() => {
        this.events.emit('acoustic-model-ready', {});
      }, 10 * 1000);
    }).catch((ex) => {
      console.error(`Setup failed with: ${ex}`);
    });
  }

  async setup() {
    console.log(`Checking existence of models under ${this._modelsDir}`);

    if (!fs.existsSync(this._modelsDir)) {
      fs.mkdirSync(this._modelsDir);
    }

    const downloadResult = await this.downloadModel(this._modelsDir);
    if (downloadResult !== true) {
      console.error('Unable to find the DeepSpeech model, please verify logs.');
      return false;
    }

    return true;
  }

  async downloadModel(rootDir) {
    const fetch = require('node-fetch');
    const unzip = require('unzipper');

    const kTflite = 'output_graph.tflite';
    const kInfos = 'info.json';

    const kModelURL =
      'https://github.com/lissyx/DeepSpeech/releases/download/v0.6.0/en-us.zip';
    const kModelDir = path.join(rootDir, 'en-us');
    const kModelFile = path.join(kModelDir, kTflite);
    const kModelZip = path.join(kModelDir, 'en-us.zip');

    if (fs.existsSync(kModelFile)) {
      console.log(`Model file exists: ${kModelFile}`);
      return true;
    }

    console.log(`Model file does not exist: ${kModelFile}`);
    fs.mkdirSync(kModelDir);

    console.debug(`fetching ${kModelURL}`);
    const res = await fetch(kModelURL);
    const rv = await new Promise((resolve, reject) => {
      const fStream = fs.createWriteStream(kModelZip);
      console.debug(`opening stream to ${kModelZip}`);
      res.body.pipe(fStream);
      console.debug(`writing stream to ${kModelZip}`);
      res.body.on('error', (err) => {
        console.debug(`download failure ${err}`);
        reject(err);
      });
      console.debug(`waiting stream to ${kModelZip}`);
      fStream.on('finish', function() {
        console.debug('download success');
        let hasModel = false;
        let hasInfos = false;
        fs.createReadStream(kModelZip)
          .pipe(unzip.Parse())
          .on('entry', (entry) => {
            console.debug(`archive entry: ${entry.path}`);
            if (entry.path == kTflite || entry.path == kInfos) {
              entry.pipe(fs.createWriteStream(path.join(kModelDir, entry.path)))
                .on('finish', () => {
                  console.debug(`archive entry: ${entry.path} finished`);

                  if (entry.path == kTflite) {
                    hasModel = true;
                  }

                  if (entry.path == kInfos) {
                    hasInfos = true;
                  }

                  console.debug(
                    `archive hasModel:${hasModel} -- hasInfos:${hasInfos}`
                  );
                  if (hasModel && hasInfos) {
                    resolve(true);
                  }
                });
            } else {
              entry.autodrain();
            }
          });
      });
    });

    console.debug(`should run after finished stream to ${kModelZip}`);
    fs.unlinkSync(kModelZip);
    console.debug(`removed ${kModelZip}`);

    return rv;
  }

  async generateLocalLM(devices) {
    console.log(`Generate local LM for models under ${this._modelsDir}`);

    /**
     * List of commands from src/controllers/commands_controller.js#L6-L13:
     *  Grammar that the parser understands:
     *  Turn the <tag> light <on|off>
     *  Turn <tag> <on|off>
     *  Shut <tag> <on|off>
     *  Shut the <tag> light <on|off>
     *  When was <tag> last <boolean>
     *  Is <tag> <boolean>
     *  Is <tag> not <boolean>
     **/

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
    console.log(`Generate local LM for devices: ${JSON.stringify(tags)}`);

    for (let i = 0; i < grammar.length; i++) {
      tags.forEach((tag) => {
        let gi = grammar[i];
        gi = gi.replace(/<tag>/g, tag);

        const gii_on_off = gi;
        on_off.forEach((sw) => {
          gi = gii_on_off.replace(/<on\|off>/g, sw);

          const gii_true_false = gi;
          true_false.forEach((bool) => {
            gi = gii_true_false.replace(/<boolean>/g, bool).toLowerCase();

            if (finalGrammar.indexOf(gi) < 0) {
              // console.log('for ' + tag + ': ' + gi);
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

    const {spawnSync} = require('child_process');

    const child_lmplz = spawnSync(path.join(this._binDir, 'lmplz'), [
      '--memory', '64M',
      '--order', '2', '--discount_fallback',
      '--text', localLMTxt,
      '--arpa', localLMArpa,
    ]);

    console.log('lmplz stdout ', child_lmplz.stdout.toString());
    console.log('lmplz stderr ', child_lmplz.stderr.toString());

    const child_binary = spawnSync(path.join(this._binDir, 'build_binary'), [
      '-a', '255', '-q', '8', 'trie',
      localLMArpa, localLMBinary,
    ]);

    console.log('binary stdout ', child_binary.stdout.toString());
    console.log('binary stderr ', child_binary.stderr.toString());
  }

  startMatrixMic() {
    console.log('About to start Matrix mic');
    const matrix = require('@matrix-io/matrix-lite');

    this._ws = new WebSocket(`ws://127.0.0.1:${this._wsPort}/stream`);

    this._ws.on('message', (m) => {
      const msg = JSON.parse(m);
      console.log(`Received message: ${m}`);

      if (msg.sampleRate) {
        const modelSampleRate = msg.sampleRate;
        console.log(`Setting sample rate to: ${modelSampleRate}`);
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
          console.log('Got SIGNAL silence');
          this.stopMatrixMic();
          this.events.emit('silence', {});
        });

        this._mic.start();
        console.log('Matrix mic started');
      }

      if (msg.transcript) {
        console.log(`Computed transcript was: ${msg.transcript}`);
        this.events.emit('transcript', msg);
      }
    });

    this._ws.on('open', () => {
      this._ws.send('sample-rate');
    });
  }

  stopMatrixMic() {
    console.log('About to stop Matrix mic');
    this._mic && this._mic.stop();
    this._ws && this._ws.send('end');
    console.log('Matrix mic stopped');
  }
}

module.exports = DeepSpeechInterface;
