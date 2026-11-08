const messages = {
  'backup-missing': ['Yedek dosyası bulunamadı. Dosya yolunu kontrol et.', 'Backup file could not be found. Check the file path.'],
  'backup-denied': ['Yedek dosyası okunamadı. Dosya izinlerini kontrol et.', 'Backup file could not be read. Check the file permissions.'],
  'docker-missing': ['Docker komutu bulunamadı. Docker kurulumunu ve PATH ayarını kontrol et.', 'Docker was not found. Check the Docker installation and PATH.'],
  backup: ['Yedek hazırlanamadı. Dosyayı ve boş disk alanını kontrol et.', 'Backup preparation failed. Check the file and available disk space.'],
  setup: ['Test ortamı başlatılamadı. Docker motorunu ve profil ayarlarını kontrol et.', 'Test environment could not start. Check Docker and the profile settings.'],
  restore: ['Geri yükleme durdu. Arşiv biçimini, PostgreSQL sürümünü, rolleri ve eklentileri kontrol et.', 'Restore stopped. Check the archive format, PostgreSQL version, roles, and extensions.'],
  checks: ['Uygulama kontrolleri başarısız oldu veya tamamlanamadı.', 'Application checks failed or could not finish.'],
  interrupted: ['Tatbikat kesildi.', 'The drill was interrupted.'],
};

export function describeFailure(record, lang = 'en') {
  const key = record.diagnostic ?? record.failure;
  return Object.hasOwn(messages, key) ? messages[key][lang === 'tr' ? 0 : 1] : '';
}
