'use strict';

const _GRAMMAR_TEMPLATE = [
  // on/off
  'turn the <tag> light <on|off>',
  'turn <tag> <on|off>',
  'shut the <tag> light <on|off>',
  'shut <tag> <on|off>',
  'switch the <tag> light <on|off>',
  'switch <tag> <on|off>',

  // color temp
  'make the <tag> light <cooler|warmer>',
  'make <tag> <cooler|warmer>',
  'set the <tag> light to <color temperature number> kelvin',
  'set <tag> to <color temperature number> kelvin',
  'set the <tag> light to <color temperature>',
  'set <tag> to <color temperature>',
  'change the <tag> light to <color temperature>',
  'change <tag> to <color temperature>',

  // brightness
  'make the <tag> light <brighter|dimmer>',
  'make <tag> <brighter|dimmer>',
  '<brighten|dim> the <tag> light',
  '<brighten|dim> <tag>',
  'set the <tag> light to <percentage number> percent',
  'set <tag> to <percentage number> percent',
  'change the <tag> light to <percentage number> percent',
  'change <tag> to <percentage number> percent',

  // color
  'make the <tag> light <color>',
  'make <tag> <color>',
  'set the <tag> light to <color>',
  'set <tag> to <color>',
  'change the <tag> light to <color>',
  'change <tag> to <color>',

  // booleans
  'when was <tag> last <boolean>',
  'is <tag> <boolean>',
  'is <tag> not <boolean>',
];

const _ON_OFF = {
  on: true,
  off: true,
};

const _PERCENTAGE_NUMBER = {
  'zero': 0,
  'one': 1,
  'two': 2,
  'three': 3,
  'four': 4,
  'five': 5,
  'six': 6,
  'seven': 7,
  'eight': 8,
  'nine': 9,

  'ten': 10,
  'eleven': 11,
  'twelve': 12,
  'thirteen': 13,
  'fourteen': 14,
  'fifteen': 15,
  'sixteen': 16,
  'seventeen': 17,
  'eighteen': 18,
  'nineteen': 19,

  'twenty': 20,
  'twenty one': 21,
  'twenty two': 22,
  'twenty three': 23,
  'twenty four': 24,
  'twenty five': 25,
  'twenty six': 26,
  'twenty seven': 27,
  'twenty eight': 28,
  'twenty nine': 29,

  'thirty': 30,
  'thirty one': 31,
  'thirty two': 32,
  'thirty three': 33,
  'thirty four': 34,
  'thirty five': 35,
  'thirty six': 36,
  'thirty seven': 37,
  'thirty eight': 38,
  'thirty nine': 39,

  'forty': 40,
  'forty one': 41,
  'forty two': 42,
  'forty three': 43,
  'forty four': 44,
  'forty five': 45,
  'forty six': 46,
  'forty seven': 47,
  'forty eight': 48,
  'forty nine': 49,

  'fifty': 50,
  'fifty one': 51,
  'fifty two': 52,
  'fifty three': 53,
  'fifty four': 54,
  'fifty five': 55,
  'fifty six': 56,
  'fifty seven': 57,
  'fifty eight': 58,
  'fifty nine': 59,

  'sixty': 60,
  'sixty one': 61,
  'sixty two': 62,
  'sixty three': 63,
  'sixty four': 64,
  'sixty five': 65,
  'sixty six': 66,
  'sixty seven': 67,
  'sixty eight': 68,
  'sixty nine': 69,

  'seventy': 70,
  'seventy one': 71,
  'seventy two': 72,
  'seventy three': 73,
  'seventy four': 74,
  'seventy five': 75,
  'seventy six': 76,
  'seventy seven': 77,
  'seventy eight': 78,
  'seventy nine': 79,

  'eighty': 80,
  'eighty one': 81,
  'eighty two': 82,
  'eighty three': 83,
  'eighty four': 84,
  'eighty five': 85,
  'eighty six': 86,
  'eighty seven': 87,
  'eighty eight': 88,
  'eighty nine': 89,

  'ninety': 90,
  'ninety one': 91,
  'ninety two': 92,
  'ninety three': 93,
  'ninety four': 94,
  'ninety five': 95,
  'ninety six': 96,
  'ninety seven': 97,
  'ninety eight': 98,
  'ninety nine': 99,

  'one hundred': 100,
};

const _COLOR_TEMPERATURE_NUMBER = {
  'seventeen hundred': 1700,
  'one thousand seven hundred': 1700,

  'two thousand': 2000,
  'two thousand one hundred': 2100,
  'twenty one hundred': 2100,
  'two thousand two hundred': 2200,
  'twenty two hundred': 2200,
  'two thousand three hundred': 2300,
  'twenty three hundred': 2300,
  'two thousand four hundred': 2400,
  'twenty four hundred': 2400,
  'two thousand five hundred': 2500,
  'twenty five hundred': 2500,
  'two thousand six hundred': 2600,
  'twenty six hundred': 2600,
  'two thousand seven hundred': 2700,
  'twenty seven hundred': 2700,
  'two thousand eight hundred': 2800,
  'twenty eight hundred': 2800,
  'two thousand nine hundred': 2900,
  'twenty nine hundred': 2900,

  'three thousand': 3000,
  'three thousand one hundred': 3100,
  'thirty one hundred': 3100,
  'three thousand two hundred': 3200,
  'thirty two hundred': 3200,
  'three thousand three hundred': 3300,
  'thirty three hundred': 3300,
  'three thousand four hundred': 3400,
  'thirty four hundred': 3400,
  'three thousand five hundred': 3500,
  'thirty five hundred': 3500,
  'three thousand six hundred': 3600,
  'thirty six hundred': 3600,
  'three thousand seven hundred': 3700,
  'thirty seven hundred': 3700,
  'three thousand eight hundred': 3800,
  'thirty eight hundred': 3800,
  'three thousand nine hundred': 3900,
  'thirty nine hundred': 3900,

  'four thousand': 4000,
  'four thousand one hundred': 4100,
  'forty one hundred': 4100,
  'four thousand two hundred': 4200,
  'forty two hundred': 4200,
  'four thousand three hundred': 4300,
  'forty three hundred': 4300,
  'four thousand four hundred': 4400,
  'forty four hundred': 4400,
  'four thousand five hundred': 4500,
  'forty five hundred': 4500,
  'four thousand six hundred': 4600,
  'forty six hundred': 4600,
  'four thousand seven hundred': 4700,
  'forty seven hundred': 4700,
  'four thousand eight hundred': 4800,
  'forty eight hundred': 4800,
  'four thousand nine hundred': 4900,
  'forty nine hundred': 4900,

  'five thousand': 5000,
  'five thousand one hundred': 5100,
  'fifty one hundred': 5100,
  'five thousand two hundred': 5200,
  'fifty two hundred': 5200,
  'five thousand three hundred': 5300,
  'fifty three hundred': 5300,
  'five thousand four hundred': 5400,
  'fifty four hundred': 5400,
  'five thousand five hundred': 5500,
  'fifty five hundred': 5500,
  'five thousand six hundred': 5600,
  'fifty six hundred': 5600,
  'five thousand seven hundred': 5700,
  'fifty seven hundred': 5700,
  'five thousand eight hundred': 5800,
  'fifty eight hundred': 5800,
  'five thousand nine hundred': 5900,
  'fifty nine hundred': 5900,

  'six thousand': 6000,
  'six thousand one hundred': 6100,
  'sixty one hundred': 6100,
  'six thousand two hundred': 6200,
  'sixty two hundred': 6200,
  'six thousand three hundred': 6300,
  'sixty three hundred': 6300,
  'six thousand four hundred': 6400,
  'sixty four hundred': 6400,
  'six thousand five hundred': 6500,
  'sixty five hundred': 6500,
};

const _COOLER_WARMER = {
  cooler: 300,
  warmer: -300,
};

const _COLOR_TEMPERATURE = {
  'soft white': 2700,
  'warm white': 3000,
  'cool white': 5000,
  daylight: 6500,
};

const _COLOR = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
  orange: '#ffa500',
  'alice blue': '#f0f8ff',
  'antique white': '#faebd7',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  'blanched almond': '#ffebcd',
  'blue violet': '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  'cadet blue': '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  'cornflower blue': '#6495ed',
  'corn silk': '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  'dark blue': '#00008b',
  'dark cyan': '#008b8b',
  'dark goldenrod': '#b8860b',
  'dark gray': '#a9a9a9',
  'dark green': '#006400',
  'dark grey': '#a9a9a9',
  'dark khaki': '#bdb76b',
  'dark magenta': '#8b008b',
  'dark olive green': '#556b2f',
  'dark orange': '#ff8c00',
  'dark orchid': '#9932cc',
  'dark red': '#8b0000',
  'dark salmon': '#e9967a',
  'dark seagreen': '#8fbc8f',
  'dark slate blue': '#483d8b',
  'dark slate gray': '#2f4f4f',
  'dark slate grey': '#2f4f4f',
  'dark turquoise': '#00ced1',
  'dark violet': '#9400d3',
  'deep pink': '#ff1493',
  'deep sky blue': '#00bfff',
  'dim gray': '#696969',
  'dim grey': '#696969',
  'dodger blue': '#1e90ff',
  firebrick: '#b22222',
  'floral white': '#fffaf0',
  'forest green': '#228b22',
  gainsboro: '#dcdcdc',
  'ghost white': '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  'green yellow': '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  'hot pink': '#ff69b4',
  'indian red': '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  'lavender blush': '#fff0f5',
  'lawn green': '#7cfc00',
  'lemon chiffon': '#fffacd',
  'light blue': '#add8e6',
  'light coral': '#f08080',
  'light cyan': '#e0ffff',
  'light goldenrod yellow': '#fafad2',
  'light gray': '#d3d3d3',
  'light green': '#90ee90',
  'light grey': '#d3d3d3',
  'light pink': '#ffb6c1',
  'light salmon': '#ffa07a',
  'light sea green': '#20b2aa',
  'light sky blue': '#87cefa',
  'light slate gray': '#778899',
  'light slate grey': '#778899',
  'light steel blue': '#b0c4de',
  'light yellow': '#ffffe0',
  'lime green': '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  'medium aquamarine': '#66cdaa',
  'medium blue': '#0000cd',
  'medium orchid': '#ba55d3',
  'medium purple': '#9370db',
  'medium sea green': '#3cb371',
  'medium slate blue': '#7b68ee',
  'medium spring green': '#00fa9a',
  'medium turquoise': '#48d1cc',
  'medium violet red': '#c71585',
  'midnight blue': '#191970',
  'mint cream': '#f5fffa',
  'misty rose': '#ffe4e1',
  moccasin: '#ffe4b5',
  'navajo white': '#ffdead',
  'old lace': '#fdf5e6',
  'olive drab': '#6b8e23',
  'orange red': '#ff4500',
  orchid: '#da70d6',
  'pale goldenrod': '#eee8aa',
  'pale green': '#98fb98',
  'pale turquoise': '#afeeee',
  'pale violet red': '#db7093',
  'papaya whip': '#ffefd5',
  'peach puff': '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  'powder blue': '#b0e0e6',
  'rosy brown': '#bc8f8f',
  'royal blue': '#4169e1',
  'saddle brown': '#8b4513',
  salmon: '#fa8072',
  'sandy brown': '#f4a460',
  'sea green': '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  'sky blue': '#87ceeb',
  'slate blue': '#6a5acd',
  'slate gray': '#708090',
  'slate grey': '#708090',
  snow: '#fffafa',
  'spring green': '#00ff7f',
  'steel blue': '#4682b4',
  tan: '#d2b48c',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  'white smoke': '#f5f5f5',
  'yellow green': '#9acd32',
  'rebecca purple': '#663399',
};

const _BRIGHTER_DIMMER = {
  brighter: 10,
  dimmer: -10,
};

const _BRIGHTEN_DIM = {
  brighten: 10,
  dim: -10,
};

const _BOOLEAN = {
  // generic
  true: true,
  false: false,

  // AlarmProperty, BooleanProperty
  active: true,
  inactive: false,

  // LeakProperty
  leaking: true,
  dry: false,

  // MotionProperty
  motion: true,
  'no motion': false,

  // OpenProperty
  open: true,
  closed: false,

  // PushedProperty
  pushed: true,
  'not pushed': false,
};

function flatten(arr, result = []) {
  for (let i = 0, length = arr.length; i < length; i++) {
    const value = arr[i];
    if (Array.isArray(value)) {
      flatten(value, result);
    } else {
      result.push(value);
    }
  }
  return result;
}

function transform(arr, f) {
  return Array.from(
    new Set(
      flatten(
        arr.map(f)
      )
    )
  );
}

function buildGrammar() {
  let grammar = _GRAMMAR_TEMPLATE;

  grammar = transform(grammar, (g) => {
    return Object.keys(_ON_OFF)
      .map((x) => g.replace(/<on\|off>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_PERCENTAGE_NUMBER)
      .map((x) => g.replace(/<percentage number>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_COLOR_TEMPERATURE_NUMBER)
      .map((x) => g.replace(/<color temperature number>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_COOLER_WARMER)
      .map((x) => g.replace(/<cooler\|warmer>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_COLOR_TEMPERATURE)
      .map((x) => g.replace(/<color temperature>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_COLOR)
      .map((x) => g.replace(/<color>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_BRIGHTER_DIMMER)
      .map((x) => g.replace(/<brighter\|dimmer>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_BRIGHTEN_DIM)
      .map((x) => g.replace(/<brighten\|dim>/g, x));
  });

  grammar = transform(grammar, (g) => {
    return Object.keys(_BOOLEAN)
      .map((x) => g.replace(/<boolean>/g, x));
  });

  return grammar;
}

module.exports = {
  GRAMMAR: buildGrammar(),
};
