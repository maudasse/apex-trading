'use strict';

import TimeoutError from '../clients/timeoutError';

/**
 * Creates a promise that can be used as a handle. It will not raise errors when rejected until it is explicitly
 * awaited or catch is set. The promise additionally has following methods:
 * - `resolve(value)` resolves the promise with specified value
 * - `reject(error)` rejects the promise with specified error
 * - `timeout(milliseconds, errorMessage)` adds a timeout to reject the promise with `TimeoutError`
 * @return {Promise} Modified handle promise
 */
export function createHandlePromise() {
  let resolve, reject;
  let promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.resolve = (result) => {
    if (promise.completed) {
      return;
    }
    promise.resolved = true;
    promise.completed = true;
    resolve(result);
  };
  promise.reject = (err) => {
    if (promise.completed) {
      return;
    }
    promise.rejected = true;
    promise.completed = true;
    reject(err);
  };
  promise.timeout = (milliseconds, errorMessage) => {
    if (promise.completed) {
      return;
    }
    let timeout = setTimeout(() => promise.reject(new TimeoutError(errorMessage)), milliseconds);
    promise.finally(() => clearTimeout(timeout)).catch(() => {});
    return promise;
  };
  promise.catch(() => {});
  return promise;
}

/**
 * Waits specified delay
 * @param {Number} ms Milliseconds to wait
 * @return {Promise} Promise resolving when the delay has ended
 */
export function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Assembles log4js config from logging level map
 * @param {Object} [config] log4js config
 * @param {String} [config.defaultLevel = 'INFO'] Default logging level
 * @param {Object} [config.levels] Logging levels
 * @return {Object} Log4js config
 */
export function assembleLog4jsConfig(config = {}) {
  let appenders = {console: {type: 'console'}};
  let categories = {
    default: {
      appenders: Object.keys(appenders),
      level: config.defaultLevel || 'INFO'
    }
  };
  Object.keys(config.levels || {}).forEach((category) => {
    categories[category] = {
      appenders: Object.keys(appenders),
      level: config.levels[category]
    };
  });
  return {appenders, categories};
}
