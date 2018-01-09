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
    verifyPropagation = { waitFor: 5000, retries: 20 },
    useDNSOverHTTPS = false
  }) {
    debug('Creating new CloudflareChallenge instance:', {
      acmePrefix,
      verifyPropagation,
      useDNSOverHTTPS,
      cloudflare
    });

    this.cloudflare =
      cloudflare instanceof Cloudflare
        ? cloudflare
        : new Cloudflare(cloudflare);
    this.acmePrefix = acmePrefix;
    this.verifyPropagation = verifyPropagation;
    this.useDNSOverHTTPS = useDNSOverHTTPS;
  }

  getOptions() {
    return {
      acmePrefix: this.acmePrefix,
      verifyPropagation: this.verifyPropagation,
      useDNSOverHTTPS: this.useDNSOverHTTPS
    };
  }

  async set(
    { acmePrefix, useDNSOverHTTPS, verifyPropagation },
    domain,
    challenge,
    keyAuthorization,
    done
  ) {
    try {
      debug(`Trying to set ACME challenge for '${domain}'.`);

      const authContent = CloudflareChallenge.getAuthContent(keyAuthorization);
      const fqdn = CloudflareChallenge.getFQDN(domain, acmePrefix);

      const zone = await this.getZoneForDomain(domain);
      if (!zone) throw new Error(`Could not find a zone for '${domain}'.`);

      const records = await this.getTxtRecords(zone, fqdn);

      switch (records.length) {
        default:
          debug(
            `Found ${
              records.length
            } existing records. Deleting all but first one.`
          );
          for (const record of records.slice(1))
            await this.cloudflare.dnsRecords.del(zone.id, record.id);
        // eslint-disable-next-line no-fallthrough
        case 1:
          debug(
            `Updating existing TXT record for '${fqdn}' with '${authContent}'.`
          );
          await this.cloudflare.dnsRecords.edit(
            zone.id,
            records[0].id,
            Object.assign({}, records[0], { content: authContent, ttl: 120 })
          );
          break;
        case 0:
          debug(
            `Found no pre-existing TXT record for '${fqdn}'. Attempting to create a new one with '${authContent}'.`
          );
          await this.cloudflare.dnsRecords.add(zone.id, {
            type: 'TXT',
            name: fqdn,
            content: authContent,
            ttl: 120
          });
      }

      if (verifyPropagation)
        await CloudflareChallenge.verifyPropagation(
          { acmePrefix, useDNSOverHTTPS, verifyPropagation, authContent },
          domain,
          challenge
        );

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
      const records = await this.getTxtRecords(zone, fqdn);
      if (!records.length)
        throw new Error(`Could not find a TXT record for '${fqdn}'.`);

      for (const record of records)
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

  static async loopback(
    { acmePrefix, useDNSOverHTTPS, authContent },
    domain,
    challenge,
    done
  ) {
    try {
      const fqdn = CloudflareChallenge.getFQDN(domain, acmePrefix);
      debug(
        `Testing TXT record existence for '${fqdn}' using ${
          useDNSOverHTTPS ? 'DNS over HTTPS' : 'native DNS'
        }.`
      );

      const records = await resolveTxt(fqdn, useDNSOverHTTPS);
      debug(`Found these TXT records for ${fqdn}:`, records);

      if (authContent) {
        debug(`Verifying presence of ${authContent}`);
        if (!records.includes(authContent))
          throw new Error(`Could not verify '${domain}'.`);
      }

      if (typeof done === 'function') done(null, records);
    } catch (error) {
      if (typeof done === 'function') done(error, null);
      else throw error;
    }
  }

  static async verifyPropagation(
    { verifyPropagation, ...options },
    domain,
    challenge,
    waitFor = verifyPropagation.waitFor,
    retries = verifyPropagation.retries
  ) {
    debug(`Awaiting propagation of TXT record for '${domain}'.`);
    for (let i = 0; i <= retries; i++) {
      try {
        await CloudflareChallenge.loopback(options, domain, challenge);
        debug(`Successfully propagated challenge for '${domain}'.`);
        return;
      } catch (error) {
        debug(error);
        debug(
          `Waiting for ${waitFor} ms before attempting retry ${i +
            1} / ${retries}.`
        );
        await delay(waitFor);
      }
    }
    throw new Error(`Could not verify challenge for '${domain}'.`);
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

  async getTxtRecords(zone, name) {
    const records = [];

    for await (const txtRecord of consumePages(pagination =>
      this.cloudflare.dnsRecords.browse(zone.id, {
        ...pagination,
        type: 'TXT',
        name
      })
    ))
      if (txtRecord.name === name) records.push(txtRecord);

    return records;
  }
}
