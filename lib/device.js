'use strict';

const {Device} = require('gateway-addon');
const VoiceProperty = require('./property');

class VoiceDevice extends Device {
  constructor(adapter, sttInterface) {
    super(adapter, 'voice-controller');

    this._sttInterface = sttInterface;
    this.name = 'Voice Controller';
    this.description = 'Voice Controller';
    this['@type'] = ['OnOffSwitch'];

    this.properties.set(
      'on',
      new VoiceProperty(
        this,
        'on',
        {
          '@type': 'OnOffProperty',
          title: 'On/Off',
          type: 'boolean',
        },
        true
      )
    );

    this.addEvent(
      'wakeword',
      {
        description: 'A wakeword was deteced',
        type: 'string',
      }
    );

    this.addEvent(
      'speechinput',
      {
        description: 'A voice command was detected',
        type: 'string',
      }
    );

    this.addEvent(
      'command',
      {
        description: 'A web thing command was executed',
        type: 'string',
      }
    );
  }

  toggle(value) {
    if (value) {
      this._sttInterface.enable();
    } else {
      this._sttInterface.disable();
    }
  }
}

module.exports = VoiceDevice;
