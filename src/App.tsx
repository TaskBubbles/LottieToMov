import React, { useState, useCallback } from 'react';
import { UploadCloud, FileJson, CheckCircle, Loader2, Download, AlertCircle } from 'lucide-react';
import { convertLottieToMov } from './converter';
import JSZip from 'jszip';

type FileItem = {
  id: string;
  file: File;
  status: 'idle' | 'converting' | 'done' | 'error';
  progress: number;
  statusText: string;
  resultBlob?: Blob;
  error?: string;
};

export default function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.name.endsWith('.json'));
    
    const newItems = droppedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'idle' as const,
      progress: 0,
      statusText: 'Ready'
    }));
    
    setFiles(prev => [...prev, ...newItems]);
  }, []);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = (Array.from(e.target.files) as File[]).filter(f => f.name.endsWith('.json'));
    
    const newItems = selectedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'idle' as const,
      progress: 0,
      statusText: 'Ready'
    }));
    
    setFiles(prev => [...prev, ...newItems]);
    e.target.value = '';
  }, []);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const startConversion = async () => {
    setIsConverting(true);
    
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status === 'done') continue;
      
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'converting', progress: 0, statusText: 'Starting...' } : f));
      
      try {
        const blob = await convertLottieToMov(item.file, i, (progress, statusText) => {
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress, statusText } : f));
        });
        
        setFiles(prev => prev.map(f => f.id === item.id ? { 
          ...f, 
          status: 'done', 
          progress: 1, 
          statusText: 'Done',
          resultBlob: blob
        } : f));
      } catch (error: any) {
        setFiles(prev => prev.map(f => f.id === item.id ? { 
          ...f, 
          status: 'error', 
          statusText: 'Error',
          error: error.message 
        } : f));
      }
    }
    
    setIsConverting(false);
  };

  const downloadAll = async () => {
    const doneFiles = files.filter(f => f.status === 'done' && f.resultBlob);
    if (doneFiles.length === 0) return;
    
    if (doneFiles.length === 1) {
      const url = URL.createObjectURL(doneFiles[0].resultBlob!);
      const a = document.createElement('a');
      a.href = url;
      a.download = doneFiles[0].file.name.replace('.json', '.mov');
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    
    const zip = new JSZip();
    doneFiles.forEach(f => {
      zip.file(f.file.name.replace('.json', '.mov'), f.resultBlob!);
    });
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lottie_conversions.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingle = (file: FileItem) => {
    if (!file.resultBlob) return;
    const url = URL.createObjectURL(file.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file.name.replace('.json', '.mov');
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#141414] text-[#E4E3E0] font-sans p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12">
          <h1 className="font-serif italic text-4xl mb-2">Lottie to MOV</h1>
          <p className="font-mono text-sm opacity-60">Batch convert Lottie JSON to ProRes 4444 MOV with Alpha (min 1000x1000)</p>
        </header>
        
        {/* Dropzone */}
        <div 
          onDragOver={e => e.preventDefault()} 
          onDrop={onDrop}
          className="border-2 border-dashed border-[#E4E3E0]/20 rounded-xl p-12 text-center hover:border-[#E4E3E0]/40 transition-colors cursor-pointer relative bg-[#1A1A1A]"
        >
          <input 
            type="file" 
            multiple 
            accept=".json" 
            onChange={onFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <UploadCloud className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium text-lg mb-1">Drop Lottie .json files here</p>
          <p className="font-mono text-xs opacity-50">or click to browse</p>
        </div>
        
        {/* File List */}
        {files.length > 0 && (
          <div className="mt-12">
            <div className="flex justify-between items-end mb-4">
              <h2 className="font-serif italic text-xl">Queue ({files.length})</h2>
              <div className="space-x-4">
                {files.some(f => f.status === 'done') && (
                  <button onClick={downloadAll} className="text-sm font-mono bg-[#E4E3E0] text-[#141414] px-4 py-2 rounded hover:bg-white transition-colors">
                    Download Completed
                  </button>
                )}
                <button 
                  onClick={startConversion} 
                  disabled={isConverting || files.every(f => f.status === 'done')}
                  className="text-sm font-mono bg-[#F27D26] text-white px-4 py-2 rounded hover:bg-[#ff8a33] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConverting ? 'Converting...' : 'Start Conversion'}
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              {files.map(file => (
                <div key={file.id} className="bg-[#1A1A1A] p-4 rounded-lg flex items-center gap-4 border border-white/5">
                  <FileJson className="w-6 h-6 opacity-50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium truncate">{file.file.name}</span>
                      <span className="font-mono text-xs opacity-50">{file.statusText}</span>
                    </div>
                    <div className="h-1 bg-black rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${file.status === 'error' ? 'bg-red-500' : 'bg-[#F27D26]'}`}
                        style={{ width: `${file.progress * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 w-16 justify-end">
                    {file.status === 'done' && (
                      <button onClick={() => downloadSingle(file)} className="text-[#E4E3E0] hover:text-white" title="Download">
                        <Download className="w-5 h-5" />
                      </button>
                    )}
                    {file.status === 'converting' && <Loader2 className="w-5 h-5 animate-spin text-[#F27D26]" />}
                    {file.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" title={file.error} />}
                    {file.status === 'idle' && (
                      <button onClick={() => removeFile(file.id)} className="text-xs font-mono opacity-50 hover:opacity-100">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
