import util from 'util';
import dns from 'dns';
import resolveRecord from 'dns-over-https';

const resolveTxt = util.promisify(dns.resolveTxt);

export default async (fqdn, useDNSOverHTTPS) => {
  if (useDNSOverHTTPS) {
    const response = await resolveRecord(fqdn, 'TXT');
    if (!response.Answer) throw new Error(`Received no answer for '${fqdn}'.`);
    return response.Answer.map(r => r.data.slice(1, -1));
  }

  const records = await resolveTxt(fqdn);
  return records.map(r => r.join(' '));
};
