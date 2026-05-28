import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Camera } from 'lucide-react';

interface Props {
  onScan: (url: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setScanning(true);
        }
      } catch {
        setError('Camera access denied or unavailable. Try manual entry instead.');
      }
    };
    start();
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (!scanning) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let raf = 0;
    const loop = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        import('jsqr').then(({ default: jsQR }) => {
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (code?.data?.startsWith('otpauth://')) {
            stopCamera();
            onScan(code.data);
            return;
          }
          raf = requestAnimationFrame(loop);
        }).catch(() => {
          raf = requestAnimationFrame(loop);
        });
      } else {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scanning, onScan, stopCamera]);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <button
        onClick={() => { stopCamera(); onClose(); }}
        className="absolute top-4 right-4 p-2 rounded-full bg-[#1a1a1a] text-white hover:bg-[#333]"
      >
        <X size={24} />
      </button>

      <div className="relative w-full max-w-md aspect-square bg-[#111] rounded-xl overflow-hidden border border-[#333]">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-0" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-48 h-48 border-2 border-[#4ade80]/50 rounded-lg">
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#4ade80]" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#4ade80]" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#4ade80]" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#4ade80]" />
          </div>
        </div>
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center">
            <Camera size={48} className="text-[#888] mb-3" />
            <p className="text-[#ef4444] text-sm mb-2">{error}</p>
            <button
              onClick={() => { stopCamera(); onClose(); }}
              className="px-4 py-2 bg-[#1a1a1a] rounded-lg text-white text-sm hover:bg-[#333]"
            >
              Close & Use Manual Entry
            </button>
          </div>
        )}
      </div>
      <p className="mt-4 text-[#888] text-sm">Point camera at QR code</p>
    </div>
  );
}
