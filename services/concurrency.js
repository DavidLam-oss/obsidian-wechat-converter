export const sleep = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));

/**
 * @template T
 * @template R
 * @param {T[]} array
 * @param {(item: T) => Promise<R> | R} mapper
 * @param {number} [concurrency]
 * @returns {Promise<R[]>}
 */
export async function pMap(array, mapper, concurrency = 3) {
  /** @type {Promise<R>[]} */
  const results = [];
  /** @type {Promise<void>[]} */
  const executing = [];
  let isFailed = false;
  for (const item of array) {
    if (isFailed) break;
    const p = Promise.resolve().then(() => mapper(item));
    results.push(p);
    const e = p.catch(() => { isFailed = true; }).then(() => {
      executing.splice(executing.indexOf(e), 1);
    });
    executing.push(e);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}
