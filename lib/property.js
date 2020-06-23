'use strict';

const {Property} = require('gateway-addon');

class VoiceProperty extends Property {
  constructor(device, name, description, value) {
    super(device, name, description);
    this.setCachedValue(value);
  }

  setValue(value) {
    switch (this.name) {
      case 'on':
        value = this.setOn(value);
        break;
      case 'inputVolume':
        value = this.setInputVolume(value);
        break;
      case 'outputVolume':
        value = this.setOutputVolume(value);
        break;
    }

    return new Promise((resolve) => {
      this.setCachedValueAndNotify(value);
      resolve(this.value);
    });
  }

  setOn(value) {
    value = !!value;
    // TODO
    return value;
  }

  setInputVolume(value) {
    value = Math.max(Math.min(Math.round(value), this.maximum), this.minimum);
    // TODO
    return value;
  }

  setOutputVolume(value) {
    value = Math.max(Math.min(Math.round(value), this.maximum), this.minimum);
    // TODO
    return value;
  }
}

module.exports = VoiceProperty;
