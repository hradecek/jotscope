// JWT parsing, detection, and formatting utilities

export const SAMPLE_JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InNhbXBsZS1rZXktMSJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRGV2ZWxvcGVyIiwiZW1haWwiOiJqYW5lQGV4YW1wbGUuY29tIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MTczNTc3NjAwMCwicm9sZXMiOlsidXNlciIsImFkbWluIl0sIm9yZ19pZCI6Im9yZ19hYmMxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

export const JWT_PATTERN = /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g;

export const TOKEN_PARAM_NAMES = [
  'access_token',
  'id_token',
  'token',
  'jwt',
  'refresh_token',
  'authorization'
];

export const CLAIM_TOOLTIPS = {
  'sub': 'Subject - Identifies the principal that is the subject of the JWT',
  'iss': 'Issuer - Identifies the principal that issued the JWT',
  'aud': 'Audience - Identifies the recipients that the JWT is intended for',
  'exp': 'Expiration Time - The time after which the JWT must not be accepted',
  'nbf': 'Not Before - The time before which the JWT must not be accepted',
  'iat': 'Issued At - The time at which the JWT was issued',
  'jti': 'JWT ID - A unique identifier for the JWT',
  'alg': 'Algorithm - The cryptographic algorithm used to secure the JWT',
  'typ': 'Type - The media type of the JWT',
  'kid': 'Key ID - A hint indicating which key was used to secure the JWT',
  'azp': 'Authorized Party - The client the token was issued to; often equals client_id and may differ from aud',
  'scope': 'Scope - The scope values for the access token',
  'client_id': 'Client ID - The client identifier',
  'name': 'Name - The full name of the user',
  'email': 'Email - The email address of the user',
  'email_verified': 'Email Verified - Whether the email address has been verified',
  'given_name': 'Given Name - The first name of the user',
  'family_name': 'Family Name - The last name of the user',
  'picture': 'Picture - The URL of the user\'s profile picture',
  'locale': 'Locale - The user\'s locale (language/region)',
  'updated_at': 'Updated At - The time the user\'s information was last updated',
  'auth_time': 'Authentication Time - The time when the authentication occurred',
  'nonce': 'Nonce - A random value used to associate a session with an ID token',
  'acr': 'Authentication Context Class Reference - The authentication context class',
  'amr': 'Authentication Methods References - The authentication methods used',
  'tenant_id': 'Tenant ID - The tenant identifier in multi-tenant applications',
  'roles': 'Roles - The roles assigned to the user',
  'permissions': 'Permissions - The permissions granted to the user',
  'groups': 'Groups - The groups the user belongs to',

  // OIDC standard claims
  'preferred_username': 'Preferred Username - A shorthand name the user prefers',
  'nickname': 'Nickname - Casual name for the user',
  'middle_name': 'Middle Name - The middle name of the user',
  'profile': 'Profile - URL of the user\'s profile page',
  'website': 'Website - URL of the user\'s web page or blog',
  'zoneinfo': 'Time Zone - The user\'s time zone (e.g. Europe/Prague)',
  'birthdate': 'Birthdate - The user\'s date of birth',
  'gender': 'Gender - The user\'s gender',
  'address': 'Address - The user\'s postal address',
  'phone_number': 'Phone Number - The user\'s phone number',
  'phone_number_verified': 'Phone Number Verified - Whether the phone number has been verified',
  'sid': 'Session ID - Identifier for the user\'s session',
  'at_hash': 'Access Token Hash - Binds the ID token to the access token',
  'c_hash': 'Code Hash - Binds the ID token to the authorization code',

  // OAuth 2.0 / JWT access tokens
  'scp': 'Scope - Granted scopes (Microsoft array variant of scope)',
  'scopes': 'Scopes - Granted scopes (array variant of scope)',
  'cnf': 'Confirmation - Proof-of-possession key binding (mTLS / DPoP)',
  'act': 'Actor - The party currently acting (delegation / token exchange)',
  'may_act': 'May Act - Party authorized to act on behalf of the subject',
  'entitlements': 'Entitlements - Authorization entitlements granted',
  'token_use': 'Token Use - Whether this is an id or access token',
  'org_id': 'Organization ID - Organization the token was issued for (e.g. Auth0 Organizations)',
  'org_name': 'Organization Name - Human-readable organization name (Auth0 Organizations)',

  // Microsoft Entra ID (Azure AD)
  'tid': 'Tenant ID - The Entra ID tenant the token was issued in',
  'oid': 'Object ID - Durable user identifier in Entra (stable across apps, unlike sub)',
  'upn': 'User Principal Name - The user\'s UPN in Entra ID',
  'appid': 'Application ID - The client application (Entra v1 tokens)',
  'wids': 'Directory Role IDs - Template GUIDs for the user\'s built-in Entra directory roles (e.g. Global Administrator)',
  'ver': 'Version - Token format version',

  // Okta
  'cid': 'Client ID - The OAuth client the token was issued to (Okta)',
  'uid': 'User ID - The Okta user identifier',

  // AWS Cognito
  'cognito:groups': 'Cognito Groups - Groups the user belongs to (AWS Cognito)',
  'cognito:username': 'Cognito Username - The user\'s Cognito username',

  // Firebase
  'firebase': 'Firebase - Firebase auth metadata (sign-in provider, identities)',

  // Keycloak
  'realm_access': 'Realm Access - Keycloak realm-level roles',
  'resource_access': 'Resource Access - Keycloak per-client roles',
  'session_state': 'Session State - Keycloak session identifier',

  // Kubernetes service accounts
  'kubernetes.io': 'Kubernetes - Service account namespace / pod / serviceaccount info',

  // GitHub Actions OIDC
  'repository': 'Repository - Source repository (GitHub Actions OIDC)',
  'ref': 'Ref - Git ref that triggered the workflow (GitHub Actions OIDC)',
  'workflow': 'Workflow - Workflow name (GitHub Actions OIDC)',
  'actor': 'Actor - GitHub user that triggered the run (GitHub Actions OIDC)',
  'run_id': 'Run ID - Workflow run identifier (GitHub Actions OIDC)'
};

export function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  try {
    const decoded = atob(base64);
    return decodeURIComponent(
      decoded.split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    );
  } catch (e) {
    throw new Error('Invalid base64 encoding');
  }
}

export function isLikelyJWT(str) {
  if (!str || typeof str !== 'string') return false;
  const parts = str.split('.');
  if (parts.length !== 3) return false;
  return parts[0].startsWith('eyJ') && parts[1].startsWith('eyJ');
}

export function parseJWT(token) {
  const trimmed = token.trim();
  const parts = trimmed.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT format. Token must have 3 parts separated by dots.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch (e) {
    throw new Error('Failed to decode header: ' + e.message);
  }
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (e) {
    throw new Error('Failed to decode payload: ' + e.message);
  }

  return {
    header,
    payload,
    signatureB64,
    signedContent: headerB64 + '.' + payloadB64
  };
}

export function detectTokens(text) {
  const tokens = [];
  const seen = new Set();

  try {
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const url = new URL(urlMatch[0]);
      for (const paramName of TOKEN_PARAM_NAMES) {
        const value = url.searchParams.get(paramName);
        if (value && isLikelyJWT(value) && !seen.has(value)) {
          seen.add(value);
          tokens.push({ token: value, source: paramName });
        }
      }
      if (url.hash) {
        const hashParams = new URLSearchParams(url.hash.substring(1));
        for (const paramName of TOKEN_PARAM_NAMES) {
          const value = hashParams.get(paramName);
          if (value && isLikelyJWT(value) && !seen.has(value)) {
            seen.add(value);
            tokens.push({ token: value, source: `${paramName} (fragment)` });
          }
        }
      }
    }
  } catch (e) {
    // Not a valid URL, continue with regex matching
  }

  const matches = text.match(JWT_PATTERN) || [];
  for (const match of matches) {
    if (!seen.has(match)) {
      seen.add(match);
      tokens.push({ token: match, source: 'detected' });
    }
  }

  return tokens;
}

export function isValidUrl(str) {
  if (!str || typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isTimestampValue(value) {
  return typeof value === 'number' &&
         value > 1000000000 &&
         value < 10000000000;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getClaimTooltip(claimName) {
  return CLAIM_TOOLTIPS[claimName] || null;
}

export function getTimestampTooltip(timestamp) {
  try {
    return new Date(timestamp * 1000).toString();
  } catch (e) {
    return null;
  }
}

export function getRelativeTime(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  const absDiff = Math.abs(diff);

  const units = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
    { name: 'second', seconds: 1 }
  ];

  for (const unit of units) {
    const count = Math.floor(absDiff / unit.seconds);
    if (count >= 1) {
      const plural = count !== 1 ? 's' : '';
      return diff > 0
        ? `in ${count} ${unit.name}${plural}`
        : `${count} ${unit.name}${plural} ago`;
    }
  }
  return 'just now';
}

export function formatTimestampForCard(timestamp) {
  const date = new Date(timestamp * 1000);
  const options = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  const absolute = date.toLocaleString(undefined, options);
  const relative = getRelativeTime(timestamp);
  return `${absolute}<span class="time-relative">${relative}</span>`;
}

export function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatExpirationShort(exp) {
  if (!exp || typeof exp !== 'number') return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = exp - now;

  if (diff <= 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60) return 'just expired';
    if (absDiff < 3600) return `expired ${Math.floor(absDiff / 60)}m ago`;
    if (absDiff < 86400) return `expired ${Math.floor(absDiff / 3600)}h ago`;
    return `expired ${Math.floor(absDiff / 86400)}d ago`;
  }

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function getTokenStatus(payload, expiringWithin = 300) {
  if (!payload) return { label: 'No expiry', tone: 'no-expiry' };
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return { label: 'Expired', tone: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf > now) return { label: 'Not yet active', tone: 'notyet' };
  if (typeof payload.exp !== 'number') return { label: 'No expiry', tone: 'no-expiry' };
  if (payload.exp - now < expiringWithin) return { label: 'Expiring', tone: 'expiring' };
  return { label: 'Valid', tone: 'valid' };
}

export function getTokenMetadata(token) {
  try {
    const { payload } = parseJWT(token);
    const subject = payload.sub || payload.email || payload.name || payload.client_id || null;
    const expiration = formatExpirationShort(payload.exp);
    return { subject, expiration, valid: true };
  } catch (e) {
    return { subject: null, expiration: null, valid: false };
  }
}

export function highlightJSON(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  const lines = [];

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span class="json-null">[]</span>';
    lines.push('[');
    obj.forEach((item, i) => {
      const comma = i < obj.length - 1 ? ',' : '';
      lines.push(spaces + '  ' + highlightJSON(item, indent + 1) + comma);
    });
    lines.push(spaces + ']');
    return lines.join('\n');
  }

  if (obj === null) return '<span class="json-null">null</span>';

  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '<span class="json-null">{}</span>';
    lines.push('{');
    keys.forEach((key, i) => {
      const value = obj[key];
      const comma = i < keys.length - 1 ? ',' : '';
      const tooltip = getClaimTooltip(key);
      let highlightedKey;
      if (tooltip) {
        highlightedKey = `<span class="json-key tooltip" data-tooltip="${escapeHtml(tooltip)}">"${escapeHtml(key)}"</span>`;
      } else {
        highlightedKey = `<span class="json-key">"${escapeHtml(key)}"</span>`;
      }
      const highlightedValue = highlightValue(value, indent + 1, key);
      lines.push(spaces + '  ' + highlightedKey + ': ' + highlightedValue + comma);
    });
    lines.push(spaces + '}');
    return lines.join('\n');
  }

  return highlightValue(obj, indent, null);
}

export function highlightValue(value, indent, key) {
  if (value === null) {
    return '<span class="json-null copyable" data-copy-value="null">null</span>';
  }
  if (typeof value === 'string') {
    if (isValidUrl(value)) {
      return `<span class="json-string copyable url-value" data-copy-value="${escapeHtml(value)}" data-url="${escapeHtml(value)}">"${escapeHtml(value)}"<span class="url-link-icon" title="Open URL">🔗</span></span>`;
    }
    return `<span class="json-string copyable" data-copy-value="${escapeHtml(value)}">"${escapeHtml(value)}"</span>`;
  }
  if (typeof value === 'number') {
    if (isTimestampValue(value)) {
      const tooltip = getTimestampTooltip(value);
      if (tooltip) {
        return `<span class="json-number tooltip tooltip-value copyable" data-tooltip="${escapeHtml(tooltip)}" data-copy-value="${value}">${value}</span>`;
      }
    }
    return `<span class="json-number copyable" data-copy-value="${value}">${value}</span>`;
  }
  if (typeof value === 'boolean') {
    return `<span class="json-boolean copyable" data-copy-value="${value}">${value}</span>`;
  }
  if (Array.isArray(value) || typeof value === 'object') {
    const jsonStr = JSON.stringify(value);
    return `<span class="copyable" data-copy-value="${escapeHtml(jsonStr)}">${highlightJSON(value, indent)}</span>`;
  }
  return escapeHtml(String(value));
}
