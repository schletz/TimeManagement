/**
 * One-time setup, run by the owner in the Apps Script editor:
 * creates the Drive folder structure, the master spreadsheet with seed data and the invoice template,
 * stores the ids in the script properties and registers the owner as chef.
 *
 * The OAuth client id must be added manually as script property CLIENT_ID
 * (Project Settings → Script Properties) or via setClientId().
 */
function setup() {
  const props = Config.props();
  const existingRoot = props.getProperty('ROOT_FOLDER_ID');
  if (existingRoot && setupFolderExists(existingRoot)) {
    console.log('Setup already done (ROOT_FOLDER_ID is set). Delete the script properties to set up again.');
    return;
  }

  const root = DriveApp.createFolder(Config.APP_NAME);
  root.createFolder(Config.PROJECTS_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', root.getId());

  const ss = SpreadsheetApp.create('Stammdaten');
  ss.setSpreadsheetTimeZone(Config.TIME_ZONE);
  MASTER_TABLES.forEach((t) => Table.ensureSheet(ss, t));
  const names = MASTER_TABLES.map((t) => SCHEMA[t].sheet);
  ss.getSheets().filter((s) => names.indexOf(s.getName()) < 0).forEach((s) => ss.deleteSheet(s));
  DriveApp.getFileById(ss.getId()).moveTo(root);
  props.setProperty('MASTER_SHEET_ID', ss.getId());

  RequestCache.clear();
  MasterData.writeSettings(Object.assign({}, DEFAULT_SETTINGS, { chefEmail: Session.getEffectiveUser().getEmail().toLowerCase() }));
  Table.insertMany(ss, 'catalog', DEFAULT_CATALOG);

  props.setProperty('TEMPLATE_DOC_ID', InvoiceTemplate.create(root));

  console.log('Setup finished. Folder: https://drive.google.com/drive/folders/' + root.getId());
  if (!props.getProperty('CLIENT_ID')) {
    console.log('Next step: set the script property CLIENT_ID to the OAuth client id (or run setClientId).');
  }
}

/**
 * Stores the OAuth client id. Edit the value below, run once in the editor, then revert the edit.
 * Alternatively set the property in Project Settings → Script Properties.
 */
function setClientId() {
  const clientId = 'PASTE-CLIENT-ID.apps.googleusercontent.com';
  if (clientId.indexOf('PASTE-') === 0) throw new Error('Please paste the OAuth client id into setClientId() first.');
  Config.props().setProperty('CLIENT_ID', clientId);
  console.log('CLIENT_ID stored.');
}

/** @private */
function setupFolderExists(id) {
  try {
    return !DriveApp.getFolderById(id).isTrashed();
  } catch (err) {
    return false;
  }
}
