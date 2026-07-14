// Generates realistic (but synthetic) JWTs for manually testing the extension.
// Signatures are random placeholders - these are NOT real credentials.
// Run: node scripts/gen-test-tokens.js  → writes test-tokens.md
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const now = Math.floor(Date.now() / 1000);
const h = n => now + n * 3600;   // hours from now
const m = n => now + n * 60;     // minutes from now

const b64url = obj =>
  Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Plausible-length random signature per algorithm family (base64url, unverifiable).
function fakeSig(alg) {
  if (!alg || alg.toLowerCase() === 'none') return '';
  const bytes = alg.startsWith('ES') || alg.startsWith('HS') ? 64 : 256;
  return crypto.randomBytes(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(header, payload) {
  return `${b64url(header)}.${b64url(payload)}.${fakeSig(header.alg)}`;
}

const samples = [
  {
    name: 'Google - OIDC ID token (valid, RS256)',
    header: { alg: 'RS256', kid: 'a1b2c3d4e5f6', typ: 'JWT' },
    payload: {
      iss: 'https://accounts.google.com', azp: '407408718192.apps.googleusercontent.com',
      aud: '407408718192.apps.googleusercontent.com', sub: '110169484474386276334',
      email: 'jane.doe@gmail.com', email_verified: true,
      name: 'Jane Doe', given_name: 'Jane', family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/default-user',
      locale: 'en', iat: m(-2), exp: h(1),
    },
  },
  {
    name: 'Auth0 - access token with org + custom namespaced claim',
    header: { alg: 'RS256', kid: 'auth0-prod-1', typ: 'JWT' },
    payload: {
      iss: 'https://acme.eu.auth0.com/', sub: 'auth0|64f1a2b3c4d5e6f7',
      aud: ['https://api.acme.com', 'https://acme.eu.auth0.com/userinfo'],
      azp: 'A1b2C3d4E5f6', scope: 'openid profile email read:orders write:orders offline_access',
      org_id: 'org_kd9F2xQ', org_name: 'acme-eu',
      'https://acme.com/roles': ['admin', 'billing'],
      iat: m(-5), exp: h(24),
    },
  },
  {
    name: 'Microsoft Entra ID (Azure AD) v2 - access token',
    header: { alg: 'RS256', kid: '-KI3Q9nNR7bRofxmeZoXqbHZGew', typ: 'JWT' },
    payload: {
      aud: 'api://8f3d1c2e-...', iss: 'https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0',
      iat: m(-3), nbf: m(-3), exp: h(1), tid: '72f988bf-86f1-41af-91ab-2d7cd011db47',
      oid: '00000000-0000-0000-66f3-3332eca7ea81', sub: 'AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ',
      upn: 'jane@contoso.com', preferred_username: 'jane@contoso.com', name: 'Jane Developer',
      scp: ['User.Read', 'Mail.Read'], wids: ['62e90394-69f5-4237-9190-012177145e10'], ver: '2.0',
    },
  },
  {
    name: 'AWS Cognito - ID token (email not verified)',
    header: { alg: 'RS256', kid: 'cognito-key-1', typ: 'JWT' },
    payload: {
      iss: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_Ab12Cd34',
      sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', aud: '2example1clientid',
      token_use: 'id', 'cognito:username': 'jane', 'cognito:groups': ['admins', 'beta-testers'],
      email: 'jane@example.com', email_verified: false, name: 'Jane',
      auth_time: m(-4), iat: m(-4), exp: h(1),
    },
  },
  {
    name: 'Keycloak - realm + resource roles',
    header: { alg: 'RS256', kid: 'keycloak-rsa-1', typ: 'JWT' },
    payload: {
      iss: 'https://sso.acme.com/realms/acme', sub: 'f:1234:jane', aud: 'account',
      azp: 'acme-webapp', preferred_username: 'jane', email: 'jane@acme.com', email_verified: true,
      scope: 'openid profile email', session_state: '2b1c...9a',
      acr: '1', realm_access: { roles: ['offline_access', 'default-roles-acme', 'admin'] },
      resource_access: { 'acme-webapp': { roles: ['viewer', 'editor'] } },
      iat: m(-6), exp: h(8),
    },
  },
  {
    name: 'Firebase - ID token',
    header: { alg: 'RS256', kid: 'fb-2024-01', typ: 'JWT' },
    payload: {
      iss: 'https://securetoken.google.com/my-app-12345', aud: 'my-app-12345',
      sub: 'kM3nZ8x...user', user_id: 'kM3nZ8x...user', auth_time: m(-10), iat: m(-10), exp: h(1),
      email: 'jane@example.com', email_verified: true,
      firebase: { identities: { email: ['jane@example.com'] }, sign_in_provider: 'password' },
    },
  },
  {
    name: 'GitHub Actions - OIDC token',
    header: { alg: 'RS256', kid: 'gha-oidc-1', typ: 'JWT' },
    payload: {
      iss: 'https://token.actions.githubusercontent.com', sub: 'repo:acme/widgets:ref:refs/heads/main',
      aud: 'https://github.com/acme', repository: 'acme/widgets', repository_owner: 'acme',
      ref: 'refs/heads/main', workflow: 'Deploy', actor: 'jane-dev', run_id: '7654321098',
      iat: m(-1), nbf: m(-1), exp: m(9),
    },
  },
  {
    name: 'Okta - access token (long acr, scopes, groups)',
    header: { alg: 'RS256', kid: 'okta-abc123', typ: 'JWT' },
    payload: {
      iss: 'https://acme.okta.com/oauth2/default', aud: 'api://default', sub: 'jane@acme.com',
      scp: ['openid', 'profile', 'email'], groups: ['Everyone', 'Admins'],
      acr: 'urn:okta:loa:2fa:any', cid: '0oa1b2c3d4', uid: '00u1b2c3d4',
      iat: m(-7), exp: h(1),
    },
  },
  {
    name: 'HS256 - symmetric (jwt.io-style demo)',
    header: { alg: 'HS256', typ: 'JWT' },
    payload: { sub: '1234567890', name: 'John Doe', admin: true, iat: m(-15), exp: h(2) },
  },
  {
    name: 'ES256 - elliptic curve',
    header: { alg: 'ES256', kid: 'ec-key-1', typ: 'JWT' },
    payload: { iss: 'https://api.example.com', sub: 'svc-account-9', aud: 'internal', iat: m(-1), exp: h(1) },
  },
  {
    name: 'alg: none - UNSIGNED (security test)',
    header: { alg: 'none', typ: 'JWT' },
    payload: { sub: 'attacker', name: 'Totally Legit Admin', role: 'admin', iat: m(-1), exp: h(1) },
  },
  {
    name: 'Expired (exp in the past)',
    header: { alg: 'RS256', kid: 'sample-key-1', typ: 'JWT' },
    payload: { iss: 'https://auth.example.com', sub: 'user-42', email: 'old@example.com', iat: h(-25), exp: h(-1) },
  },
  {
    name: 'Expiring soon (~3 min)',
    header: { alg: 'RS256', kid: 'sample-key-1', typ: 'JWT' },
    payload: { iss: 'https://auth.example.com', sub: 'user-77', iat: m(-57), exp: m(3) },
  },
  {
    name: 'Not yet active (nbf ~2 min in the future)',
    header: { alg: 'RS256', kid: 'sample-key-1', typ: 'JWT' },
    payload: { iss: 'https://auth.example.com', sub: 'user-88', iat: m(-1), nbf: m(2), exp: h(2) },
  },
  {
    name: 'No expiry (no exp claim)',
    header: { alg: 'RS256', kid: 'sample-key-1', typ: 'JWT' },
    payload: { iss: 'https://auth.example.com', sub: 'service-account', iat: m(-30) },
  },
];

const lines = [
  '# JWT test tokens',
  '',
  '_Synthetic tokens for testing Jotscope - signatures are random placeholders, not real credentials._',
  `_Generated ${new Date().toISOString()} - timestamps are relative to generation time; re-run the script to refresh live states._`,
  '',
];
for (const s of samples) {
  lines.push(`## ${s.name}`, '', '```', jwt(s.header, s.payload), '```', '');
}

const outPath = path.join(__dirname, '..', 'test-tokens.md');
fs.writeFileSync(outPath, lines.join('\n'));
console.log(`Wrote ${samples.length} tokens to ${outPath}`);
