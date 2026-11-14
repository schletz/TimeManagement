/**
 * Site photos of a project (sheet "Fotos", files in `Fotos/`). Only the annotated version is stored;
 * annotating later replaces the file.
 */
const Photos = {
  /** @private */
  dto(ph, thumbnail) {
    return {
      id: ph.id, takenAt: ph.takenAt, uploaderId: ph.uploaderId, uploaderName: ph.uploaderName,
      description: ph.description, preDamage: ph.preDamage, createdAt: ph.createdAt, updatedAt: ph.updatedAt,
      thumbnail: thumbnail || null,
    };
  },

  /**
   * listPhotos: chronological (newest first) with thumbnails; `onlyPreDamage` filters.
   * @param {Object} ctx
   * @param {{projectId: string, onlyPreDamage?: boolean}} p
   */
  list(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const rows = Table.read(Projects.spreadsheet(project), 'photos')
      .filter((ph) => !p.onlyPreDamage || ph.preDamage)
      .sort((a, b) => (b.takenAt || b.createdAt).localeCompare(a.takenAt || a.createdAt));
    const thumbs = Storage.thumbnails(rows.map((r) => r.fileId));
    return rows.map((r) => this.dto(r, thumbs[r.fileId]));
  },

  /**
   * getPhoto: full resolution image of a photo (`photoId`) or of a demand report (`demandId`).
   * @param {Object} ctx
   * @param {{projectId: string, photoId?: string, demandId?: string}} p
   */
  get(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const row = p.demandId ? Table.find(ss, 'demands', Util.text(p.demandId)) : Table.find(ss, 'photos', Util.text(p.photoId));
    const fileId = row ? (p.demandId ? row.photoFileId : row.fileId) : '';
    if (!fileId) throw new AppError('NOT_FOUND', 'Foto nicht gefunden.');
    return Storage.readBase64(fileId);
  },

  /**
   * uploadPhoto: stores a new (already annotated) photo. Idempotent by id.
   * @param {Object} ctx
   * @param {{id: string, projectId: string, takenAt?: string, description?: string, preDamage?: boolean, base64: string}} p
   */
  upload(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const id = Util.text(p.id);
    assertValid(/^[\w-]{8,64}$/.test(id), 'Ungültige ID.');
    const ss = Projects.spreadsheet(project);
    const existing = Table.find(ss, 'photos', id);
    if (existing) return this.dto(existing);
    const fileId = Storage.saveJpeg(Storage.projectFolder(project, 'photos'), 'Foto_' + id + '.jpg', p.base64);
    const now = Util.now();
    const row = {
      id, takenAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.takenAt || '') ? String(p.takenAt).substring(0, 19) : now,
      uploaderId: ctx.user.employeeId, uploaderName: ctx.user.name, description: Util.text(p.description, 1000),
      preDamage: !!p.preDamage, fileId, createdAt: now, updatedAt: now,
    };
    Table.insert(ss, 'photos', row);
    return this.dto(row);
  },

  /**
   * updatePhoto: changes description / pre-damage flag and optionally replaces the image (annotated later).
   * @param {Object} ctx
   * @param {{projectId: string, id: string, description?: string, preDamage?: boolean, base64?: string}} p
   */
  update(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const row = Table.find(ss, 'photos', Util.text(p.id));
    if (!row) throw new AppError('NOT_FOUND', 'Foto nicht gefunden.');
    Access.assertOwner(ctx, row.uploaderId);
    if (p.description !== undefined) row.description = Util.text(p.description, 1000);
    if (p.preDamage !== undefined) row.preDamage = !!p.preDamage;
    if (p.base64) {
      // DriveApp cannot overwrite binary content: store a new file and trash the old one.
      const folder = Storage.projectFolder(project, 'photos');
      const newId = folder.createFile(Util.jpegBlob(p.base64, 'Foto_' + row.id + '.jpg')).getId();
      Storage.trash(row.fileId);
      Storage.forgetThumbnail(row.fileId);
      row.fileId = newId;
    }
    row.updatedAt = Util.now();
    Table.update(ss, 'photos', row);
    return this.dto(row);
  },

  /** deletePhoto: removes the row and trashes the file. */
  remove(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const row = Table.find(ss, 'photos', Util.text(p.id));
    if (!row) return { deleted: false };
    Access.assertOwner(ctx, row.uploaderId);
    Table.remove(ss, 'photos', row);
    Storage.trash(row.fileId);
    Storage.forgetThumbnail(row.fileId);
    return { deleted: true };
  },
};
