import React, { useMemo, useRef, useState } from 'react';

type UploadStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error';

export type UploadItem = {
  id: string;
  file: File;
  progress: number; // 0..100 (upload progress only; not LLM processing)
  status: UploadStatus;
  error?: string;
};

interface UploadSectionProps {
  uploadItems: UploadItem[];
  onSelectFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onStart: (jobDescription: string) => void;
  loading: boolean;
}

const UploadSection: React.FC<UploadSectionProps> = ({
  uploadItems,
  onSelectFiles,
  onRemoveFile,
  onStart,
  loading,
}: UploadSectionProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobDescription, setJobDescription] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);

  const acceptedFilesCount = useMemo(() => uploadItems.length, [uploadItems.length]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length) onSelectFiles(pdfs);
  };

  const canStart = !loading && uploadItems.length > 0 && jobDescription.trim().length > 0;

  return (
    <section className="w-full max-w-3xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <label className="block mb-2 font-semibold text-gray-900 dark:text-gray-100">Job Description</label>
          <textarea
            className="w-full p-3 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            rows={5}
            value={jobDescription}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here..."
            disabled={loading}
          />
        </div>
        <div className="md:w-56 shrink-0">
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">Selected resumes</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{acceptedFilesCount}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF only</div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr,320px]">
        <div
          className={`border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-300 dark:border-gray-600'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragActive(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
            disabled={loading}
          />
          <p className="mb-2 text-gray-900 dark:text-gray-100">
            Drag & drop PDF resumes here, or{' '}
            <span className="text-blue-600 dark:text-blue-400 underline font-medium">browse</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Upload multiple files at once.</p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
          <div className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Queue</div>
          {uploadItems.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">No files selected.</div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {uploadItems.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.file.name}</div>
                      <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                        {item.status === 'queued' && 'Queued'}
                        {item.status === 'uploading' && `Uploading ${item.progress}%`}
                        {item.status === 'processing' && 'Processing (LLM)'}
                        {item.status === 'done' && 'Done'}
                        {item.status === 'error' && 'Failed'}
                      </div>
                      {item.status === 'error' && item.error && (
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1">{item.error}</div>
                      )}
                    </div>
                    <button
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      onClick={() => onRemoveFile(item.id)}
                      disabled={loading}
                      aria-label="Remove file"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500 transition-all"
                      style={{ width: `${item.status === 'done' ? 100 : item.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <button
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          onClick={() => onStart(jobDescription)}
          disabled={!canStart}
        >
          {loading ? 'Screening resumes…' : 'Screen Resumes'}
        </button>
      </div>
    </section>
  );
};

export default UploadSection;
