/**
 * Minimal logger used by the Handlebars environment.
 */
const logger = {
  methodMap: ['debug', 'info', 'warn', 'error'],
  level: 'info',

  /**
   * Maps a logger level name or number to an index in `methodMap`.
   *
   * @param {string | number} level
   * @returns {number}
   */
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

  /**
   * Emits a log message if the configured logger level allows it.
   *
   * @param {string | number} level
   * @param {...unknown} message
   * @returns {void}
   */
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
