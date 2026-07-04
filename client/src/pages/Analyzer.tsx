import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileText, Loader2, X, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import ResultsTable, { AnalysisResult } from '@/components/ResultsTable';
import './Analyzer.css';

const ACCEPTED_FORMATS = ['SVG', 'PDF', 'AI', 'EPS'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function Analyzer() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.analyze.upload.useMutation();

  // Load results from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vector-detector-results');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setResults(parsed);
        if (parsed.length > 0) {
          setSelectedResult(parsed[0]);
        }
      } catch (e) {
        console.error('Failed to load saved results:', e);
      }
    }
  }, []);

  // Save results to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('vector-detector-results', JSON.stringify(results));
  }, [results]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File, uploadingFileId: string) => {
    // Validate file type
    const ext = file.name.split('.').pop()?.toUpperCase();
    if (!ext || !ACCEPTED_FORMATS.includes(ext)) {
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFileId
            ? {
                ...f,
                status: 'error',
                error: 'Invalid format. Accepted: SVG, PDF, AI, EPS',
              }
            : f
        )
      );
      toast.error(`${file.name}: Invalid format`);
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFileId
            ? {
                ...f,
                status: 'error',
                error: 'File too large. Max 50MB',
              }
            : f
        )
      );
      toast.error(`${file.name}: File too large`);
      return;
    }

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFileId ? { ...f, status: 'uploading', progress: 0 } : f
        )
      );

      // Simulate upload progress
      progressInterval = setInterval(() => {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFileId && f.progress < 90
              ? { ...f, progress: f.progress + Math.random() * 30 }
              : f
          )
        );
      }, 200);

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      if (progressInterval) clearInterval(progressInterval);

      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: uint8Array,
      });

      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFileId ? { ...f, status: 'success', progress: 100 } : f
        )
      );

      const newResult: AnalysisResult = {
        id: uploadingFileId,
        fileName: result.fileName,
        fileSize: result.fileSize,
        uploadTime: new Date(result.uploadedAt),
        fileType: result.fileType,
        verdict: result.verdict,
        explanation: result.explanation,
        hasVectorElements: result.hasVectorElements,
        hasRasterElements: result.hasRasterElements,
      };

      setResults(prev => [newResult, ...prev]);
      setSelectedResult(newResult);
      toast.success(`${file.name}: ${result.verdict}`);
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFileId
            ? { ...f, status: 'error', error: errorMessage }
            : f
        )
      );
      toast.error(`${file.name}: ${errorMessage}`);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect({ currentTarget: { files } } as any);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    const newUploadingFiles: UploadingFile[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    setUploadingFiles(prev => [...newUploadingFiles, ...prev]);

    // Process files sequentially
    newUploadingFiles.forEach(uploadingFile => {
      processFile(uploadingFile.file, uploadingFile.id);
    });
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all results? This cannot be undone.')) {
      setResults([]);
      setSelectedResult(null);
      setUploadingFiles([]);
      toast.success('History cleared');
    }
  };

  const handleDeleteResult = (id: string) => {
    setResults(prev => prev.filter(r => r.id !== id));
    if (selectedResult?.id === id) {
      setSelectedResult(results.find(r => r.id !== id) || null);
    }
    toast.success('Result removed');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'True Vector':
        return 'text-emerald-600';
      case 'Raster in Vector Container':
        return 'text-amber-600';
      case 'Mixed Content':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const getVerdictBgColor = (verdict: string) => {
    switch (verdict) {
      case 'True Vector':
        return 'bg-emerald-50 border-emerald-200';
      case 'Raster in Vector Container':
        return 'bg-amber-50 border-amber-200';
      case 'Mixed Content':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'True Vector':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'Raster in Vector Container':
        return <AlertCircle className="w-5 h-5 text-amber-600" />;
      case 'Mixed Content':
        return <FileText className="w-5 h-5 text-blue-600" />;
      default:
        return <FileText className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light tracking-tight text-slate-900 mb-3">
            Vector Artwork Detector
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Instantly check whether your artwork is a true vector graphic or a raster image wrapped in a vector container.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-2">
            {/* Upload Area */}
            <Card
              className={`border-2 border-dashed transition-all duration-300 cursor-pointer ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 shadow-lg'
                  : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="p-12 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="p-3 bg-slate-100 rounded-full">
                    <Upload className="w-6 h-6 text-slate-600" />
                  </div>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  Drop your files here
                </h3>
                <p className="text-slate-600 mb-4">
                  or click to browse
                </p>
                <p className="text-sm text-slate-500">
                  Supported formats: SVG, PDF, AI, EPS • Max 50MB per file
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".svg,.pdf,.ai,.eps"
                onChange={handleFileSelect}
                className="hidden"
              />
            </Card>

            {/* Uploading Files */}
            {uploadingFiles.length > 0 && (
              <Card className="mt-6 p-4">
                <h3 className="font-semibold text-slate-900 mb-4">Upload Progress</h3>
                <div className="space-y-3">
                  {uploadingFiles.map(uploadingFile => (
                    <div key={uploadingFile.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 truncate">
                          {uploadingFile.file.name}
                        </span>
                        <div className="flex items-center gap-2">
                          {uploadingFile.status === 'pending' && (
                            <span className="text-xs text-slate-500">Pending</span>
                          )}
                          {uploadingFile.status === 'uploading' && (
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                          )}
                          {uploadingFile.status === 'success' && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                          {uploadingFile.status === 'error' && (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            uploadingFile.status === 'success'
                              ? 'bg-emerald-500'
                              : uploadingFile.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-blue-500'
                          }`}
                          style={{ width: `${uploadingFile.progress}%` }}
                        />
                      </div>
                      {uploadingFile.error && (
                        <p className="text-xs text-red-600">{uploadingFile.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Results Display */}
            {selectedResult && (
              <Card className="mt-8 overflow-hidden">
                <div className={`border-l-4 p-6 ${getVerdictBgColor(selectedResult.verdict)}`}>
                  <div className="flex items-start gap-4">
                    <div className="pt-1">{getVerdictIcon(selectedResult.verdict)}</div>
                    <div className="flex-1">
                      <h3 className={`text-2xl font-semibold mb-2 ${getVerdictColor(selectedResult.verdict)}`}>
                        {selectedResult.verdict}
                      </h3>
                      <p className="text-slate-700 leading-relaxed mb-4">
                        {selectedResult.explanation}
                      </p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-slate-600">File Name</p>
                          <p className="font-medium text-slate-900 break-all">{selectedResult.fileName}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">File Type</p>
                          <p className="font-medium text-slate-900">{selectedResult.fileType}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">File Size</p>
                          <p className="font-medium text-slate-900">{formatFileSize(selectedResult.fileSize)}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Analyzed</p>
                          <p className="font-medium text-slate-900">{formatDate(selectedResult.uploadTime)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Results Table */}
            {results.length > 0 && (
              <ResultsTable
                results={results}
                onDelete={handleDeleteResult}
                onClearAll={handleClearHistory}
              />
            )}
          </div>

          {/* History Sidebar */}
          <div>
            <Card className="sticky top-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-slate-600" />
                    <h3 className="text-lg font-semibold text-slate-900">Session History</h3>
                  </div>
                  {results.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      className="p-1 hover:bg-slate-100 rounded transition-colors"
                      title="Clear history"
                    >
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  )}
                </div>

                {results.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    No files analyzed yet. Upload a file to get started.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {results.map(result => (
                      <button
                        key={result.id}
                        onClick={() => setSelectedResult(result)}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          selectedResult?.id === result.id
                            ? 'bg-blue-50 border border-blue-200 shadow-sm'
                            : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="pt-0.5">{getVerdictIcon(result.verdict)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 text-sm truncate">
                              {result.fileName}
                            </p>
                            <p className={`text-xs font-semibold ${getVerdictColor(result.verdict)}`}>
                              {result.verdict}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {formatFileSize(result.fileSize)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6">
            <h4 className="font-semibold text-slate-900 mb-2">True Vector</h4>
            <p className="text-slate-600 text-sm">
              Contains actual vector drawing elements like paths, shapes, and text. Scales perfectly to any size without quality loss.
            </p>
          </Card>
          <Card className="p-6">
            <h4 className="font-semibold text-slate-900 mb-2">Raster in Vector</h4>
            <p className="text-slate-600 text-sm">
              A raster image (pixels) saved inside a vector file format. Scaling will result in pixelation and quality loss.
            </p>
          </Card>
          <Card className="p-6">
            <h4 className="font-semibold text-slate-900 mb-2">Mixed Content</h4>
            <p className="text-slate-600 text-sm">
              Contains both vector elements and embedded raster images. Scaling vector parts works, but raster parts will pixelate.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
