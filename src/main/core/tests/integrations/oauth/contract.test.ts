import { OAuthConfig } from '../../../integrations/oauth/types';
import { describeOAuthProvider } from './contract';
import { freePorts } from './fake-auth-server';

// Two fake providers with opposite configs. Both pass the same suite with no change under oauth/,
// which is what keeps the flow provider-agnostic. Their endpoint URLs are replaced by the suite.

const anyPortWithSecret: OAuthConfig = {
  authorizeUrl: 'https://auth.any-port.test/authorize',
  tokenUrl: 'https://auth.any-port.test/token',
  revokeUrl: 'https://auth.any-port.test/revoke',
  clientId: 'any-port-client.apps.test',
  clientSecret: 'any-port-secret',
  scopes: ['calendar.read', 'calendar.list'],
  redirect: { ports: 'any', path: '/callback' },
  extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  clientAuth: 'body',
};

const fixedPortsBasicAuth: OAuthConfig = {
  authorizeUrl: 'https://auth.fixed-ports.test/oauth/authorize',
  tokenUrl: 'https://auth.fixed-ports.test/oauth/token',
  clientId: 'fixed-ports client',
  scopes: ['read', 'issues:read'],
  scopeSeparator: ',',
  // fixed ports must be free, so they are picked when the file loads
  redirect: { ports: await freePorts(3), path: '/oauth/done' },
  clientAuth: 'basic',
};

describeOAuthProvider(anyPortWithSecret, { name: 'any port, secret in the body' });
describeOAuthProvider(fixedPortsBasicAuth, { name: 'fixed ports, no secret, Basic auth' });
