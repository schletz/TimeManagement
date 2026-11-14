/**
 * Small helpers for ids, dates, numbers and binary data.
 * Dates are ISO strings `YYYY-MM-DD`, times `HH:MM`, timestamps `YYYY-MM-DDTHH:MM:SS` (Vienna local time).
 */
const Util = {
  /** @returns {string} new random UUID */
  uuid() {
    return Utilities.getUuid();
  },

  /** @returns {string} current date in Vienna, `YYYY-MM-DD` */
  today() {
    return Utilities.formatDate(new Date(), Config.TIME_ZONE, 'yyyy-MM-dd');
  },

  /** @returns {string} current timestamp in Vienna, `YYYY-MM-DDTHH:MM:SS` */
  now() {
    return Utilities.formatDate(new Date(), Config.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
  },

  /**
   * Checks for a valid calendar date in ISO format.
   * @param {*} value
   * @returns {boolean}
   */
  isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  },

  /**
   * Checks for a valid time `HH:MM` (00:00–23:59).
   * @param {*} value
   * @returns {boolean}
   */
  isTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  },

  /**
   * Converts a `HH:MM` time to minutes since midnight.
   * @param {string} time
   * @returns {number}
   */
  toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  },

  /**
   * Rounds commercially to 2 decimals. EPSILON compensates binary representation errors (1.005 → 1.01).
   * @param {number} value
   * @returns {number}
   */
  round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  },

  /**
   * Trims a value to a string with a maximum length.
   * @param {*} value
   * @param {number} [maxLength]
   * @returns {string}
   */
  text(value, maxLength) {
    const s = value === null || value === undefined ? '' : String(value).trim();
    return maxLength ? s.substring(0, maxLength) : s;
  },

  /**
   * Parses a number from a JS number or a string with decimal comma/point.
   * @param {*} value
   * @returns {number} NaN when not parseable
   */
  toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || value.trim() === '') return NaN;
    return Number(value.trim().replace(',', '.'));
  },

  /**
   * Hex encoded SHA-256 of a string.
   * @param {string} value
   * @returns {string}
   */
  sha256(value) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
  },

  /**
   * Decodes a base64 JPEG (optionally as data URL) into a blob and validates it.
   * @param {string} base64
   * @param {string} name file name
   * @returns {GoogleAppsScript.Base.Blob}
   */
  jpegBlob(base64, name) {
    assertValid(typeof base64 === 'string' && base64.length > 0, 'Bilddaten fehlen.');
    const raw = base64.replace(/^data:[^,]*,/, '');
    const bytes = Utilities.base64Decode(raw);
    assertValid(bytes.length <= Config.MAX_IMAGE_BYTES, 'Das Bild ist zu groß.');
    // JPEG files start with the SOI marker FF D8 (bytes are signed in Apps Script).
    assertValid(bytes.length > 2 && (bytes[0] & 0xff) === 0xff && (bytes[1] & 0xff) === 0xd8, 'Nur JPEG-Bilder sind erlaubt.');
    return Utilities.newBlob(bytes, 'image/jpeg', name);
  },

  /**
   * Compares two strings case-insensitively after trimming.
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  sameText(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  },

  /**
   * Simple e-mail plausibility check.
   * @param {string} value
   * @returns {boolean}
   */
  isEmail(value) {
    return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  },
};
