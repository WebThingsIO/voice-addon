# voice-addon

A voice add-on for the
[Mozilla WebThings Gateway](https://github.com/mozilla/DeepSpeech) which uses
[DeepSpeech](https://github.com/mozilla/DeepSpeech) as the speech-to-text (STT)
engine.

The add-on uses a microphone attached to the gateway host.

## Requirements

* On Linux, `arecord` is required, typically provided by the `alsa-utils`
  package.
    * If you're using a
      [MATRIX Voice board](https://www.matrix.one/products/voice) with a
      Raspberry Pi, you'll also need to install the MATRIX HAL packages,
      according to
      [these instructions](https://matrix-io.github.io/matrix-documentation/matrix-hal/getting-started/installation-package/).
* On macOS, `sox` is required.

## Usage

* Open up the gateway's UI in a browser.
* Navigate to _Settings -> Add-ons_.
* Click _Configure_ on _Voice Addon_ and follow the instructions to get a token.
* Speak commands into the microphone attached to your Raspberry Pi.

## Supported Commands

**NOTE:** &lt;tag&gt; refers to the device name.

* turn the **&lt;tag&gt;** light **&lt;on|off&gt;**
* turn **&lt;tag&gt;** **&lt;on|off&gt;**
* turn **&lt;on|off&gt;** the **&lt;tag&gt;** light
* turn **&lt;on|off&gt;** **&lt;tag&gt;**
* shut the **&lt;tag&gt;** light off
* shut **&lt;tag&gt;** off
* switch the **&lt;tag&gt;** light **&lt;on|off&gt;**
* switch **&lt;tag&gt;** **&lt;on|off&gt;**
* switch **&lt;on|off&gt;** the **&lt;tag&gt;** light
* switch **&lt;on|off&gt;** **&lt;tag&gt;**
* make the **&lt;tag&gt;** light **&lt;cooler|warmer&gt;**
* make **&lt;tag&gt;** **&lt;cooler|warmer&gt;**
* set the **&lt;tag&gt;** light to **&lt;color temperature number&gt;** kelvin
* set **&lt;tag&gt;** to **&lt;color temperature number&gt;** kelvin
* set the **&lt;tag&gt;** light to **&lt;color temperature&gt;**
* set **&lt;tag&gt;** to **&lt;color temperature&gt;**
* change the **&lt;tag&gt;** light to **&lt;color temperature&gt;**
* change **&lt;tag&gt;** to **&lt;color temperature&gt;**
* make the **&lt;tag&gt;** light **&lt;brighter|dimmer&gt;**
* make **&lt;tag&gt;** **&lt;brighter|dimmer&gt;**
* **&lt;brighten|dim&gt;** the **&lt;tag&gt;** light
* **&lt;brighten|dim&gt;** **&lt;tag&gt;**
* set the **&lt;tag&gt;** light to **&lt;percentage number&gt;** percent
* set **&lt;tag&gt;** to **&lt;percentage number&gt;** percent
* change the **&lt;tag&gt;** light to **&lt;percentage number&gt;** percent
* change **&lt;tag&gt;** to **&lt;percentage number&gt;** percent
* turn the **&lt;tag&gt;** light **&lt;color&gt;**
* turn **&lt;tag&gt;** **&lt;color&gt;**
* make the **&lt;tag&gt;** light **&lt;color&gt;**
* make **&lt;tag&gt;** **&lt;color&gt;**
* set the **&lt;tag&gt;** light to **&lt;color&gt;**
* set **&lt;tag&gt;** to **&lt;color&gt;**
* change the **&lt;tag&gt;** light to **&lt;color&gt;**
* change **&lt;tag&gt;** to **&lt;color&gt;**
* is **&lt;tag&gt;** **&lt;boolean&gt;**
* is **&lt;tag&gt;** not **&lt;boolean&gt;**

## Credits

This add-on was originally created by André Natal (@andrenatal). DeepSpeech
support was initially added by Alexandre Lissy (@lissyx).
