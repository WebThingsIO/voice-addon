'use strict';

const {Property} = require('gateway-addon');

class VoiceProperty extends Property {
  constructor(device, name, description, value) {
    super(device, name, description);
    this.setCachedValue(value);
  }

  setValue(value) {
    if (this.name !== 'on') {
      return;
    }

    return new Promise((resolve) => {
      value = this.setOn(value);
      this.setCachedValueAndNotify(value);
      resolve(this.value);
    });
  }

  setOn(value) {
    value = !!value;
    this.device.toggle(value);
    return value;
  }
}

module.exports = VoiceProperty;
