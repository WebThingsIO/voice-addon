'use strict';

const {Device} = require('gateway-addon');
const VoiceProperty = require('./property');

class VoiceDevice extends Device {
  constructor(adapter) {
    super(adapter, 'voice-controller');
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

    this.properties.set(
      'inputVolume',
      new VoiceProperty(
        this,
        'inputVolume',
        {
          '@type': 'LevelProperty',
          title: 'Microphone Volume',
          minimum: 0,
          maximum: 100,
          type: 'integer',
          unit: 'percent',
        },
        0
      )
    );

    this.properties.set(
      'outputVolume',
      new VoiceProperty(
        this,
        'outputVolume',
        {
          '@type': 'LevelProperty',
          title: 'Speaker Volume',
          minimum: 0,
          maximum: 100,
          type: 'integer',
          unit: 'percent',
        },
        0
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
}

module.exports = VoiceDevice;
