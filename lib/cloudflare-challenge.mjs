import crypto from 'crypto';
import Cloudflare from 'cloudflare';
import util from 'util';
import consumePages from './consume-pages';
import delay from './delay';
import resolveTxt from './resolve-txt';

const debug = util.debuglog('le-challenge-cloudflare');

export default class CloudflareChallenge {
  static create(options) {
    return new this(options);
  }

  constructor({
    cloudflare = {},
    acmePrefix = '_acme-challenge',
    waitForPropagation = 10 * 1000
  }) {
    debug('Creating new CloudflareChallenge instance:', {
      acmePrefix,
      waitForPropagation,
      cloudflare
    });

    this.cloudflare =
      cloudflare instanceof Cloudflare
        ? cloudflare
        : new Cloudflare(cloudflare);
    this.acmePrefix = acmePrefix;
    this.waitForPropagation = waitForPropagation;
  }

  getOptions() {
    return {
      acmePrefix: this.acmePrefix,
      waitForPropagation: this.waitForPropagation
    };
  }

  async set(
    { acmePrefix, waitForPropagation },
    domain,
    challenge,
    keyAuthorization,
    done
  ) {
    try {
      debug(`Trying to set ACME challenge for '${domain}'.`);

      const auth = CloudflareChallenge.getAuthContent(keyAuthorization);
      const fqdn = CloudflareChallenge.getFQDN(domain, acmePrefix);

      const zone = await this.getZoneForDomain(domain);
      if (!zone) throw new Error(`Could not find a zone for '${domain}'.`);

      const record = await this.getTxtRecord(zone, fqdn);
      if (record) {
        debug(
          `Found an existing TXT record for '${fqdn}'. Attempting to update it.`
        );
        await this.cloudflare.dnsRecords.edit(
          zone.id,
          record.id,
          Object.assign({}, record, { content: auth })
        );
      } else {
        debug(
          `Found no pre-existing TXT record for '${fqdn}'. Attempting to create a new one.`
        );
        await this.cloudflare.dnsRecords.add(zone.id, {
          type: 'TXT',
          name: fqdn,
          content: auth
        });
      }

      debug(`Waiting ${waitForPropagation} ms for changes to propagate.`);
      await delay(waitForPropagation);

      debug(`Done waiting.`);
      done(null);
    } catch (error) {
      debug(error);
      done(error);
    }
  }

  // get(defaults, domain, key, done) {}

  async remove({ acmePrefix }, domain, challenge, done) {
    try {
      debug(`Trying to remove ACME challenge for '${domain}'.`);

      const zone = await this.getZoneForDomain(domain);
      if (!zone) throw new Error(`Could not find a zone for '${domain}'.`);

      const fqdn = CloudflareChallenge.getFQDN(domain, acmePrefix);
      const record = await this.getTxtRecord(zone, fqdn);
      if (!record)
        throw new Error(`Could not find a TXT record for '${fqdn}'.`);

      await this.cloudflare.dnsRecords.del(zone.id, record.id);

      debug(`Sucessfully removed ACME challenge for '${domain}'.`);
      done(null);
    } catch (error) {
      debug(error);
      done(error);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async loopback(...args) {
    return CloudflareChallenge.loopback(...args);
  }

  static async loopback({ acmePrefix }, domain, challenge, done) {
    try {
      const fqdn = CloudflareChallenge.getFQDN(domain, acmePrefix);
      const records = await resolveTxt(fqdn);

      if (!records.length) throw new Error(`Could not verify '${domain}'.`);

      done(null, records);
    } catch (error) {
      done(error, null);
    }
  }

  static getFQDN(domain, acmePrefix) {
    return `${acmePrefix}.${domain}`;
  }

  static getAuthContent(keyAuthorization) {
    if (typeof keyAuthorization !== 'string')
      throw new TypeError('Expected keyAuthorization to be a string.');

    return crypto
      .createHash('sha256')
      .update(keyAuthorization)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  async getZoneForDomain(domain) {
    for await (const zone of consumePages(pagination =>
      this.cloudflare.zones.browse(pagination)
    ))
      if (domain.endsWith(zone.name)) return zone;

    return null;
  }

  async getTxtRecord(zone, fqdn) {
    for await (const txtRecord of consumePages(pagination =>
      this.cloudflare.dnsRecords.browse(zone.id, { ...pagination, type: 'TXT' })
    ))
      if (txtRecord.name === fqdn) return txtRecord;

    return null;
  }
}
