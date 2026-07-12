import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, X, FileImage, Loader2 } from 'lucide-react';

export default function FileUploader({ files = [], onChange }) {
  const [uploading, setUploading] = useState(false);

  // Створюємо безпечний масив файлів. Якщо files — рядок, то парсимо його, інакше використовуємо як масив.
  const safeFiles = Array.isArray(files)
    ? files
    : (typeof files === 'string' ? JSON.parse(files || '[]') : []);

  const handleUpload = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    setUploading(true);
    const newUrls = [];
    try {
      for (const file of selectedFiles) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        newUrls.push(file_url);
      }
      // Передаємо далі новий об'єднаний масив
      onChange([...safeFiles, ...newUrls]);
    } catch (error) {
      console.error("Помилка завантаження файлу:", error);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = (index) => {
    // Фільтруємо безпечний масив safeFiles
    onChange(safeFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Фото / Файли</h3>
        <div className="relative">
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={uploading}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Завантаження...' : 'Завантажити'}
          </Button>
        </div>
      </div>

      {/* Замінили files.length на safeFiles.length */}
      {safeFiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Замінили files.map на safeFiles.map */}
          {safeFiles.map((url, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border bg-muted aspect-square">
              {typeof url === 'string' && url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileImage className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}