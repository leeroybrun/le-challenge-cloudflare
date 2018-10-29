const util = require('util');
const dns = require('dns');
const resolveRecord = require('dns-over-https');

const resolveTxt = util.promisify(dns.resolveTxt);

/**
 * Returns an array of all TXT records for the specified domain.
 * @param {string} fqdn - The domain to lookup.
 * @param {boolean} useDNSOverHTTPS - If `true` use the Gooogle Public DNS API
 *  (DNS-Over-HTTPS) instead of the native DNS module. Usefule when you're
 *  sitting behind an HTTP/S proxy.
 * @return {string[]} - The TXT records for the specified domain.
 * @throws {Error} throw when the lookup fails.
 * @private
 */
module.exports = async (fqdn, useDNSOverHTTPS = false) => {
  if (useDNSOverHTTPS) {
    const response = await resolveRecord(fqdn, 'TXT');
    if (!response.Answer) throw new Error(`Received no answer for '${fqdn}'.`);
    return response.Answer.map(r => r.data.slice(1, -1));
  }

  const records = await resolveTxt(fqdn);
  return records.map(r => r.join(' '));
};
