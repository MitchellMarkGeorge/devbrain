import { describe, it, expect } from 'vitest';
import { createGoogleCalendarProvider } from '../../../integrations/providers/google-calendar';
import { describeOAuthProvider } from '../oauth/contract';

// placeholder client values; the real ones come from the build environment
const google = createGoogleCalendarProvider({
  fetch,
  client: { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-secret' },
});

describeOAuthProvider(google.oauth!, { name: 'Google Calendar' });

describe('Google Calendar — OAuth config', () => {
  const config = google.oauth!;

  it("uses Google's endpoints", () => {
    expect(config.authorizeUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(config.tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(config.revokeUrl).toBe('https://oauth2.googleapis.com/revoke');
  });

  it('asks for openid and the two narrow read-only calendar scopes, space-separated', () => {
    expect(config.scopes).toEqual([
      'openid',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ]);
    expect(config.scopeSeparator).toBe(' ');
  });

  it('redirects to any free port and asks for offline access', () => {
    expect(config.redirect.ports).toBe('any');
    expect(config.extraAuthorizeParams).toMatchObject({ access_type: 'offline' });
  });

  it('leaves the secret out when the client has none', () => {
    const withoutSecret = createGoogleCalendarProvider({ fetch, client: { clientId: 'id' } });
    expect(withoutSecret.oauth).not.toHaveProperty('clientSecret');
  });
});
