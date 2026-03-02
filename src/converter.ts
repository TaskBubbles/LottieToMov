import lottie from 'lottie-web';
import { getFFmpeg } from './ffmpeg';

export async function convertLottieToMov(
  file: File, 
  fileIndex: number,
  onProgress: (progress: number, status: string) => void
): Promise<Blob> {
  const text = await file.text();
  const jsonData = JSON.parse(text);
  
  const originalW = jsonData.w || 512;
  const originalH = jsonData.h || 512;
  const frameRate = jsonData.fr || 30;
  
  const scale = Math.max(1, 1000 / originalW, 1000 / originalH);
  const newWidth = Math.round(originalW * scale);
  const newHeight = Math.round(originalH * scale);
  
  const container = document.createElement('div');
  container.style.width = `${newWidth}px`;
  container.style.height = `${newHeight}px`;
  container.style.position = 'absolute';
  container.style.top = '-9999px';
  document.body.appendChild(container);
  
  const anim = lottie.loadAnimation({
    container,
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: jsonData,
    rendererSettings: {
      clearCanvas: true,
      dpr: 1
    }
  });
  
  await new Promise(resolve => {
    anim.addEventListener('DOMLoaded', resolve);
  });
  
  const totalFrames = anim.totalFrames;
  const firstFrame = anim.firstFrame;
  
  const canvas = container.querySelector('canvas');
  if (!canvas) {
    anim.destroy();
    document.body.removeChild(container);
    throw new Error('Canvas not found');
  }
  
  const ffmpeg = await getFFmpeg();
  const prefix = `f${fileIndex}_`;
  
  onProgress(0, 'Extracting frames...');
  
  for (let i = 0; i < totalFrames; i++) {
    anim.goToAndStop(firstFrame + i, true);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      const arrayBuffer = await blob.arrayBuffer();
      await ffmpeg.writeFile(`${prefix}frame_${String(i).padStart(4, '0')}.png`, new Uint8Array(arrayBuffer));
    }
    if (i % 5 === 0) {
      onProgress((i / totalFrames) * 0.5, `Extracting frame ${i}/${totalFrames}`);
    }
  }
  
  anim.destroy();
  document.body.removeChild(container);
  
  onProgress(0.5, 'Encoding MOV...');
  
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress(0.5 + progress * 0.5, `Encoding MOV... ${Math.round(progress * 100)}%`);
  };
  ffmpeg.on('progress', progressHandler);
  
  let execResult = await ffmpeg.exec([
    '-framerate', String(frameRate),
    '-i', `${prefix}frame_%04d.png`,
    '-c:v', 'prores_ks',
    '-profile:v', '4444',
    '-pix_fmt', 'yuva444p10le',
    `${prefix}output.mov`
  ]);
  
  if (execResult !== 0) {
    console.warn('ProRes encoding failed, falling back to qtrle');
    execResult = await ffmpeg.exec([
      '-framerate', String(frameRate),
      '-i', `${prefix}frame_%04d.png`,
      '-c:v', 'qtrle',
      '-pix_fmt', 'argb',
      `${prefix}output.mov`
    ]);
  }
  
  ffmpeg.off('progress', progressHandler);
  
  if (execResult !== 0) {
    throw new Error('FFmpeg encoding failed');
  }
  
  const data = await ffmpeg.readFile(`${prefix}output.mov`);
  
  // Cleanup
  for (let i = 0; i < totalFrames; i++) {
    try { await ffmpeg.deleteFile(`${prefix}frame_${String(i).padStart(4, '0')}.png`); } catch (e) {}
  }
  try { await ffmpeg.deleteFile(`${prefix}output.mov`); } catch (e) {}
  
  return new Blob([data], { type: 'video/quicktime' });
}
