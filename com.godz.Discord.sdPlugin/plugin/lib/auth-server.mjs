// Godz Discord Plugin - OAuth2 Callback Server
// Local HTTP server for Discord OAuth2 authorization flow

import http from 'node:http';
import { URL } from 'node:url';
import { logger } from './logger.mjs';

const AUTH_PORT = 26432;

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1e1f22;
      color: #f2f3f5;
      font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      text-align: center;
      padding: 40px;
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 20px;
      background: #23a559;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg { width: 40px; height: 40px; }
    h1 {
      font-size: 24px;
      font-weight: 600;
      color: #f2f3f5;
      margin-bottom: 8px;
    }
    p {
      font-size: 16px;
      color: #b5bac1;
      margin-bottom: 24px;
    }
    .countdown {
      font-size: 14px;
      color: #949ba4;
    }
    #timer { color: #5865f2; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="#fff" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <h1>Authorization Successful</h1>
    <p>You can close this window now.</p>
    <div class="countdown">Closing automatically in <span id="timer">5</span> seconds...</div>
  </div>
  <script>
    let t = 5;
    const el = document.getElementById('timer');
    const iv = setInterval(() => { if (--t <= 0) { clearInterval(iv); window.close(); } el.textContent = t; }, 1000);
  </script>
</body>
</html>`;

const ERROR_HTML = (msg) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      background: #1e1f22; color: #f2f3f5;
      font-family: 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .container { text-align: center; padding: 40px; }
    h1 { color: #ed4245; margin-bottom: 8px; }
    p { color: #b5bac1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Failed</h1>
    <p>${msg}</p>
  </div>
</body>
</html>`;

// Page served for implicit OAuth2 flow - captures access_token from URL hash
const IMPLICIT_CALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1e1f22; color: #f2f3f5;
      font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .container { text-align: center; padding: 40px; }
    .icon { width: 80px; height: 80px; margin: 0 auto 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .icon.ok { background: #23a559; }
    .icon.err { background: #ed4245; }
    .icon svg { width: 40px; height: 40px; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 16px; color: #b5bac1; margin-bottom: 24px; }
    .countdown { font-size: 14px; color: #949ba4; }
    #timer { color: #5865f2; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon ok" id="iconOk" style="display:none">
      <svg fill="#fff" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <div class="icon err" id="iconErr" style="display:none">
      <svg fill="#fff" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </div>
    <h1 id="title">Authorizing...</h1>
    <p id="msg">Please wait</p>
    <div class="countdown" id="countdown" style="display:none">Closing in <span id="timer">5</span>s...</div>
  </div>
  <script>
    (function() {
      var params = new URLSearchParams(window.location.hash.substring(1));
      var token = params.get('access_token');
      var tokenType = params.get('token_type');
      var expiresIn = params.get('expires_in');
      var scope = params.get('scope');

      if (!token) {
        document.getElementById('iconErr').style.display = 'flex';
        document.getElementById('title').textContent = 'Authorization Failed';
        document.getElementById('msg').textContent = 'No access token received.';
        return;
      }

      fetch('/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          token_type: tokenType,
          expires_in: parseInt(expiresIn, 10) || 604800,
          scope: scope
        })
      }).then(function() {
        document.getElementById('iconOk').style.display = 'flex';
        document.getElementById('title').textContent = 'Authorization Successful';
        document.getElementById('msg').textContent = 'You can close this window.';
        document.getElementById('countdown').style.display = 'block';
        var t = 5;
        var el = document.getElementById('timer');
        var iv = setInterval(function() {
          if (--t <= 0) { clearInterval(iv); window.close(); }
          el.textContent = t;
        }, 1000);
      }).catch(function(err) {
        document.getElementById('iconErr').style.display = 'flex';
        document.getElementById('title').textContent = 'Error';
        document.getElementById('msg').textContent = err.message || 'Failed to send token';
      });
    })();
  </script>
</body>
</html>`;

export class AuthServer {
  constructor() {
    this.server = null;
    this._codeResolver = null;
    this._tokenResolver = null;
  }

  // Start the auth server and wait for OAuth callback
  start() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.stop();
      }

      this.server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${AUTH_PORT}`);

        // Handle logout
        if (url.pathname === '/logout') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Logged out');
          return;
        }

        // Handle /data POST from implicit OAuth2 callback page
        if (url.pathname === '/data' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              logger.info('Received implicit OAuth2 token via /data');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));

              if (this._tokenResolver && data.access_token) {
                this._tokenResolver(data);
                this._tokenResolver = null;
              }
            } catch (err) {
              logger.error('Failed to parse /data body:', err.message);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        // Handle OAuth callback (both code flow and implicit flow)
        if (url.pathname === '/callback' || url.pathname === '/') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (code) {
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'Content-Security-Policy': "default-src 'self' 'unsafe-inline'"
            });
            res.end(SUCCESS_HTML);

            if (this._codeResolver) {
              this._codeResolver(code);
              this._codeResolver = null;
            }
          } else {
            // Serve implicit flow token capture page
            // The access_token is in the URL hash fragment (not sent to server)
            // This page reads it from the hash and POSTs it back to /data
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; connect-src 'self'"
            });
            res.end(IMPLICIT_CALLBACK_HTML);
          }
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this.server.listen(AUTH_PORT, '127.0.0.1', () => {
        logger.info(`Auth server listening on port ${AUTH_PORT}`);
        resolve();
      });

      this.server.on('error', (err) => {
        logger.error('Auth server error:', err.message);
        reject(err);
      });
    });
  }

  // Wait for the authorization code from Discord callback (code flow)
  waitForCode(timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._codeResolver = null;
        reject(new Error('Authorization timed out'));
      }, timeoutMs);

      this._codeResolver = (code) => {
        clearTimeout(timeout);
        resolve(code);
      };
    });
  }

  // Wait for the access token from implicit OAuth2 flow via /data POST
  waitForToken(timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._tokenResolver = null;
        reject(new Error('Implicit OAuth2 timed out waiting for token'));
      }, timeoutMs);

      this._tokenResolver = (tokenData) => {
        clearTimeout(timeout);
        resolve(tokenData);
      };
    });
  }

  // Exchange authorization code for access token
  async exchangeCode(code, clientId, clientSecret) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `http://127.0.0.1:${AUTH_PORT}/callback`,
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Token exchange failed: ${err}`);
    }

    return response.json();
  }

  // Refresh an expired access token
  async refreshToken(refreshToken, clientId, clientSecret) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return response.json();
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  get redirectUri() {
    return `http://127.0.0.1:${AUTH_PORT}/callback`;
  }

  get port() {
    return AUTH_PORT;
  }
}
