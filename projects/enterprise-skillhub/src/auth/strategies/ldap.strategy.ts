// LDAP Strategy — Thin wrapper around ldapjs for AD authentication.
// The actual LDAP logic lives in AuthService.login() for testability.
// This file provides the LDAP client factory.

import { ConfigService } from '../../config/config.service';

export interface LdapClientOptions {
  url: string;
  bindDn: string;
  bindPassword: string;
  searchBase: string;
  searchFilter: string;
}

/**
 * Create LDAP client factory.
 * In production, uses ldapjs. In tests, inject a mock factory via DI.
 */
export function createLdapClientFactory(configService: ConfigService) {
  return () => {
    // Dynamic import to avoid issues when ldapjs is not available (e.g., in tests)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ldap = require('ldapjs');
    const client = ldap.createClient({
      url: configService.ldapUrl,
      connectTimeout: 5000,
      timeout: 10000,
    });

    return {
      bind: (dn: string, password: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          client.bind(dn, password, (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      search: (base: string, options: Record<string, unknown>): Promise<any[]> => {
        return new Promise((resolve, reject) => {
          client.search(base, options, (err: Error | null, res: any) => {
            if (err) return reject(err);
            const entries: any[] = [];
            res.on('searchEntry', (entry: any) => {
              entries.push(entry.pojo ? entry.pojo.attributes.reduce((acc: any, attr: any) => {
                acc[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
                return acc;
              }, {}) : entry.object);
            });
            res.on('error', (err: Error) => reject(err));
            res.on('end', () => resolve(entries));
          });
        });
      },
      unbind: (): Promise<void> => {
        return new Promise((resolve) => {
          client.unbind(() => resolve());
        });
      },
    };
  };
}
