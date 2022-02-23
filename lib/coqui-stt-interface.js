'use strict';

let Stt;
Stt = require('stt');

const {spawnSync} = require('child_process');
const fs = require('fs');
const {
  buildGrammar,
  matchTranscript,
} = require('./command-utils');
const manifest = require('../manifest.json');
const path = require('path');
const SoundPlayer = require('sound-player');

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
    this._debug = !!adapter.config.debug;
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
    if (this._debug) {
      console.debug('Disabling listener');
    }

    this._enabled = false;
    this.pauseMicrophone();
  }

  enable() {
    if (this._debug) {
      console.debug('Enabling listener');
    }

    this._state = STATE.LISTENING_FOR_WAKE_WORD;
    this._enabled = true;
    this.resumeMicrophone();
  }

  async generateLocalLM(tags) {
    if (this._debug) {
      console.debug(`Generating local LM for models under: ${this._modelsDir}`);
    }

    const finalGrammar = [];

    if (this._debug) {
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
    const localLMScorer = path.join(this._modelsDir, 'local_lm.scorer');
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

    if (this._debug) {
      console.debug('lmplz: status:', lmplz.status);
      console.debug('lmplz: stdout:', lmplz.stdout.toString());
      console.debug('lmplz: stderr:', lmplz.stderr.toString());
    }

    const buildBinary = spawnSync(
      path.join(this._binDir, 'build_binary'),
      [
        '-a', '255',
        '-q', '8',
        '-v',
        'trie',
        localLMArpa,
        localLMBinary,
      ]
    );

    if (this._debug) {
      console.debug('build_binary: status:', buildBinary.status);
      console.debug('build_binary: stdout:', buildBinary.stdout.toString());
      console.debug('build_binary: stderr:', buildBinary.stderr.toString());
    }

    const generateScorer = spawnSync(
      path.join(this._binDir, 'generate_scorer_package'),
      [
        '--lm', localLMBinary,
        '--vocab', localLMTxt,
        '--package', localLMScorer,
        '--default_alpha', '0.75',
        '--default_beta', '1.85',
        '--alphabet', path.join(this._assetsDir, 'alphabet.txt'),
      ]
    );

    if (this._debug) {
      console.debug(
        'generate_scorer_package: status:',
        generateScorer.status
      );
      console.debug(
        'generate_scorer_package: stdout:',
        generateScorer.stdout.toString()
      );
      console.debug(
        'generate_scorer_package: stderr:',
        generateScorer.stderr.toString()
      );
    }

    if (this._debug) {
      console.debug(`Loading model from ${this._modelsDir}`);
    }

    this._model = new Stt.Model(
      path.join(this._assetsDir, `model.tflite`)
    );

    if (this._debug) {
      console.debug(`Enabling scorer on model ${this._modelsDir}`);
    }

    this._model.enableExternalScorer(localLMScorer);

    if (this._debug) {
      console.debug('Scorer enabled successfully.');
    }

    await this.setupMicrophone();
  }

  async setupMicrophone() {
    if (this._state !== STATE.WAITING_FOR_SETUP) {
      return;
    }

    if (this._debug) {
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
      if (this._debug) {
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
    const sttStream = this._model.createStream();
    const micStream = this._mic.getStream();
    let silenceCount = 0;

    if (this._debug) {
      console.debug('Setup intermediate decoding');
    }

    let runningTranscript = '';
    const interimTimer = setInterval(() => {
      const transcript = sttStream.intermediateDecode();

      if (this._debug) {
        console.debug('interim:', transcript);
      }

      if (runningTranscript !== transcript) {
        runningTranscript = transcript;
        silenceCount = 0;
      } else if (++silenceCount >= 3) {
        this.pauseMicrophone();
      }
    }, 1000);

    const dataHandler = (data) => {
      sttStream.feedAudioContent(data);
    };

    micStream.once('pauseComplete', () => {
      clearInterval(interimTimer);

      if (!this._enabled) {
        return;
      }

      if (this._debug) {
        console.debug('Microphone stopped, waiting for transcript');
      }

      micStream.removeListener('data', dataHandler);

      const transcript = sttStream.finishStream().trim();
      if (!transcript) {
        if (this._debug) {
          console.debug('Transcript was empty');
        }

        if (this._state === STATE.LISTENING_FOR_COMMAND) {
          this.playSound('no-input');
          this._state = STATE.LISTENING_FOR_WAKE_WORD;
        }

        this.resumeMicrophone();
        return;
      }

      if (this._debug) {
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

    if (this._debug) {
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
    if (this._debug) {
      console.debug('Pausing microphone');
    }

    if (this._mic) {
      this._mic.pause();
    }
  }

  stopMicrophone() {
    if (this._debug) {
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
