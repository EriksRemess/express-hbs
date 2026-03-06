const logger = {
  methodMap: ['debug', 'info', 'warn', 'error'],
  level: 'info',

  // Maps a given level value to the `methodMap` indexes above.
  lookupLevel(level) {
    if (typeof level === 'string') {
      const levelMap = logger.methodMap.indexOf(level.toLowerCase());
      if (levelMap >= 0) {
        level = levelMap;
      } else {
        level = Number.parseInt(level, 10);
      }
    }

    return level;
  },

  // Can be overridden in the host environment
  log(level, ...message) {
    level = logger.lookupLevel(level);

    if (
      typeof console !== 'undefined' &&
      logger.lookupLevel(logger.level) <= level
    ) {
      let method = logger.methodMap[level];
      if (!console[method]) {
        method = 'log';
      }
      console[method](...message);
    }
  }
};

export default logger;
