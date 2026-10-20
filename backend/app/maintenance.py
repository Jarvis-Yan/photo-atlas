import os,shutil,time


def cleanup_expired_uploads(db,config):
    """Remove only expired temporary chunks, with one hour grace for in-flight requests."""
    if config.required_mount and not os.path.ismount(config.required_mount):return 0
    root=(config.data/'uploads').resolve();removed=0
    for row in db.all("SELECT id FROM uploads WHERE status IN ('receiving','cancelled') AND expires<? AND photo_id IS NULL LIMIT 100",(time.time()-3600,)):
        directory=(root/row['id']).resolve()
        if directory.parent!=root:continue
        shutil.rmtree(directory,ignore_errors=False) if directory.exists() else None
        with db.connect() as conn:
            conn.execute('DELETE FROM upload_chunks WHERE upload_id=?',(row['id'],))
            conn.execute("DELETE FROM uploads WHERE id=? AND status IN ('receiving','cancelled')",(row['id'],))
        removed+=1
    return removed
