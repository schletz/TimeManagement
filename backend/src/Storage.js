/**
 * Drive access: folders, JPEG files, thumbnails and DOCX export.
 * All files stay private in the owner's Drive; the frontend only receives base64 data.
 */
const Storage = {
  /** @returns {GoogleAppsScript.Drive.Folder} */
  rootFolder() {
    return DriveApp.getFolderById(Config.rootFolderId());
  },

  /**
   * Returns a subfolder by name, creating it when missing.
   * @param {GoogleAppsScript.Drive.Folder} parent
   * @param {string} name
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  subfolder(parent, name) {
    const it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  },

  /** @returns {GoogleAppsScript.Drive.Folder} */
  projectsFolder() {
    return this.subfolder(this.rootFolder(), Config.PROJECTS_FOLDER_NAME);
  },

  /**
   * Returns a project subfolder (photos, receipts, invoices).
   * @param {{folderId: string}} project
   * @param {'photos'|'receipts'|'invoices'} kind
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  projectFolder(project, kind) {
    return this.subfolder(DriveApp.getFolderById(project.folderId), Config.PROJECT_SUBFOLDERS[kind]);
  },

  /**
   * Moves a file (e.g. a new spreadsheet created in My Drive) into a folder.
   * @param {string} fileId
   * @param {GoogleAppsScript.Drive.Folder} folder
   */
  moveTo(fileId, folder) {
    DriveApp.getFileById(fileId).moveTo(folder);
  },

  /**
   * Stores a JPEG in a folder. Idempotent: an existing file with the same name is returned.
   * @param {GoogleAppsScript.Drive.Folder} folder
   * @param {string} name
   * @param {string} base64
   * @returns {string} file id
   */
  saveJpeg(folder, name, base64) {
    const existing = folder.getFilesByName(name);
    while (existing.hasNext()) {
      const f = existing.next();
      if (!f.isTrashed()) return f.getId();
    }
    return folder.createFile(Util.jpegBlob(base64, name)).getId();
  },

  /**
   * Checks that a file lies directly in the given folder (prevents access to foreign files by id).
   * @param {string} fileId
   * @param {GoogleAppsScript.Drive.Folder} folder
   * @returns {boolean}
   */
  isInFolder(fileId, folder) {
    try {
      const parents = DriveApp.getFileById(fileId).getParents();
      while (parents.hasNext()) if (parents.next().getId() === folder.getId()) return true;
    } catch (err) {
      return false;
    }
    return false;
  },

  /**
   * @param {string} fileId
   * @returns {{base64: string, mimeType: string, name: string}}
   */
  readBase64(fileId) {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return { base64: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType(), name: file.getName() };
  },

  /**
   * Moves a file to the trash; missing files are ignored.
   * @param {string} fileId
   */
  trash(fileId) {
    if (!fileId) return;
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (err) {
      console.warn('Could not trash file ' + fileId + ': ' + err.message);
    }
  },

  /**
   * Loads thumbnails (about 400 px) as base64 via the Drive thumbnailLink. Results are cached for 6 h.
   * Files without a thumbnail yet (Drive generates them asynchronously) are missing in the result.
   * @param {string[]} fileIds
   * @returns {Object<string, string>} file id → base64 JPEG
   */
  thumbnails(fileIds) {
    const cache = CacheService.getScriptCache();
    const result = {};
    const ids = fileIds.filter(Boolean);
    if (!ids.length) return result;
    const cached = cache.getAll(ids.map((id) => 'thumb_' + id));
    const missing = ids.filter((id) => {
      const v = cached['thumb_' + id];
      if (v) result[id] = v;
      return !v;
    });
    if (!missing.length) return result;

    const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
    const metas = UrlFetchApp.fetchAll(missing.map((id) => ({
      url: 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=thumbnailLink',
      headers,
      muteHttpExceptions: true,
    })));
    const links = [];
    metas.forEach((resp, i) => {
      if (resp.getResponseCode() !== 200) return;
      const link = JSON.parse(resp.getContentText()).thumbnailLink;
      // thumbnailLink ends with a size parameter like "=s220"; request a larger one.
      if (link) links.push({ id: missing[i], url: link.replace(/=s\d+$/, '=s400') });
    });
    if (!links.length) return result;
    const thumbs = UrlFetchApp.fetchAll(links.map((l) => ({ url: l.url, headers, muteHttpExceptions: true })));
    const toCache = {};
    thumbs.forEach((resp, i) => {
      if (resp.getResponseCode() !== 200) return;
      const b64 = Utilities.base64Encode(resp.getContent());
      result[links[i].id] = b64;
      // CacheService values are limited to 100 KB.
      if (b64.length < 95000) toCache['thumb_' + links[i].id] = b64;
    });
    if (Object.keys(toCache).length) cache.putAll(toCache, 21600);
    return result;
  },

  /**
   * Removes a cached thumbnail (after the image was replaced or deleted).
   * @param {string} fileId
   */
  forgetThumbnail(fileId) {
    if (fileId) CacheService.getScriptCache().remove('thumb_' + fileId);
  },

  /**
   * Exports a Google Doc as DOCX.
   * @param {string} docId
   * @param {string} fileName
   * @returns {GoogleAppsScript.Base.Blob}
   */
  exportDocx(docId, fileName) {
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const resp = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(docId) + '/export?mimeType=' + encodeURIComponent(mime),
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) {
      throw new AppError('INTERNAL', 'DOCX-Export fehlgeschlagen (' + resp.getResponseCode() + ').');
    }
    return resp.getBlob().setName(fileName).setContentType(mime);
  },
};
