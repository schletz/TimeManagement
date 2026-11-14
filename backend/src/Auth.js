/**
 * Authentication with Google ID tokens and role resolution.
 *
 * The frontend sends the ID token (JWT) obtained via Google Identity Services in every request.
 * The token is verified by Google's tokeninfo endpoint (signature, issuer); audience, verified e-mail
 * and expiry are checked here. Verified tokens are cached for their remaining lifetime.
 */
const Auth = {
  /**
   * Verifies an ID token and returns the e-mail address of the user.
   * @param {string} idToken
   * @returns {string} lower-case e-mail
   */
  verify(idToken) {
    if (!idToken || typeof idToken !== 'string') throw new AppError('AUTH_REQUIRED', 'Bitte anmelden.');
    const claims = this.decodePayload(idToken);
    if (!claims || !claims.exp) throw new AppError('AUTH_INVALID', 'Ungültige Anmeldung.');
    const nowSec = Math.floor(Date.now() / 1000);
    if (Number(claims.exp) <= nowSec) throw new AppError('AUTH_EXPIRED', 'Die Anmeldung ist abgelaufen.');

    const cache = CacheService.getScriptCache();
    const cacheKey = 'tok_' + Util.sha256(idToken);
    const cachedEmail = cache.get(cacheKey);
    if (cachedEmail) return cachedEmail;

    const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) throw new AppError('AUTH_INVALID', 'Ungültige Anmeldung.');
    const info = JSON.parse(resp.getContentText());
    if (info.aud !== Config.clientId()) throw new AppError('AUTH_INVALID', 'Anmeldung für eine andere Anwendung.');
    if (['accounts.google.com', 'https://accounts.google.com'].indexOf(info.iss) < 0) {
      throw new AppError('AUTH_INVALID', 'Ungültiger Aussteller.');
    }
    if (String(info.email_verified) !== 'true') throw new AppError('AUTH_INVALID', 'E-Mail-Adresse nicht bestätigt.');
    const remaining = Number(info.exp) - nowSec;
    if (remaining <= 0) throw new AppError('AUTH_EXPIRED', 'Die Anmeldung ist abgelaufen.');

    const email = String(info.email).toLowerCase();
    cache.put(cacheKey, email, Math.min(remaining, 21600));
    return email;
  },

  /**
   * Decodes the (unverified) JWT payload; only used for a cheap expiry check before the remote check.
   * @param {string} jwt
   * @returns {Object|null}
   */
  decodePayload(jwt) {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    try {
      const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString();
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  },

  /**
   * Resolves role and employee record for an e-mail.
   * Chef: e-mail equals the configured chef e-mail. Employee: active entry in the employee list.
   * @param {string} email
   * @returns {{email: string, role: 'chef'|'employee', employeeId: string, name: string, shortName: string}}
   */
  resolveUser(email) {
    const snap = MasterData.snapshot();
    const isChef = Util.sameText(snap.settings.chefEmail, email);
    const employee = snap.employees.find((e) => e.active && Util.sameText(e.email, email)) || null;
    if (!isChef && !employee) {
      throw new AppError('FORBIDDEN', 'Kein Zugang: ' + email + ' ist nicht als Mitarbeiter eingetragen.');
    }
    return {
      email,
      role: isChef ? 'chef' : 'employee',
      employeeId: employee ? employee.id : '',
      name: employee ? employee.name : email,
      shortName: employee ? employee.shortName : '',
    };
  },
};
