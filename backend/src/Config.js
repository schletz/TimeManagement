/**
 * Access to script properties and global constants.
 *
 * Script properties (set by setup(), CLIENT_ID manually):
 * ROOT_FOLDER_ID, MASTER_SHEET_ID, TEMPLATE_DOC_ID, CLIENT_ID
 */
const Config = {
  TIME_ZONE: 'Europe/Vienna',
  APP_NAME: 'Baustellen-App',
  PROJECTS_FOLDER_NAME: 'Projekte',
  PROJECT_SUBFOLDERS: { photos: 'Fotos', receipts: 'Belege', invoices: 'Rechnungen' },
  LOCK_TIMEOUT_MS: 20000,
  MASTER_CACHE_KEY: 'master_snapshot_v1',
  MASTER_CACHE_SECONDS: 300,
  MAX_IMAGE_BYTES: 8 * 1024 * 1024,

  /** @returns {GoogleAppsScript.Properties.Properties} */
  props() {
    return PropertiesService.getScriptProperties();
  },

  /**
   * Reads a required script property.
   * @param {string} name
   * @returns {string}
   */
  require(name) {
    const value = this.props().getProperty(name);
    if (!value) {
      throw new AppError('INTERNAL', `Script-Property ${name} fehlt. Bitte setup() ausführen bzw. Property setzen.`);
    }
    return value;
  },

  rootFolderId() { return this.require('ROOT_FOLDER_ID'); },
  masterSheetId() { return this.require('MASTER_SHEET_ID'); },
  templateDocId() { return this.require('TEMPLATE_DOC_ID'); },
  clientId() { return this.require('CLIENT_ID'); },
};
