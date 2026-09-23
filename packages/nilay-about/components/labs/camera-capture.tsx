'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuCamera, LuCircleDot } from 'react-icons/lu';

import { Button } from '@/components/ui';

/**
 * Taking the photograph here rather than in the camera app.
 *
 * The measuring tools work from a picture of a board or a target, and the picture usually comes
 * from the phone that is already standing in front of it. Going through the camera app means a
 * photo saved to the roll, found again in a file picker and left there afterwards; this opens
 * the camera in the page, hands the frame straight to the tool and keeps nothing.
 *
 * The stream never leaves the browser: the shutter draws the current video frame onto a canvas
 * and makes a file out of it, and the tracks are stopped as soon as the preview closes or the
 * screen goes away.
 */

type Language = 'ja' | 'en';

interface CameraCaptureProps {
  language: Language;
  /** The photo the shutter made. The caller decides what to do with it. */
  onCapture: (file: File) => void;
  /** Asked before the shutter fires. Returning false leaves the current photo alone. */
  confirmCapture?: () => boolean;
  /** What the preview is pointed at, for a reader who cannot see it. */
  label: string;
}

/** Ask for something close to a phone's own camera; the browser gives what the device has. */
const constraints: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
  audio: false,
};

export function CameraCapture({ language, onCapture, confirmCapture, label }: CameraCaptureProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Whether this screen is still on. Permission can be granted long after the reader has left.
  const mountedRef = useRef(true);
  // Which shutter press is the current one. Encoding a frame takes long enough for the reader to
  // press again, close the camera or pick another photo, and a stale frame arriving after any of
  // those would replace what they chose instead.
  const shutterRef = useRef(0);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<'denied' | 'unavailable' | 'shutter' | null>(null);

  const stop = useCallback(() => {
    shutterRef.current += 1;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  }, []);

  // A camera left running after the screen is gone is both a battery drain and a lit indicator.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  const start = async () => {
    // Asked at the moment of the press rather than on the way in. The page is rendered on the
    // server first, where there is no navigator, and a button that renders dead on that pass is
    // worse than one that says plainly why it did not open.
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setProblem('unavailable');
      return;
    }
    setProblem(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // The prompt can be answered after the reader has moved on, and the cleanup that would
      // have stopped these tracks has already run, so the stream is closed here instead.
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      setLive(true);
      // The element only exists once `live` has rendered it, so it is attached on the next frame.
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // autoPlay already starts it where it can. This is for the browsers that need the call,
        // and it guards the return value: not every one of them gives back a promise.
        const started: unknown = video.play();
        if (started instanceof Promise) started.catch(() => undefined);
      });
    } catch (error) {
      // A refusal and a camera that is not there read the same to the page, so they are told apart
      // by the name the browser gives: only a refusal is something the reader can undo.
      const name = error instanceof DOMException ? error.name : '';
      setProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      stop();
    } finally {
      setStarting(false);
    }
  };

  const shutter = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setProblem('shutter');
      return;
    }
    if (confirmCapture && !confirmCapture()) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setProblem('shutter');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const press = (shutterRef.current += 1);
    setProblem(null);
    setSaving(true);
    canvas.toBlob((blob) => {
      // Anything that happened while this was encoding moved the count on, and this frame is no
      // longer the one that was asked for.
      if (press !== shutterRef.current || !mountedRef.current) return;
      setSaving(false);
      if (!blob) {
        setProblem('shutter');
        return;
      }
      onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      stop();
    }, 'image/jpeg');
  };

  const message = () => {
    if (problem === 'denied')
      return t(
        'カメラの使用が許可されていません。ブラウザーの設定でこのページにカメラを許可してください。',
        'The camera was not allowed. Permit the camera for this page in your browser settings.',
      );
    if (problem === 'unavailable')
      return t(
        'このブラウザーや端末ではカメラを使えませんでした。写真を選ぶ方法をお使いください。',
        'The camera could not be opened on this browser or device. Choose a photo from a file instead.',
      );
    if (problem === 'shutter')
      return t('撮影できませんでした。もう一度お試しください。', 'The photo could not be taken. Try again.');
    if (saving) return t('撮影した写真を書き出しています…', 'Saving the photo…');
    if (starting) return t('カメラを起動しています…', 'Opening the camera…');
    if (live) return t('カメラを起動しました。', 'The camera is open.');
    return '';
  };

  return (
    <div className="space-y-3">
      {live && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label={label}
          className="block aspect-[4/3] w-full rounded-sm border border-outline-variant bg-black object-contain"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {live ? (
          <>
            <Button onClick={shutter} disabled={saving}>
              <LuCircleDot aria-hidden="true" />
              {saving ? t('書き出しています…', 'Saving…') : t('撮影する', 'Take the photo')}
            </Button>
            <Button variant="outline" onClick={stop}>
              {t('カメラを閉じる', 'Close the camera')}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => void start()} disabled={starting}>
            <LuCamera aria-hidden="true" />
            {t('カメラで撮影する', 'Use the camera')}
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-on-surface-variant">
        {message()}
      </p>
    </div>
  );
}
