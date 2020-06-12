# voice-addon

A voice add-on for the
[Mozilla WebThings Gateway](https://github.com/mozilla/DeepSpeech) which uses
[DeepSpeech](https://github.com/mozilla/DeepSpeech) as the speech-to-text (STT)
engine.

The add-on uses a USB microphone attached to the Raspberry Pi. Currently, the
add-on always listens in the background for new commands, as there is no wake
word. This is a work in progress.

## Requirements

* On Linux, `arecord` is required, typically provided by the `alsa-utils`
  package.
* On macOS, `sox` is required.

## Usage

* Open up the gateway's UI in a browser.
* Navigate to _Settings -> Add-ons_.
* Click _Configure_ on _Voice Addon_ and follow the instructions to get a token.
* Speak commands into the microphone attached to your Raspberry Pi.

## Sample Commands

TODO

## Credits

This add-on was originally created by André Natal (@andrenatal).
