import util from 'util';
import dns from 'dns';

export default util.promisify(dns.resolveTxt);
