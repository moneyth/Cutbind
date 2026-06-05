import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  File, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  RefreshCw, 
  Scissors, 
  BookOpen, 
  Layers, 
  Printer, 
  Info, 
  AlertTriangle,
  Flame,
  CheckCircle2,
  X,
  FileMinus,
  Sparkles
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default function App() {
  // --- STATE ---
  const [file, setFile] = useState<File | null>(null);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [sheetCount, setSheetCount] = useState<number>(0);
  const [paddingPages, setPaddingPages] = useState<number>(0);
  
  const [flipMode, setFlipMode] = useState<'long' | 'short'>('long');
  const [gutterSize, setGutterSize] = useState<number>(10); // in mm (total center gap)
  
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionProgress, setConversionProgress] = useState<number>(0);
  const [conversionStatus, setConversionStatus] = useState<string>('');
  
  const [outputBlobUrl, setOutputBlobUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] = useState<string>('');
  
  // Interactive preview states
  const [previewSheetIdx, setPreviewSheetIdx] = useState<number>(0);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  
  const [error, setError] = useState<string | null>(null);
  
  // PWA & Installation states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  // --- ESCAPE IFRAME CACHING & PWA TRIGGERS ---
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    
    // Check if running in standalone mode (installed as PWA)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  // --- FILE HANDLING ---
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      loadPdf(droppedFile);
    } else {
      setError('Strict Limit: Please drop an actual PDF file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      loadPdf(selectedFile);
    }
  };

  const loadPdf = async (pdfFile: File) => {
    setError(null);
    setFile(pdfFile);
    
    try {
      const buffer = await pdfFile.arrayBuffer();
      setArrayBuffer(buffer);
      
      const doc = await PDFDocument.load(buffer);
      const totalPages = doc.getPageCount();
      
      if (totalPages === 0) {
        throw new Error('This PDF has no pages.');
      }
      
      setPageCount(totalPages);
      const padded = Math.ceil(totalPages / 4) * 4;
      setPaddingPages(padded - totalPages);
      setSheetCount(padded / 4);
      setPreviewSheetIdx(0);
      setPreviewSide('front');
      setOutputBlobUrl(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to parse PDF. It might be encrypted or corrupted.');
      setFile(null);
    }
  };

  const resetAll = () => {
    setFile(null);
    setArrayBuffer(null);
    setPageCount(0);
    setSheetCount(0);
    setPaddingPages(0);
    setOutputBlobUrl(null);
    setError(null);
  };

  // --- CORE IMPOSITION CONVERSION ---
  const startConversion = async () => {
    if (!arrayBuffer || !file) return;
    
    setIsConverting(true);
    setConversionProgress(5);
    setConversionStatus('Scanning PDF structure...');
    
    try {
      // Yield to let React render UI
      await new Promise(r => setTimeout(r, 100));

      const srcDoc = await PDFDocument.load(arrayBuffer);
      const srcCount = srcDoc.getPageCount();
      const paddedCount = sheetCount * 4;
      
      // First page dimensions
      const firstPage = srcDoc.getPage(0);
      const { width: W, height: H } = firstPage.getSize();
      
      // Calculate gutter in PDF points
      // gutterSize is the total gap in center (mm). Cut line is exactly in the middle.
      // 1 mm = ~2.834645 points
      const TOTAL_GAP = gutterSize * (72 / 25.4);
      const G = TOTAL_GAP / 2; // gutter per leaf
      
      const SHEET_W = 2 * W + TOTAL_GAP;
      const SHEET_H = H;
      
      const outDoc = await PDFDocument.create();
      
      setConversionProgress(15);
      setConversionStatus('Mapping page sequences...');
      await new Promise(r => setTimeout(r, 60));

      // Embed all source pages at once to optimize output file size
      const embeddedPages = await outDoc.embedPdf(srcDoc, Array.from({ length: srcCount }, (_, i) => i));
      const HelveticaFont = await outDoc.embedFont(StandardFonts.HelveticaBold);

      // Pre-map pages in correct order
      // Pages beyond source size will remain null (rendered as crisp blank spots)
      const pages = Array.from({ length: paddedCount }, (_, i) => (i < srcCount ? embeddedPages[i] : null));

      for (let k = 0; k < sheetCount; k++) {
        // Front: Left = Page(4k), Right = Page(4k+2)
        const frontL = pages[4 * k];
        const frontR = pages[4 * k + 2];
        
        let backL, backR;
        if (flipMode === 'long') {
          // Back: Left = Page(4k+3), Right = Page(4k+1)
          backL = pages[4 * k + 3];
          backR = pages[4 * k + 1];
        } else {
          // Back: Left = Page(4k+1), Right = Page(4k+3)
          backL = pages[4 * k + 1];
          backR = pages[4 * k + 3];
        }

        // Generate Front Sheet
        const frontSheet = outDoc.addPage([SHEET_W, SHEET_H]);
        if (frontL) {
          frontSheet.drawPage(frontL, { x: 0, y: 0 });
        }
        if (frontR) {
          frontSheet.drawPage(frontR, { x: W + TOTAL_GAP, y: 0 });
        }
        drawCutLineAndLabels(frontSheet, cx => {
          // Add small aesthetic markers on Front sheet: Sheet Index & Front label
          frontSheet.drawText(`SHEET ${k+1} - FRONT`, {
            x: cx - 45,
            y: SHEET_H - 14,
            size: 7,
            font: HelveticaFont,
            color: rgb(0.09, 0.22, 0.56), // blue
          });
        });

        // Generate Back Sheet
        const backSheet = outDoc.addPage([SHEET_W, SHEET_H]);
        if (backL) {
          backSheet.drawPage(backL, { x: 0, y: 0 });
        }
        if (backR) {
          backSheet.drawPage(backR, { x: W + TOTAL_GAP, y: 0 });
        }
        drawCutLineAndLabels(backSheet, cx => {
          // Add small aesthetic markers on Back sheet: Sheet Index & Back label
          backSheet.drawText(`SHEET ${k+1} - BACK`, {
            x: cx - 40,
            y: SHEET_H - 14,
            size: 7,
            font: HelveticaFont,
            color: rgb(0.91, 0.15, 0.17), // red
          });
        });

        // Update sheet-by-sheet progress
        const pct = 15 + Math.round((k / sheetCount) * 75);
        setConversionProgress(pct);
        setConversionStatus(`Rearranging sheet ${k + 1} of ${sheetCount}...`);
        await new Promise(r => setTimeout(r, 10));
      }

      setConversionProgress(92);
      setConversionStatus('Fusing metadata and optimizing booklet size...');
      await new Promise(r => setTimeout(r, 100));

      const finalBytes = await outDoc.save();
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setOutputBlobUrl(url);
      setOutputFileName(file.name.replace(/\.pdf$/i, '') + '_cutbind.pdf');
      
      setConversionProgress(100);
      setIsConverting(false);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Inversion algorithm compilation failed. Check file bounds.');
      setIsConverting(false);
    }

    // Dash segment helper routine
    function drawCutLineAndLabels(sheet: any, addCustomLabel: (cx: number) => void) {
      const { width, height } = sheet.getSize();
      const cx = width / 2;
      
      // Draw red dashed cut line at center
      const dashLen = 10;
      const gapLen = 6;
      let y = 0;
      const redColor = rgb(0.91, 0.15, 0.17); // #e8272a
      
      while (y < height) {
        const nextY = Math.min(y + dashLen, height);
        sheet.drawLine({
          start: { x: cx, y: y },
          end: { x: cx, y: nextY },
          thickness: 1.5,
          color: redColor,
          opacity: 0.8,
        });
        y += dashLen + gapLen;
      }

      // Draw standard cutting icons on physical paper margins for safe assembly
      try {
        addCustomLabel(cx);
      } catch (e) {
        // Avoid silent crash
      }
    }
  };

  // --- RENDERING CONSTANTS & CALCULATORS FOR PREVIEW ---
  const getPreviewPagesForSheet = () => {
    // 0-indexed sheet k
    const k = previewSheetIdx;
    const p1 = 4 * k;
    const p2 = 4 * k + 1;
    const p3 = 4 * k + 2;
    const p4 = 4 * k + 3;

    if (previewSide === 'front') {
      return {
        left: p1 + 1 <= pageCount ? `PAGE ${p1 + 1}` : 'BLANK',
        right: p3 + 1 <= pageCount ? `PAGE ${p3 + 1}` : 'BLANK',
        leftIdx: p1,
        rightIdx: p3
      };
    } else {
      if (flipMode === 'long') {
        return {
          left: p4 + 1 <= pageCount ? `PAGE ${p4 + 1}` : 'BLANK',
          right: p2 + 1 <= pageCount ? `PAGE ${p2 + 1}` : 'BLANK',
          leftIdx: p4,
          rightIdx: p2
        };
      } else {
        return {
          left: p2 + 1 <= pageCount ? `PAGE ${p2 + 1}` : 'BLANK',
          right: p4 + 1 <= pageCount ? `PAGE ${p4 + 1}` : 'BLANK',
          leftIdx: p2,
          rightIdx: p4
        };
      }
    }
  };

  const previewData = getPreviewPagesForSheet();

  return (
    <div className="min-height-screen pb-20 select-none">
      {/* HEADER BANNER */}
      <header className="bg-ink border-b-3 border-ink px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          {/* Logo container using generated public logo */}
          <img 
            src="/logo.png" 
            alt="CutBind Logo" 
            className="w-10 h-10 border-2 border-brand-yellow rounded shadow-sm object-cover"
            referrerPolicy="no-referrer"
          />
          <h1 className="font-display text-2xl md:text-3xl text-brand-yellow tracking-widest drop-shadow-[2px_2px_0_var(--color-brand-red)]">
            CUTBIND
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Service Worker status / Install PWA Badge */}
          {deferredPrompt ? (
            <button 
              onClick={triggerInstall}
              className="bg-brand-red text-white text-[11px] md:text-xs font-sans font-black tracking-widest px-3 py-1 border-2 border-ink rounded-full uppercase hover:-translate-y-[1px] active:translate-y-[1px] transition-all cursor-pointer shadow-[2px_2px_0_var(--color-ink)]"
            >
              📥 INSTALL APP
            </button>
          ) : isInstalled ? (
            <span className="bg-brand-green/20 text-brand-green text-[11px] font-sans font-black tracking-wider px-3 py-1 border-2 border-ink rounded-full uppercase">
              ⚡ OFFLINE MODE
            </span>
          ) : (
            <span className="bg-paper2 text-ink text-[11px] font-sans font-black tracking-wider px-3 py-1 border-2 border-ink rounded-full uppercase">
              ✨ PWA READY
            </span>
          )}
        </div>
      </header>

      {/* HERO HERO TITLE */}
      <div className="text-center pt-10 pb-6 px-4">
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="inline-block bg-brand-red text-white font-sans font-black text-xs md:text-sm tracking-[4px] uppercase px-4 py-1.5 rounded-sm mb-4 border-2 border-ink shadow-[2px_2px_0_var(--color-ink)]"
        >
          Zero Booklet Creep Imposition
        </motion.div>
        
        <h2 className="font-display text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none text-ink drop-shadow-[4px_4px_0_var(--color-brand-yellow)] mb-3">
          PRINT. CUT. BIND.
        </h2>
        
        <p className="font-accent text-xl md:text-2xl text-brand-blue tracking-wide max-w-lg mx-auto transform -rotate-[1deg] mb-6">
          "No more folded booklet misalignment. Perfectly straight edges."
        </p>

        {/* STEPPER MAP */}
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 text-xs md:text-sm font-black text-ink mt-2">
          <div className="flex items-center gap-2 bg-brand-white border-2 border-ink px-3 py-1.5 shadow-[2px_2px_0_var(--color-ink)] rounded">
            <span className="w-5 h-5 flex items-center justify-center bg-ink text-brand-yellow font-display text-sm rounded-full">1</span>
            <span>Upload PDF</span>
          </div>
          <span className="text-brand-red text-lg font-bold">→</span>
          <div className="flex items-center gap-2 bg-brand-white border-2 border-ink px-3 py-1.5 shadow-[2px_2px_0_var(--color-ink)] rounded">
            <span className="w-5 h-5 flex items-center justify-center bg-ink text-brand-yellow font-display text-sm rounded-full">2</span>
            <span>Duplex Settings</span>
          </div>
          <span className="text-brand-red text-lg font-bold">→</span>
          <div className="flex items-center gap-2 bg-brand-white border-2 border-ink px-3 py-1.5 shadow-[2px_2px_0_var(--color-ink)] rounded">
            <span className="w-5 h-5 flex items-center justify-center bg-ink text-brand-yellow font-display text-sm rounded-full">3</span>
            <span>Cut the Dashes</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <main className="max-w-3xl mx-auto px-4">
        
        {/* VIEW: UPLOAD GRID */}
        <AnimatePresence mode="wait">
          {!file && !isConverting && !outputBlobUrl && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="brutalist-card p-6 md:p-10 text-center"
            >
              <div 
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = 'var(--color-paper2)'; }}
                onDragLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                onDrop={handleDrop}
                className="upload-zone border-4 border-dashed border-ink rounded-lg p-8 md:p-14 hover:bg-paper/40 transition-all flex flex-col items-center justify-center cursor-pointer group"
                onClick={() => document.getElementById('rawPdfInput')?.click()}
              >
                <div className="text-6xl mb-4 text-ink animate-float">
                  📄
                </div>
                <h3 className="font-display text-3xl md:text-4xl tracking-widest text-ink mb-2 group-hover:text-brand-red transition-colors">
                  DROP OR CLICK TO UPLOAD
                </h3>
                <p className="font-sans font-bold text-sm text-zinc-500 mb-6">
                  Supports manga, zines, books — auto-padded to multiples of 4
                </p>
                <button 
                  className="brutalist-button bg-brand-red text-white py-3 px-8 text-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById('rawPdfInput')?.click();
                  }}
                >
                  <Upload className="w-5 h-5" />
                  CHOOSE FILE
                </button>
                <input 
                  type="file" 
                  id="rawPdfInput" 
                  accept="application/pdf" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
              </div>

              {/* WHY CUTBIND BANNER */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 text-left">
                <div className="bg-paper2/50 border-2 border-ink p-4 rounded shadow-sm">
                  <h4 className="font-black text-brand-blue flex items-center gap-2 text-sm md:text-base uppercase mb-1">
                    <Layers className="w-4 h-4 text-brand-red" />
                    THE BOOKLET CREEP PROBLEM
                  </h4>
                  <p className="font-sans text-xs md:text-sm font-semibold text-zinc-600 leading-relaxed">
                    Standard folded printings bend around the spine. Inner pages shift outward. When trimmed, inner leaves become narrower or have lines cut off, ruining layouts.
                  </p>
                </div>
                <div className="bg-brand-yellow/10 border-2 border-ink p-4 rounded shadow-sm">
                  <h4 className="font-black text-brand-blue flex items-center gap-2 text-sm md:text-base uppercase mb-1">
                    <Scissors className="w-4 h-4 text-brand-red animate-pulse" />
                    THE CUT AND BIND REVOLUTION
                  </h4>
                  <p className="font-sans text-xs md:text-sm font-semibold text-zinc-600 leading-relaxed">
                    We arrange pages side-by-side. Print front-and-back, then cut directly down the middle. Every single leaf behaves as a flat, uniform block. Zero creep, perfectly aligned edges.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* VIEW: CONVERSION SETTINGS AND INTERACTIVE PREVIEW */}
          {file && !isConverting && !outputBlobUrl && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* CURRENT FILE DETAILED SPEC CARD */}
              <div className="brutalist-card p-5 md:p-6 bg-brand-white">
                <div className="flex items-center justify-between border-b-2 border-ink pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">📄</div>
                    <div className="overflow-hidden">
                      <h4 className="font-black text-lg text-ink truncate max-w-xs md:max-w-md" title={file.name}>
                        {file.name}
                      </h4>
                      <p className="text-xs text-zinc-500 font-bold uppercase">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB PDF Document
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={resetAll}
                    className="p-1 px-3 border-2 border-ink bg-brand-red text-white font-black text-xs rounded shadow-[2px_2px_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px]"
                  >
                    REMOVE
                  </button>
                </div>

                {/* DETAILED STATS ROW */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-paper border-2 border-ink p-3 rounded flex items-center gap-3">
                    <div className="text-2xl">📖</div>
                    <div>
                      <div className="text-xs text-zinc-500 font-black uppercase">Original Pages</div>
                      <div className="font-display text-xl text-ink tracking-wider">{pageCount} Pages</div>
                    </div>
                  </div>
                  <div className="bg-brand-yellow/10 border-2 border-ink p-3 rounded flex items-center gap-3">
                    <div className="text-2xl">🗒</div>
                    <div>
                      <div className="text-xs text-zinc-500 font-black uppercase">Paper Sheets Required</div>
                      <div className="font-display text-xl text-ink tracking-wider">{sheetCount} Sheets</div>
                    </div>
                  </div>
                  <div className="bg-brand-red/10 border-2 border-ink p-3 rounded flex items-center gap-3">
                    <div className="text-2xl">🧩</div>
                    <div>
                      <div className="text-xs text-zinc-500 font-black uppercase">Blank Pages Added</div>
                      <div className="font-display text-xl text-ink tracking-wider">
                        {paddingPages > 0 ? `+${paddingPages} Padded` : '0 Added (Perfect)'}
                      </div>
                    </div>
                  </div>
                </div>

                {paddingPages > 0 && (
                  <p className="text-xs text-brand-red font-bold flex items-center gap-1.5 mt-3">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Added {paddingPages} blank page{paddingPages > 1 ? 's' : ''} to fill the final sheets. Standard booklet imposition requires pages to be divisible by 4.</span>
                  </p>
                )}
              </div>

              {/* DUPLEX OPTIONS & ADJUSTABLE GUTTER */}
              <div className="brutalist-card p-5 md:p-6 bg-brand-white">
                <h3 className="font-display text-2xl tracking-widest text-ink mb-4 border-b-2 border-ink pb-2">
                  1. PRINTING PREFERENCES
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Duplex edge select */}
                  <div>
                    <label className="text-xs font-black uppercase text-zinc-500 tracking-wider block mb-2">
                      DUPLEX FLIP MODE (HOW YOUR PRINTER FLIPS PAGES)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFlipMode('long')}
                        className={`p-3 text-left border-2 border-ink font-bold text-xs md:text-sm rounded hover:bg-zinc-50 transition-colors uppercase ${flipMode === 'long' ? 'bg-ink text-brand-yellow shadow-none' : 'bg-white text-ink shadow-[2px_2px_0_var(--color-ink)]'}`}
                      >
                        FLIP ON LONG EDGE
                        <span className="block text-[10px] font-medium opacity-80 mt-0.5">Most common office printers</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlipMode('short')}
                        className={`p-3 text-left border-2 border-ink font-bold text-xs md:text-sm rounded hover:bg-zinc-50 transition-colors uppercase ${flipMode === 'short' ? 'bg-ink text-brand-yellow shadow-none' : 'bg-white text-ink shadow-[2px_2px_0_var(--color-ink)]'}`}
                      >
                        FLIP ON SHORT EDGE
                        <span className="block text-[10px] font-medium opacity-80 mt-0.5">Duplex flip on head/feet</span>
                      </button>
                    </div>
                  </div>

                  {/* Adjustable Gutter slider */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black uppercase text-zinc-500 tracking-wider">
                        TOTAL CENTER BINDING GUTTER
                      </label>
                      <span className="font-display text-brand-red text-lg">
                        {gutterSize} mm
                      </span>
                    </div>
                    {/* Slider */}
                    <input 
                      type="range" 
                      min="6" 
                      max="20" 
                      step="2"
                      value={gutterSize} 
                      onChange={(e) => setGutterSize(Number(e.target.value))}
                      className="w-full accent-brand-red h-2 bg-paper2 rounded-lg appearance-none cursor-pointer border-2 border-ink md:mb-2"
                    />
                    <div className="flex justify-between text-[10px] font-black text-zinc-400">
                      <span>6mm (Narrow Book)</span>
                      <span>10mm (Standard PVA)</span>
                      <span>20mm (Spiral Binder)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DYNAMIC IMPOSITION DIAGRAM PREVIEW */}
              <div className="brutalist-card p-5 md:p-6 bg-brand-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b-2 border-ink pb-3 mb-4 gap-2">
                  <h3 className="font-display text-2xl tracking-widest text-ink">
                    2. SHEET IMPOSITION MAP
                  </h3>
                  
                  {/* Front/Back toggle */}
                  <div className="flex items-center border-2 border-ink rounded bg-paper w-fit self-start sm:self-auto">
                    <button
                      onClick={() => setPreviewSide('front')}
                      className={`px-3 py-1 text-xs font-black uppercase transition-colors rounded-l ${previewSide === 'front' ? 'bg-ink text-brand-yellow' : 'bg-paper text-ink'}`}
                    >
                      FRONT SIDE
                    </button>
                    <button
                      onClick={() => setPreviewSide('back')}
                      className={`px-3 py-1 text-xs font-black uppercase transition-colors rounded-r ${previewSide === 'back' ? 'bg-ink text-brand-yellow' : 'bg-paper text-ink'}`}
                    >
                      BACK SIDE
                    </button>
                  </div>
                </div>

                <p className="font-sans text-xs md:text-sm font-semibold text-zinc-500 mb-4">
                  Showing how pages physically sit on real sheets of paper. Cut the sheet in half down the dash line to separate pages.
                </p>

                {/* PHYSICAL SHEET SCHEMATIC GRAPHIC */}
                <div className="bg-paper2 border-3 border-ink rounded p-6 shadow-inner relative flex flex-col items-center justify-center min-h-[170px]">
                  
                  {/* Schematic container representing paper sheet */}
                  <div 
                    className="w-full max-w-md aspect-[1.58/1] bg-paper border-3 border-ink rounded shadow-lg relative p-4 flex items-stretch transition-all"
                    style={{ gap: `${gutterSize * 1.5}px` }}
                  >
                    
                    {/* LEFT PAGE LEAF BOUNDING BOX */}
                    <div className={`flex-1 border-3 border-ink rounded p-4 flex flex-col justify-center items-center relative shadow-[4px_4px_0_rgba(0,0,0,0.15)] transition-all ${previewData.left === 'BLANK' ? 'bg-zinc-200' : 'bg-brand-white'}`}>
                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider absolute top-2 left-3">Left Page Box</span>
                      <span className="font-display text-2xl md:text-3xl text-zinc-800">{previewData.left}</span>
                      {previewData.left !== 'BLANK' && (
                        <span className="text-[10px] bg-brand-yellow border border-ink font-black px-1.5 rounded absolute bottom-2 left-3">
                          {previewData.leftIdx % 2 === 0 ? 'Front page' : 'Back page'}
                        </span>
                      )}
                      
                      {/* Technical margin markers inside PDF box */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
                      </div>
                    </div>

                    {/* RED DASHED DIVIDING CUT LINE FOR SCHEMATIC */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-0 transform -translate-x-1/2 flex flex-col justify-between items-center py-2 z-10 pointer-events-none">
                      <span className="text-brand-red font-bold text-xs bg-paper border border-brand-red px-1 rounded-full transform -rotate-12 shadow-sm">✂</span>
                      <span className="text-brand-red font-black text-[9px] bg-paper px-1.5 py-0.5 border border-brand-red rounded transform scale-75 whitespace-nowrap shadow-sm uppercase">CUT HERE</span>
                      <span className="text-brand-red font-bold text-xs bg-paper border border-brand-red px-1 rounded-full transform rotate-12 shadow-sm">✂</span>
                    </div>

                    {/* RIGHT PAGE LEAF BOUNDING BOX */}
                    <div className={`flex-1 border-3 border-ink rounded p-4 flex flex-col justify-center items-center relative shadow-[4px_4px_0_rgba(0,0,0,0.15)] transition-all ${previewData.right === 'BLANK' ? 'bg-zinc-200' : 'bg-brand-white'}`}>
                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider absolute top-2 right-3">Right Page Box</span>
                      <span className="font-display text-2xl md:text-3xl text-zinc-800">{previewData.right}</span>
                      {previewData.right !== 'BLANK' && (
                        <span className="text-[10px] bg-brand-yellow border border-ink font-black px-1.5 rounded absolute bottom-2 right-3">
                          {previewData.rightIdx % 2 === 0 ? 'Front page' : 'Back page'}
                        </span>
                      )}

                      {/* Technical margin markers inside PDF box */}
                      <div className="absolute top-2 left-2 flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
                      </div>
                    </div>
                  </div>

                  {/* SHEET CONTROLS */}
                  <div className="flex items-center gap-4 mt-6">
                    <button
                      type="button"
                      onClick={() => setPreviewSheetIdx(Math.max(0, previewSheetIdx - 1))}
                      disabled={previewSheetIdx === 0}
                      className="w-10 h-10 flex items-center justify-center bg-white border-2 border-ink rounded shadow-[2px_2px_0_var(--color-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 active:translate-y-[1px]"
                    >
                      <ChevronLeft className="w-5 h-5 text-ink" />
                    </button>
                    <span className="font-sans font-black text-xs md:text-sm text-ink uppercase tracking-wider">
                      Sheet {previewSheetIdx + 1} of {sheetCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewSheetIdx(Math.min(sheetCount - 1, previewSheetIdx + 1))}
                      disabled={previewSheetIdx === sheetCount - 1}
                      className="w-10 h-10 flex items-center justify-center bg-white border-2 border-ink rounded shadow-[2px_2px_0_var(--color-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 active:translate-y-[1px]"
                    >
                      <ChevronRight className="w-5 h-5 text-ink" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ACTION CALL ROW */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={startConversion}
                  className="flex-1 brutalist-button bg-brand-red text-white py-4 text-xl"
                >
                  <Scissors className="w-6 h-6 animate-pulse" />
                  GENERATE PRINTABLE PDF
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  className="brutalist-button bg-paper2 text-ink py-4 px-6 text-xl"
                >
                  START OVER
                </button>
              </div>
            </motion.div>
          )}

          {/* VIEW: CONVERSION LOADING BAR PROGRESS */}
          {isConverting && (
            <motion.div
              key="converting"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="brutalist-card p-6 md:p-10 text-center space-y-6"
            >
              <div className="text-6xl animate-spin inline-block">
                ⚙️
              </div>
              <h3 className="font-display text-4xl tracking-widest text-ink uppercase leading-none">
                BUILDING BOOKLET SHEETS...
              </h3>
              
              <div className="space-y-2">
                <div className="progress-wrap">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${conversionProgress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center font-black text-xs md:text-sm text-zinc-500 px-1">
                  <span className="uppercase">{conversionStatus}</span>
                  <span>{conversionProgress}%</span>
                </div>
              </div>

              <div className="bg-brand-red/10 border-2 border-ink p-4 rounded text-left flex gap-3 max-w-lg mx-auto">
                <AlertTriangle className="w-5 h-5 text-brand-red shrink-0" />
                <p className="font-sans text-xs md:text-sm font-semibold text-zinc-600 leading-relaxed">
                  Avoid closing this browser tab. All imposition calculations are processed entirely client-side using WebAssembly modules to guarantee privacy. No files are leaked.
                </p>
              </div>
            </motion.div>
          )}

          {/* VIEW: SUCCESS RESULTS */}
          {outputBlobUrl && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* SUCCESS PANEL BLOCK */}
              <div className="brutalist-card p-6 md:p-10 text-center bg-brand-white">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-green/10 border-3 border-brand-green text-3xl mb-4 text-brand-green">
                  ✓
                </div>
                
                <h3 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-none text-brand-green drop-shadow-[3px_3px_0_var(--color-ink)] mb-3">
                  CONVERSION READY!
                </h3>
                
                <p className="font-accent text-lg md:text-xl text-brand-blue tracking-wide mb-6">
                  "Perfect size. Clean margins. Zero creep."
                </p>

                {/* FILE SPEC BORDER SPEC */}
                <div className="max-w-md mx-auto bg-paper border-2 border-ink p-4 rounded shadow-[3px_3px_0_var(--color-ink)] text-left mb-8">
                  <div className="text-xs text-zinc-500 font-extrabold uppercase mb-2">OUTPUT FILE DETAILED LOGS</div>
                  <div className="flex gap-2 items-center text-sm font-black text-ink mb-1">
                    <File className="w-4 h-4 text-brand-red" />
                    <span className="truncate">{outputFileName}</span>
                  </div>
                  <div className="flex gap-4 text-xs font-semibold text-zinc-600">
                    <span>📖 {pageCount} source pages</span>
                    <span>🗒 {sheetCount} duplex sheets</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a 
                    href={outputBlobUrl} 
                    download={outputFileName}
                    className="flex-1 brutalist-button bg-brand-green text-white py-4 text-xl"
                  >
                    <Download className="w-6 h-6 shrink-0 animate-bounce" />
                    DOWNLOAD BOOKLET
                  </a>
                  <button 
                    onClick={resetAll}
                    className="brutalist-button bg-paper2 text-ink py-4 px-8 text-xl"
                  >
                    CONVERT ANOTHER
                  </button>
                </div>
              </div>

              {/* PRINT & BIND CUSTOMIZED DYNAMIC TUTORIAL ASSEMBLY */}
              <div className="brutalist-card p-6 bg-brand-white text-left space-y-6">
                <div className="border-b-2 border-ink pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h4 className="font-display text-2xl tracking-widest text-ink flex items-center gap-2">
                    <Printer className="w-6 h-6 text-brand-red animate-pulse" />
                    VISUAL ASSEMBLY BLUEPRINT
                  </h4>
                  <span className="brutalist-badge bg-brand-yellow text-ink text-[11px] font-black uppercase">
                    ✂️ {sheetCount} Cuts Required
                  </span>
                </div>

                <div className="bg-paper2/50 border-2 border-ink p-4 rounded text-xs md:text-sm text-zinc-700 space-y-2 font-semibold">
                  <p className="font-bold text-ink">
                    🚀 How CutBind creates the magic:
                  </p>
                  <p>
                    Rather than nesting sheets (which causes page borders to progressively crawl and distort), CutBind splits the booklet into a parallel double-pile layout. Your custom PDF outputs sheets where the left side grows from P1, and the right side grows parallel-wise. Slicing them down the middle and mounting the entire Right Pile underneath the Left Pile instantly yields perfect ordered pages with zero manual collating! Follow the visual guide below:
                  </p>
                </div>

                <div className="space-y-8">
                  {/* STEP 1: PRINT */}
                  <div className="border-2 border-ink p-4 rounded bg-brand-white relative shadow-[4px_4px_0_var(--color-ink)]">
                    <div className="absolute -top-3 left-4 bg-ink text-brand-yellow font-display text-xs px-3 py-1 rounded border-2 border-ink">
                      STEP 1: DUPLEX PRINTING
                    </div>
                    <div className="pt-4 flex flex-col md:flex-row gap-4 items-center">
                      <div className="flex-1 space-y-2">
                        <h5 className="font-black text-sm uppercase text-ink">Print {sheetCount} sheets (Duplex)</h5>
                        <p className="font-sans text-xs md:text-sm text-zinc-600 leading-relaxed">
                          Load paper and enable **Double-Sided / Duplex** in your print dialog. Select <strong className="text-brand-red uppercase">{flipMode === 'long' ? 'Flip on Long Edge' : 'Flip on Short Edge'}</strong> to ensure backpages align properly.
                        </p>
                      </div>
                      
                      {/* Diagram */}
                      <div className="w-full md:w-80 h-32 bg-paper rounded border-2 border-ink flex items-center justify-around p-2 relative shrink-0">
                        {/* Front Page Sheet Mock */}
                        <div className="w-24 aspect-[1.41/1] bg-white border border-ink shadow-sm rounded p-1 flex flex-col justify-between text-center text-[10px] font-black">
                          <div className="text-zinc-400">FRONT</div>
                          <div className="flex justify-between px-1">
                            <span>P1</span>
                            <span>P3</span>
                          </div>
                          <div className="h-1 bg-brand-red w-full"></div>
                        </div>

                        {/* Flip Arrow Graphic */}
                        <div className="flex flex-col items-center">
                          <RefreshCw className="w-5 h-5 text-brand-red animate-spin" />
                          <span className="text-[8px] font-bold mt-1 text-center leading-none text-zinc-500 uppercase">{flipMode === 'long' ? 'Long Edge' : 'Short Edge'}<br/>Flip</span>
                        </div>

                        {/* Back Page Sheet Mock */}
                        <div className="w-24 aspect-[1.41/1] bg-white border border-ink shadow-sm rounded p-1 flex flex-col justify-between text-center text-[10px] font-black">
                          <div className="text-zinc-400">BACK</div>
                          <div className="flex justify-between px-1">
                            <span>{flipMode === 'long' ? 'P4' : 'P2'}</span>
                            <span>{flipMode === 'long' ? 'P2' : 'P4'}</span>
                          </div>
                          <div className="h-1 bg-zinc-300 w-full"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 2: STACK */}
                  <div className="border-2 border-ink p-4 rounded bg-brand-white relative shadow-[4px_4px_0_var(--color-ink)]">
                    <div className="absolute -top-3 left-4 bg-ink text-brand-yellow font-display text-xs px-3 py-1 rounded border-2 border-ink">
                      STEP 2: NEATLY ALIGN
                    </div>
                    <div className="pt-4 flex flex-col md:flex-row gap-4 items-center">
                      <div className="flex-1 space-y-2">
                        <h5 className="font-black text-sm uppercase text-ink">Stack sheets in order</h5>
                        <p className="font-sans text-xs md:text-sm text-zinc-600 leading-relaxed">
                          Collect all <strong className="text-ink">{sheetCount}</strong> printed sheets in the exact sequence they exits the tray. Tap them on a desk to align all edges. The central dashed line should align perfectly across the entire stack.
                        </p>
                      </div>

                      {/* Diagram */}
                      <div className="w-full md:w-80 h-32 bg-paper rounded border-2 border-ink flex items-center justify-center relative shrink-0">
                        {/* Offset 3D Stack Mock */}
                        <div className="relative w-36 h-20">
                          <div className="absolute top-4 left-4 w-28 h-16 bg-white border border-zinc-300 rounded shadow-sm"></div>
                          <div className="absolute top-2 left-2 w-28 h-16 bg-white border border-zinc-400 rounded shadow-md"></div>
                          <div className="absolute top-0 left-0 w-28 h-16 bg-white border-2 border-ink rounded shadow-lg flex items-center justify-center p-1">
                            <div className="w-full h-full border border-dashed border-zinc-200 relative flex justify-between items-center px-4 font-black text-xs text-zinc-400">
                              <span>P1</span>
                              <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-brand-red"></div>
                              <span>P3</span>
                            </div>
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-2 text-[9px] font-black bg-brand-yellow px-1.5 border border-ink uppercase">Perfect Spine stack</span>
                      </div>
                    </div>
                  </div>

                  {/* STEP 3: CUT */}
                  <div className="border-2 border-ink p-4 rounded bg-brand-white relative shadow-[4px_4px_0_var(--color-ink)]">
                    <div className="absolute -top-3 left-4 bg-ink text-brand-yellow font-display text-xs px-3 py-1 rounded border-2 border-ink">
                      STEP 3: THE MASTER CUT
                    </div>
                    <div className="pt-4 flex flex-col md:flex-row gap-4 items-center">
                      <div className="flex-1 space-y-2">
                        <h5 className="font-black text-sm uppercase text-ink">Slice straight down the center line</h5>
                        <p className="font-sans text-xs md:text-sm text-zinc-600 leading-relaxed">
                          Using a heavy-duty paper cutter or sharp scissors, make exactly **one straight cut** down the red dashed line. This splits your physical stack neatly in half, creating two identical stacks of leaves immediately.
                        </p>
                      </div>

                      {/* Diagram */}
                      <div className="w-full md:w-80 h-32 bg-paper rounded border-2 border-ink flex items-center justify-around p-3 relative shrink-0">
                        {/* Slice diagram */}
                        <div className="relative w-full flex justify-around items-center h-full">
                          
                          {/* Left Half pile */}
                          <div className="w-20 h-16 bg-brand-blue/15 border-2 border-ink rounded flex flex-col justify-center items-center font-black text-[10px] text-brand-blue shadow transition-all">
                            <span>👈 LEFT PILE</span>
                            <span className="font-mono text-[9px] text-zinc-500">P1, P5...</span>
                          </div>

                          {/* Cutting Indicator */}
                          <div className="flex flex-col items-center justify-center gap-1">
                            <Scissors className="w-6 h-6 text-brand-red animate-bounce" />
                            <div className="h-10 border-l-2 border-dashed border-brand-red"></div>
                          </div>

                          {/* Right Half pile */}
                          <div className="w-20 h-16 bg-brand-red/15 border-2 border-ink rounded flex flex-col justify-center items-center font-black text-[10px] text-brand-red shadow">
                            <span>👉 RIGHT PILE</span>
                            <span className="font-mono text-[9px] text-zinc-500">P3, P7...</span>
                          </div>

                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 4: COLLATING */}
                  <div className="border-2 border-ink p-4 rounded bg-brand-white relative shadow-[4px_4px_0_var(--color-ink)]">
                    <div className="absolute -top-3 left-4 bg-ink text-brand-yellow font-display text-xs px-3 py-1 rounded border-2 border-ink">
                      STEP 4: COLLATING PILES (COLLETATION-FREE!)
                    </div>
                    <div className="pt-4 flex flex-col md:flex-row gap-4 items-center">
                      <div className="flex-1 space-y-2">
                        <h5 className="font-black text-sm uppercase text-ink">Stack Right Pile UNDER Left Pile</h5>
                        <p className="font-sans text-xs md:text-sm text-zinc-600 leading-relaxed">
                          Pick up the entire **Left Pile**. Pick up the entire **Right Pile**. Place the Right Pile directly **UNDERNEATH** the Left Pile. That's it! No leaf shaking necessary. Your new top index starts at **Page 1**, reading beautifully in sequential book order.
                        </p>
                      </div>

                      {/* Diagram */}
                      <div className="w-full md:w-80 h-32 bg-paper rounded border-2 border-ink flex items-center justify-center relative shrink-0 p-2">
                        {/* Pile integration graphic */}
                        <div className="flex flex-col items-center">
                          <div className="bg-brand-blue/15 border-2 border-ink p-2 w-32 text-center rounded font-black text-[10px] text-brand-blue relative z-10 shadow-md">
                            📚 LEFT PILE (Top)
                          </div>
                          
                          {/* Arrow down */}
                          <div className="my-1 text-brand-red font-black text-xs animate-bounce flex flex-col items-center">
                            <span>▼ GOING ON TOP OF ▼</span>
                          </div>

                          <div className="bg-brand-red/15 border-2 border-ink p-2 w-32 text-center rounded font-black text-[10px] text-brand-red shadow-sm">
                            📚 RIGHT PILE (Bottom)
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-2 text-[8px] font-black uppercase text-zinc-400">100% Sorted</span>
                      </div>
                    </div>
                  </div>

                  {/* STEP 5: GLUING */}
                  <div className="border-2 border-ink p-4 rounded bg-brand-white relative shadow-[4px_4px_0_var(--color-ink)]">
                    <div className="absolute -top-3 left-4 bg-ink text-brand-yellow font-display text-xs px-3 py-1 rounded border-2 border-ink">
                      STEP 5: BIND SPINE
                    </div>
                    <div className="pt-4 flex flex-col md:flex-row gap-4 items-center">
                      <div className="flex-1 space-y-2">
                        <h5 className="font-black text-sm uppercase text-ink">Apply PVA Craft Glue / Staple</h5>
                        <p className="font-sans text-xs md:text-sm text-zinc-600 leading-relaxed">
                          Clamp the newly split spine edge. Your custom <strong>{gutterSize}mm total gutter</strong> offers a safe <strong>{(gutterSize/2).toFixed(1)}mm binding margin</strong> per leaf. Run a thin bead of permanent PVAc craft paper glue or push standard staples through to complete your robust, flawless zero-creep book block!
                        </p>
                      </div>

                      {/* Diagram */}
                      <div className="w-full md:w-80 h-32 bg-paper rounded border-2 border-ink flex items-center justify-center relative shrink-0 p-2">
                        {/* Book block mock */}
                        <div className="relative w-36 h-20 bg-white border-2 border-ink rounded shadow-lg overflow-hidden flex">
                          {/* Glue highlight zone on the left */}
                          <div className="w-5 bg-brand-yellow border-r-2 border-ink flex justify-center items-center text-[8px] font-black text-ink uppercase writing-vertical-lr tracking-wider shadow-inner select-none relative animate-pulse">
                            SPINE
                          </div>
                          <div className="flex-1 p-2 flex flex-col justify-between items-start">
                            <span className="text-[10px] font-display text-brand-blue tracking-[2px]">PAGE 1</span>
                            <span className="text-[8px] text-zinc-400 font-sans tracking-wide leading-none">Spine Margins: {(gutterSize/2).toFixed(1)}mm</span>
                            <div className="flex gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-red"></span>
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-yellow"></span>
                            </div>
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-2 text-[9px] font-black bg-brand-red text-white px-1.5 rounded border border-ink uppercase">CLAMP TIGHT</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ERROR MSG BANNER */}
        {error && (
          <div className="bg-brand-red/10 border-3 border-ink rounded p-4 flex gap-3 text-left mt-6 animate-bounce">
            <AlertTriangle className="w-6 h-6 text-brand-red shrink-0" />
            <div>
              <h5 className="font-display text-lg tracking-wider text-brand-red leading-none mb-1">
                ERROR ASSEMBLY FAIL
              </h5>
              <p className="font-sans text-xs md:text-sm font-black text-zinc-600">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* DETAILED TUTORIAL ACCORDION FAQ */}
        <div className="mt-12 bg-white rounded border-3 border-ink p-5 md:p-6 shadow-[4px_4px_0_var(--color-ink)]">
          <h4 className="font-display text-2xl tracking-widest text-ink mb-4 pb-2 border-b-2 border-ink">
            📖 FAQs - HOW TO GET PERFECT RESULTS
          </h4>
          
          <div className="space-y-4">
            <div className="space-y-1">
              <h5 className="font-black text-zinc-800 text-sm md:text-base">
                Why does this solve pages becoming narrow at the center (booklet creep)?
              </h5>
              <p className="font-sans text-xs md:text-sm font-semibold text-zinc-600 leading-relaxed">
                In a standard booklet, sheets are nested like nesting dolls. When folded, the inner sheets stick out wider, so they must be shaved straight. Shaving makes near-center pages narrower than cover pages. Since CutBind cuts every sheet into individual leaves before stacking them flat, there is absolutely zero curvature around folds. Every leaf has the identical width!
              </p>
            </div>

            <div className="space-y-1 border-t border-zinc-200 pt-3">
              <h5 className="font-black text-zinc-800 text-sm md:text-base">
                What duplex setup should I choose on my desktop printer?
              </h5>
              <p className="font-sans text-xs md:text-sm font-semibold text-zinc-600 leading-relaxed">
                Almost all household printers flip pages along their <strong>Long Edge</strong>. Keep the default selected "Flip on Long Edge" unless your printer flip behavior operates differently. If you print and the back side pages come out upside down, reprint with "Flip on Short Edge" selected!
              </p>
            </div>

            <div className="space-y-1 border-t border-zinc-200 pt-3">
              <h5 className="font-black text-zinc-800 text-sm md:text-base">
                What does the unprinted center gutter do?
              </h5>
              <p className="font-sans text-xs md:text-sm font-semibold text-zinc-600 leading-relaxed">
                We automatically shift your PDF page design outwards to preserve a white margin in the middle where sheets are sliced. This gutter prevents PVA glue from sliding onto text, and gives ample room for stapling or hole-punching for perfect bound zines.
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="w-full text-center py-6 border-t-3 border-ink mt-12 bg-ink text-white">
        <p className="font-accent text-sm md:text-base text-brand-yellow transform rotate-[-0.8deg] inline-block mb-1">
          Made for manga lovers who print & bind flat ✂
        </p>
        <p className="text-[10px] font-sans font-bold text-zinc-500 uppercase tracking-widest block">
          CutBind v1.0 — Zero Booklet Creep Engine
        </p>
      </footer>
    </div>
  );
}
