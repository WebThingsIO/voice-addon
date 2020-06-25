'use strict';

const Ds = require('deepspeech');
const {spawnSync} = require('child_process');
const fs = require('fs');
const {
  buildGrammar,
  matchTranscript,
} = require('./command-utils');
const manifest = require('../manifest.json');
const path = require('path');
const SoundPlayer = require('sound-player');

const DEBUG = true;
const STATE = {
  WAITING_FOR_SETUP: 0,
  LISTENING_FOR_WAKE_WORD: 1,
  LISTENING_FOR_COMMAND: 2,
};
const SOUNDS = {
  'wake-word': path.join(__dirname, '..', 'assets', 'wake-word.wav'),
  success: path.join(__dirname, '..', 'assets', 'success.wav'),
  error: path.join(__dirname, '..', 'assets', 'error.wav'),
  'no-input': path.join(__dirname, '..', 'assets', 'no-input.wav'),
};

class DeepSpeechInterface {
  constructor(adapter) {
    this._adapter = adapter;
    this._wakeWord = adapter.config.keyword.toLowerCase();
    this._microphoneType = adapter.config.microphone;
    this._customMicrophoneId = adapter.config.customMicrophoneId;
    this._speakerType = adapter.config.speaker;
    this._customSpeakerId = adapter.config.customSpeakerId;
    this._modelsDir =
      path.join(adapter.userProfile.dataDir, manifest.id, 'models');
    this._assetsDir = path.join(__dirname, '..', 'assets');
    this._binDir = path.join(__dirname, '..', 'bin');
    this._model = null;
    this._stream = null;
    this._state = STATE.WAITING_FOR_SETUP;
    this._enabled = true;
  }

  disable() {
    if (DEBUG) {
      console.debug('Disabling listener');
    }

    this._enabled = false;
    this.pauseMicrophone();
  }

  enable() {
    if (DEBUG) {
      console.debug('Enabling listener');
    }

    this._state = STATE.LISTENING_FOR_WAKE_WORD;
    this._enabled = true;
    this.resumeMicrophone();
  }

  async generateLocalLM(tags) {
    if (DEBUG) {
      console.debug(`Generating local LM for models under: ${this._modelsDir}`);
    }

    const finalGrammar = [];

    if (DEBUG) {
      console.debug(`Generating local LM for devices: ${JSON.stringify(tags)}`);
    }

    buildGrammar().forEach((g) => {
      tags.forEach((tag) => {
        finalGrammar.push(g.replace(/<tag>/g, tag));
      });
    });

    finalGrammar.push(this._wakeWord);

    if (!fs.existsSync(this._modelsDir)) {
      fs.mkdirSync(this._modelsDir);
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

    if (DEBUG) {
      console.debug(`Loading model from ${this._modelsDir}`);
    }

    const modelJson =
      JSON.parse(fs.readFileSync(path.join(this._assetsDir, 'info.json')));

    const extension = process.arch === 'x64' ? 'pbmm' : 'tflite';
    this._model = new Ds.Model(
      path.join(this._assetsDir, `output_graph.${extension}`),
      500
    );

    if (DEBUG) {
      console.debug(`Enabling decoder on model ${this._modelsDir}`);
    }

    this._model.enableDecoderWithLM(
      path.join(this._modelsDir, 'local_lm.binary'),
      path.join(this._modelsDir, 'local_lm.trie'),
      modelJson.parameters.lmAlpha,
      modelJson.parameters.lmBeta
    );

    if (DEBUG) {
      console.debug('Decoder enabled successfully.');
    }

    await this.setupMicrophone();
  }

  async setupMicrophone() {
    if (this._state !== STATE.WAITING_FOR_SETUP) {
      return;
    }

    if (DEBUG) {
      console.debug('Setting up microphone');
    }

    const sampleRate = this._model.sampleRate();

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

    this._state = STATE.LISTENING_FOR_WAKE_WORD;
  }

  resumeMicrophone() {
    const dsStream = this._model.createStream();
    const micStream = this._mic.getStream();
    let interimTimer = null;

    if (DEBUG) {
      console.debug('Setup intermediate decoding');
      interimTimer = setInterval(() => {
        const transcript = this._model.intermediateDecode(dsStream);
        console.debug('interim:', transcript);
      }, 3 * 1000);
    }

    const dataHandler = (data) => {
      this._model.feedAudioContent(
        dsStream,
        data.slice(0, data.length / 2)
      );
    };

    micStream.once('pauseComplete', () => {
      if (interimTimer) {
        clearInterval(interimTimer);
        interimTimer = null;
      }

      if (!this._enabled) {
        return;
      }

      if (DEBUG) {
        console.debug('Microphone stopped, waiting for transcript');
      }

      micStream.removeListener('data', dataHandler);

      const transcript = this._model.finishStream(dsStream).trim();
      if (!transcript) {
        if (DEBUG) {
          console.debug('Transcript was empty');
        }

        if (this._state === STATE.LISTENING_FOR_COMMAND) {
          this.playSound('no-input');
          this._state = STATE.LISTENING_FOR_WAKE_WORD;
        }

        this.resumeMicrophone();
        return;
      }

      if (DEBUG) {
        console.debug(`Computed transcript was: ${transcript}`);
      }

      switch (this._state) {
        case STATE.LISTENING_FOR_WAKE_WORD: {
          if (transcript.endsWith(this._wakeWord)) {
            this._adapter.triggerEvent('wakeword', this._wakeWord);
            this.playSound('wake-word');
            this._state = STATE.LISTENING_FOR_COMMAND;
          }
          break;
        }
        case STATE.LISTENING_FOR_COMMAND: {
          const match = matchTranscript(transcript);
          if (match) {
            this._adapter.triggerEvent('speechinput', transcript);

            this._adapter.handleInput(match).then((handled) => {
              if (handled) {
                this._adapter.triggerEvent('command', transcript);
                this.playSound('success');
              } else {
                this.playSound('error');
              }

              this._state = STATE.LISTENING_FOR_WAKE_WORD;
              this.resumeMicrophone();
            });

            return;
          } else {
            this.playSound('error');
          }

          this._state = STATE.LISTENING_FOR_WAKE_WORD;
          break;
        }
      }

      this.resumeMicrophone();
    });

    micStream.on('data', dataHandler);

    if (DEBUG) {
      console.debug('Resuming microphone');
    }

    this._mic.resume();
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
