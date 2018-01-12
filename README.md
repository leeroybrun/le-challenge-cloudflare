# @ddg-gmbh/le-challenge-cloudflare

[`greenlock`](https://www.npmjs.com/package/greenlock) [ACME `dns-01`](https://tools.ietf.org/html/draft-ietf-acme-acme#section-8.5) challenge for [Cloudflare](https://www.cloudflare.com/).

## Prior Art

- [certbot-dns-cloudflare](https://github.com/certbot/certbot/tree/master/certbot-dns-cloudflare): The official certbot reference implementation by the EFF
- [llun/le-challenge-cloudflare](https://github.com/llun/le-challenge-cloudflare)

## Usage

```js
import Greenlock from 'greenlock';
import LEStoreCertbot from 'le-store-certbot';
import LEChallengeCloudflare from '@ddg-gmbh/le-challenge-cloudflare';

const store = LEStoreCertbot.create();

const DNSChallenge = new LEChallengeCloudflare({
  cloudflare: {
    email: process.env.cloudflare_email,
    key: process.env.cloudflare_api_key,
  },
  acmePrefix: '_acme-challenge', // default
  verifyPropagation: { waitFor: 5000, retries: 20 }, // default
  useDNSOverHTTPS: false // default
});

const greenlock = Greenlock.create({
  server: Greenlock.stagingServerUrl,
  store,
  challenges: { 'dns-01': DNSChallenge },
  challengeType: 'dns-01'
});

greenlock.register({
  domains: ['example.com'],
  email: 'admin@example.com',
  agreeTos: true,
  rsaKeySize: 2048
});
```
