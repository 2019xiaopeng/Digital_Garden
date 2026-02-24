import React, { useState, useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function GlobalClock() {
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(time.getHours()).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#F9FAFB] dark:bg-gray-900 flex flex-col items-center justify-center animate-in fade-in duration-500">
        <button 
          onClick={toggleFullscreen}
          className="absolute top-8 right-8 p-3 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-full hover:bg-gray-200 dark:hover:bg-gray-800"
        >
          <Minimize2 className="w-8 h-8" />
        </button>
        <div className="flex items-baseline gap-4 md:gap-8 font-mono font-bold text-white">
          <div className="bg-black dark:bg-black rounded-3xl p-8 md:p-16 shadow-2xl flex items-center justify-center min-w-[160px] md:min-w-[300px]">
            <span className="text-7xl md:text-[12rem] leading-none tracking-tighter">{hours}</span>
          </div>
          <span className="text-5xl md:text-8xl text-gray-400 dark:text-gray-600 animate-pulse">:</span>
          <div className="bg-black dark:bg-black rounded-3xl p-8 md:p-16 shadow-2xl flex items-center justify-center min-w-[160px] md:min-w-[300px]">
            <span className="text-7xl md:text-[12rem] leading-none tracking-tighter">{minutes}</span>
          </div>
          <div className="bg-black dark:bg-black rounded-2xl p-4 md:p-8 shadow-xl flex items-center justify-center min-w-[100px] md:min-w-[180px] self-end mb-4 md:mb-8">
            <span className="text-4xl md:text-7xl leading-none tracking-tighter text-gray-300">{seconds}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-6 right-6 z-50 flex items-center gap-3 group">
      <div className="flex items-baseline gap-1.5 font-mono font-bold text-white bg-black/90 dark:bg-black backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border border-white/10 transition-transform hover:scale-105">
        <span className="text-xl tracking-tight">{hours}</span>
        <span className="text-gray-400 animate-pulse">:</span>
        <span className="text-xl tracking-tight">{minutes}</span>
        <span className="text-xs text-gray-400 ml-1 tracking-tighter">{seconds}</span>
      </div>
      <button 
        onClick={toggleFullscreen}
        className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white shadow-sm opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0"
        title="全屏时钟"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
}
