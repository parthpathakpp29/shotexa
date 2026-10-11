"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const VIDEO_SRC = "/product/shotexa-demo.mov";
/**
 * How much of the frame must be on screen before the large source is attached. A bare
 * "is it intersecting at all" test can fire during the first paint, while the page above is
 * still laying out and this section is briefly inside the viewport — which would defeat the
 * whole point of the lazy load. Asking for a real slice of the frame cannot be fooled that way.
 */
const ATTACH_RATIO = 0.1;
/** How much must be on screen before it plays by itself. */
const PLAY_RATIO = 0.45;

export function ProductDemoSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sourceAttached, setSourceAttached] = useState(false);
  const [isSufficientlyVisible, setIsSufficientlyVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= ATTACH_RATIO) {
          setSourceAttached(true);
          setHasEntered(true);
        }
        setIsSufficientlyVisible(entry.isIntersecting && entry.intersectionRatio >= PLAY_RATIO);
      },
      // Attach the large source only once the frame itself reaches the viewport. The
      // poster remains the only landing-page media request before then.
      { rootMargin: "0px", threshold: [0, ATTACH_RATIO, PLAY_RATIO] },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // This effect only drives the <video> element, which is an external system. `isPlaying` is
  // owned by the element's own play/pause events (below), so nothing is set from here — that
  // keeps one source of truth and avoids a render cascade on every visibility change.
  useEffect(() => {
    const video = videoRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!video || !sourceAttached) return;

    const shouldAutoplay = !reducedMotion && isSufficientlyVisible && !userPaused && !hasEnded;
    if (playRequested || shouldAutoplay) {
      void video
        .play()
        .catch(() => undefined)
        .finally(() => setPlayRequested(false));
      return;
    }

    video.pause();
  }, [hasEnded, isSufficientlyVisible, playRequested, sourceAttached, userPaused]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (!sourceAttached) {
      setSourceAttached(true);
      setUserPaused(false);
      setPlayRequested(true);
      return;
    }

    if (!video.paused) {
      video.pause();
      setUserPaused(true);
      setIsPlaying(false);
      return;
    }

    if (video.ended || hasEnded) {
      video.currentTime = 0;
      setHasEnded(false);
    }
    setUserPaused(false);
    void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }

  return (
    <section ref={sectionRef} data-testid="home-product-demo" data-entered={hasEntered} className="product-demo-section relative isolate overflow-hidden border-y border-line bg-surface-3/70 py-20 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-20 -z-10 h-72 w-[min(900px,100vw)] -translate-x-1/2 rounded-full bg-accent-soft/60 blur-3xl" />
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        <div className="product-demo-copy max-w-2xl">
          <p className="t-micro text-accent-ink">Product demo</p>
          <h2 className="mt-3 font-sans text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">See Shotexa in action.</h2>
          <p className="t-body mt-4 max-w-xl text-ink-2">A quick look at the workspace: add a screenshot once, refine it with the right tool, and export when it is ready.</p>
        </div>

        <div className="product-demo-frame mt-10 overflow-hidden rounded-xl border border-[#332a24] bg-dark shadow-[0_24px_60px_-30px_rgb(28_23_20/0.55)] sm:mt-12">
          <div className="flex min-h-11 items-center justify-between border-b border-white/10 px-4 text-white/70">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex gap-1.5">
                <span className="size-2 rounded-full bg-[#f0a584]" />
                <span className="size-2 rounded-full bg-white/25" />
                <span className="size-2 rounded-full bg-white/25" />
              </span>
              <span className="t-mono text-[11px] tracking-[0.08em]">SHOTEXA / PRODUCT TOUR</span>
            </div>
            <span className="hidden t-mono text-[11px] text-white/40 sm:block">LOCAL WORKSPACE</span>
          </div>

          <div className="group relative aspect-video bg-[#11100f]">
            <video
              ref={videoRef}
              data-testid="product-demo-video"
              className="size-full object-contain"
              poster="/product/shotexa-demo-poster.png"
              src={sourceAttached ? VIDEO_SRC : undefined}
              preload="none"
              muted
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setHasEnded(true);
                setUserPaused(true);
              }}
            />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
            <button
              type="button"
              onClick={togglePlayback}
              aria-label={isPlaying ? "Pause Shotexa product demo" : "Play Shotexa product demo"}
              className="absolute bottom-4 left-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 bg-black/60 px-3.5 text-sm font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:bottom-5 sm:left-5"
            >
              {isPlaying ? <Pause aria-hidden className="size-4 fill-current" /> : <Play aria-hidden className="size-4 fill-current" />}
              {isPlaying ? "Pause" : hasEnded ? "Replay" : "Play demo"}
            </button>
            {!sourceAttached && (
              <span className="absolute bottom-4 right-4 rounded-sm border border-white/10 bg-black/45 px-2.5 py-1.5 t-mono text-[10px] tracking-[0.08em] text-white/65 sm:bottom-5 sm:right-5">LOADS WHEN IN VIEW</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
