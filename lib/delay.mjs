/**
 * Returns a `Promise` that resolves after `ms` milliseconds.
 * @param {number} ms - the time (in ms) to wait before resolving the `Promise`
 * @return {Promise}
 * @private
 */
export default ms => new Promise(resolve => setTimeout(resolve, ms));
