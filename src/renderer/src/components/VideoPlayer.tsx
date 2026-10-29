/**
 * VideoPlayer.tsx — tedeyTV
 *
 * Engine auto-selection:
 *   DASH  → dashjs
 *   HLS   → hls.js (MSE) | native <video> (Safari / Electron codec)
 *   TS/FLV→ mpegts.js (dynamic import)
 *   MP4/WebM/direct → native <video>
 *
 * Features:
 *  • Auto-reconnect (exponential back-off, up to 8 attempts)
 *  • Debounced channel switch (200 ms)
 *  • Custom controls bar (visible only on mouse hover, auto-hide after 3 s idle)
 *  • Volume 0–150 % with Web Audio gain for boost
 *  • Aspect modes: Fit | Fill | 16:9 | 4:3 | Stretch
 *  • HLS audio-track selection
 *  • Keyboard shortcuts: Space F M ↑↓ ←→ P L Esc
 *  • Media keys forwarded from Electron main process
 *  • powerSaveBlocker while playing
 *  • Cursor auto-hide in fullscreen
 *  • PiP via ref-based events (avoids missing React types)
 *  • GO LIVE button (jump to live edge after pausing)
 */

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import Hls from "hls.js";
import * as dashjs from "dashjs";
import { useLiveTVStore } from "../store/useLiveTVStore";
import { detectStreamType } from "../utils/streamDetector";
import type {
  AudioTrack,
  PlaybackStatus,
  PlayerError,
  StreamType,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MpegtsPlayer = any;

declare global {
  interface Window {
    api: {
      toggleFullscreen: () => void;
      isFullscreen: () => Promise<boolean>;
      powerSaveStart: () => void;
      powerSaveStop: () => void;
      openMiniPlayer: (url: string, name: string) => void;
      closeMiniPlayer: () => void;
      onMediaKey: (cb: (key: string) => void) => () => void;
    };
  }
}

const CONTROLS_HIDE_MS = 3000;
const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 8;
const SWITCH_DEBOUNCE_MS = 200;

// keeps Electron's window-drag region from swallowing clicks
const NO_DRAG = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

function IconBtn({
  title,
  onClick,
  children,
  active = false,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-8 h-8 flex items-center justify-center rounded transition-colors
        ${active ? "text-red-400" : "text-white hover:text-red-400"}`}
    >
      {children}
    </button>
  );
}

export function VideoPlayer() {
  const {
    currentChannel,
    playChannel,
    playerSettings,
    setVolume,
    setMuted,
    setAspectMode,
    nextChannel,
    prevChannel,
  } = useLiveTVStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const mpegtsRef = useRef<MpegtsPlayer | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChannel = useRef(currentChannel);
  // CHANGED (hover controls): true while the pointer is on the top/bottom bar
  const overControls = useRef(false);

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<PlayerError | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(-1);
  const [showTrackMenu, setShowTrackMenu] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  // macOS traffic-light buttons sit top-left; leave room so they don't cover the close button
  const isMac = useMemo(() => /Mac/i.test(navigator.platform), []);

  // ── Debug overlay (Ctrl+D) ────────────────────────────────────────────────
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState({
    engine: "—",
    streamType: "—" as string,
    bufferSec: 0,
    bitrate: 0,
    stallCount: 0,
    droppedFrames: 0,
  });
  const stallCountRef = useRef(0);

  const { volume, muted, aspectMode } = playerSettings;

  const objectFitMap: Record<string, string> = {
    contain: "object-contain",
    fill: "object-cover",
    "16/9": "object-contain",
    "4/3": "object-contain",
    none: "object-fill",
  };
  const videoClass = objectFitMap[aspectMode] ?? "object-contain";

  // ── Web Audio (volume boost > 100 %) ───────────────────────────────────────
  const ensureAudioContext = useCallback(() => {
    const video = videoRef.current;
    if (!video || audioCtxRef.current) return;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
    } catch {
      // already exists or not supported
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.min(volume, 100) / 100;
    video.muted = muted;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume > 100 ? volume / 100 : 1;
    }
  }, [volume, muted]);

  // ── Destroy all engines ───────────────────────────────────────────────────
  const destroyAll = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashRef.current) {
      dashRef.current.destroy();
      dashRef.current = null;
    }
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.destroy();
      } catch {
        /* ignore */
      }
      mpegtsRef.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    // CHANGED: removed `reconnectAttempts.current = 0` here — loadStream calls destroyAll,
    // so it was resetting the counter on every retry and the 8-attempt limit never hit.
    // The counter is still reset on channel switch and on the Retry button.
    setReconnectCountdown(0);
  }, []);

  // ── PiP events (native, not in React types) ───────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  // ── Fullscreen sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Controls auto-hide (hover only) ───────────────────────────────────────
  // CHANGED: controls are now hidden after CONTROLS_HIDE_MS of no mouse movement in ALL
  // modes (before: fullscreen only). They stay visible while the pointer is on a control
  // bar or while the aspect / audio menu is open, and hide when the pointer leaves the player.
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (overControls.current || showAspectMenu || showTrackMenu) return;
      setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, [showAspectMenu, showTrackMenu]);

  // CHANGED: also re-show the controls briefly whenever a new channel starts
  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [isFullscreen, resetControlsTimer, currentChannel?.url]);

  // ── Reconnect with exponential back-off ───────────────────────────────────
  const scheduleReconnect = useCallback(
    (url: string) => {
      if (reconnectAttempts.current >= RECONNECT_MAX_ATTEMPTS) {
        setStatus("error");
        setError({
          code: "network",
          message:
            "Stream unavailable after multiple retries. The channel may be offline.",
        });
        return;
      }
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttempts.current,
        RECONNECT_MAX_MS,
      );
      reconnectAttempts.current++;
      setStatus("reconnecting");
      setReconnectCountdown(Math.round(delay / 1000));
      reconnectTimer.current = setTimeout(() => {
        setReconnectCountdown(0);
        loadStream(url); // eslint-disable-line @typescript-eslint/no-use-before-define
      }, delay);
    },
    [], // loadStream added below via ref to avoid circular dep
  );

  // ── Core stream loader ────────────────────────────────────────────────────
  const loadStream = useCallback(
    (url: string) => {
      const video = videoRef.current;
      if (!video) return;

      setError(null);
      setStatus("loading");
      destroyAll();
      ensureAudioContext();

      // ── Determine engine: explicit channel override → URL detection ───────
      // currentChannel.type takes priority over URL heuristics
      const urlDetected: StreamType = detectStreamType(url);
      const engineHint = pendingChannel.current?.type; // 'hls' | 'dash' | 'mpegts' | undefined
      const type: StreamType =
        engineHint === "hls"
          ? "hls"
          : engineHint === "dash"
            ? "dash"
            : engineHint === "mpegts"
              ? "ts"
              : urlDetected;

      // ── Inject per-channel headers via X-Custom-* (main process picks them up)
      // We do this by passing them on every XHR that hls.js / mpegts.js makes.
      // For native <video> we set them once via a HEAD fetch so the session hook
      // caches the UA for that host's subsequent requests.
      const ch = pendingChannel.current;
      const customUA = ch?.userAgent ?? null;
      const customReferer = ch?.referer ?? null;

      // Inject into hls.js xhrSetup / p-fetch so the session hook receives them
      const xhrSetup = (xhr: XMLHttpRequest) => {
        if (customUA) xhr.setRequestHeader("X-Custom-UA", customUA);
        if (customReferer)
          xhr.setRequestHeader("X-Custom-Referer", customReferer);
      };

      // CHANGED (muted start): only fall back to muted playback when the browser really
      // blocks autoplay (NotAllowedError). Other failures (e.g. AbortError when a load
      // interrupts play()) get a plain retry. Before, ANY failure muted the video while the
      // store still said "unmuted", so some channels started silent. The `onPlaying`
      // handler below also re-syncs the mute state with the store.
      const safePlay = () => {
        video.play().catch((err) => {
          if (err?.name === "NotAllowedError") video.muted = true;
          video
            .play()
            .catch((e) => console.warn("[player] autoplay failed:", e));
        });
      };

      // Update debug info
      setDebugInfo((d) => ({
        ...d,
        engine: engineHint ?? urlDetected,
        streamType: type,
        bufferSec: 0,
        bitrate: 0,
      }));
      stallCountRef.current = 0;

      // ── DASH ────────────────────────────────────────────────────────────
      if (type === "dash") {
        try {
          const player = dashjs.MediaPlayer().create();
          dashRef.current = player;
          player.updateSettings({
            streaming: {
              // Give the server room to breathe: start with 20 s ahead
              buffer: {
                bufferTimeAtTopQuality: 20,
                bufferTimeAtTopQualityLongForm: 30,
                fastSwitchEnabled: false,
              },
              // CHANGED: 8 → 30. Play ~30 s behind live (ExoPlayer's default) so
              // slow segments from this server don't drain the buffer and stall.
              delay: { liveDelay: 30 },
              // CHANGED: catch-up off — it changes playback speed to chase latency
              // and drains the buffer on non-low-latency streams.
              liveCatchup: { enabled: false },
              // Higher retry counts for unreliable IPTV servers
              retryAttempts: {
                MPD: 5,
                MediaSegment: 5,
                InitializationSegment: 5,
                BitstreamSwitchingSegment: 5,
                IndexSegment: 5,
              },
              retryIntervals: {
                MPD: 1000,
                MediaSegment: 1000,
                InitializationSegment: 1000,
                BitstreamSwitchingSegment: 1000,
                IndexSegment: 1000,
              },
              // Start at lowest quality and adapt up to avoid initial stall
              abr: {
                initialBitrate: { video: 300 },
                autoSwitchBitrate: { video: true },
              },
            },
          });
          player.initialize(video, url, true);
          player.on(dashjs.MediaPlayer.events.CAN_PLAY, () =>
            setStatus("playing"),
          );
          player.on(dashjs.MediaPlayer.events.PLAYBACK_PLAYING, () => {
            setStatus("playing");
            setDebugInfo((d) => ({
              ...d,
              bitrate: player.getAverageThroughput("video") ?? 0,
            }));
          });
          player.on(dashjs.MediaPlayer.events.PLAYBACK_WAITING, () => {
            setStatus("buffering");
            stallCountRef.current++;
            setDebugInfo((d) => ({ ...d, stallCount: stallCountRef.current }));
          });
          // CHANGED: dash.js retries segments itself. Previously ANY error with a code
          // tore the player down and restarted it; now only manifest-level failures do.
          player.on(
            dashjs.MediaPlayer.events.ERROR,
            (e: Record<string, unknown>) => {
              console.error("[dash] error", e);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const codes = (dashjs.MediaPlayer as any).errors ?? {};
              const fatalCodes = [
                codes.MANIFEST_LOADER_LOADING_FAILURE_ERROR_CODE,
                codes.MANIFEST_LOADER_PARSING_FAILURE_ERROR_CODE,
              ].filter((c) => c !== undefined);
              const code = (e as { error?: { code?: number } })?.error?.code;
              if (code !== undefined && fatalCodes.includes(code))
                scheduleReconnect(url);
            },
          );
        } catch (e) {
          console.error("[dash] init failed", e);
          setError({
            code: "unknown",
            message: "Failed to initialize DASH player.",
          });
          setStatus("error");
        }
        return;
      }

      // ── HLS ─────────────────────────────────────────────────────────────
      if (type === "hls" || type === "unknown") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            // lowLatencyMode OFF — these IPTV servers are NOT low-latency;
            // enabling it forces liveSyncDuration to <1 segment → stalls
            lowLatencyMode: false,
            // Live edge: 3 segments ahead is stable for IPTV servers
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 8,
            // Generous buffer: front 30 s, max 60 s
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            // Back-buffer: keep 30 s so seeks within live window work
            liveBackBufferLength: 30,
            backBufferLength: 30,
            // Start at lower ABR level then ramp up
            startLevel: -1, // auto
            capLevelToPlayerSize: true,
            // Retry policy for IPTV servers (slow manifest, segment gaps)
            manifestLoadingMaxRetry: 6,
            manifestLoadingRetryDelay: 1000,
            manifestLoadingMaxRetryTimeout: 16000,
            levelLoadingMaxRetry: 6,
            levelLoadingRetryDelay: 1000,
            levelLoadingMaxRetryTimeout: 16000,
            fragLoadingMaxRetry: 6,
            fragLoadingRetryDelay: 1000,
            fragLoadingMaxRetryTimeout: 16000,
            // XHR hook to inject per-channel headers
            xhrSetup,
          });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            setStatus("playing");
            safePlay();
            setDebugInfo((d) => ({
              ...d,
              bitrate:
                hls.currentLevel >= 0
                  ? (data.levels[hls.currentLevel]?.bitrate ?? 0)
                  : 0,
            }));
            const tracks: AudioTrack[] = (data.audioTracks ?? []).map(
              (t: {
                id: number;
                name: string;
                lang?: string;
                default?: boolean;
              }) => ({
                id: t.id,
                name: t.name || t.lang || `Track ${t.id}`,
                lang: t.lang,
                default: t.default,
              }),
            );
            setAudioTracks(tracks);
            const def = tracks.find((t) => t.default);
            if (def) setActiveAudioTrack(def.id);
          });

          hls.on(Hls.Events.ERROR, (_e, data) => {
            // CHANGED: log every HLS error so the real cause is visible in DevTools
            console.error(
              "[hls]",
              data.type,
              data.details,
              "fatal:",
              data.fatal,
              data,
            );
            if (!data.fatal) {
              if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
                stallCountRef.current++;
                setDebugInfo((d) => ({
                  ...d,
                  stallCount: stallCountRef.current,
                }));
                // CHANGED: removed hls.startLoad(-1) here — restarting the load at the
                // live edge on every stall caused more stalls. hls.js recovers on its own.
              }
              return;
            }
            // Fatal errors
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              scheduleReconnect(url);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              scheduleReconnect(url);
            }
          });

          // Update buffer length in debug info while playing
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            const buf = video.buffered;
            if (buf.length > 0) {
              const ahead = buf.end(buf.length - 1) - video.currentTime;
              setDebugInfo((d) => ({ ...d, bufferSec: Math.round(ahead) }));
            }
          });

          return;
        }
        // Native HLS (Safari / Electron with codec pack)
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          video.addEventListener("canplay", () => setStatus("playing"), {
            once: true,
          });
          safePlay();
          return;
        }
      }

      // ── MPEG-TS / FLV ───────────────────────────────────────────────────
      if (type === "ts") {
        import("mpegts.js")
          .then((mpegts) => {
            if (!mpegts.default.isSupported()) {
              video.src = url;
              safePlay();
              return;
            }
            const player: MpegtsPlayer = mpegts.default.createPlayer(
              {
                type: url.endsWith(".flv") ? "flv" : "mpegts",
                url,
                isLive: true,
              },
              {
                // Large stash prevents stutter when a raw-TS server delivers
                // chunks in bursts (common on cheap IPTV backends).
                // enableStashBuffer / stashInitialSize live in OptionalConfig (2nd arg).
                enableStashBuffer: true,
                stashInitialSize: 1024 * 512, // 512 KB
                // Relaxed latency chasing — avoids buffer underruns on variable servers
                liveBufferLatencyChasing: false,
                autoCleanupSourceBuffer: true,
                autoCleanupMinBackwardDuration: 30,
                autoCleanupMaxBackwardDuration: 60,
              },
            );
            mpegtsRef.current = player;
            player.attachMediaElement(video);
            player.load();
            player.on(
              mpegts.default.Events.ERROR,
              (errType: string, info: unknown) => {
                console.error("[mpegts] error", errType, info);
                scheduleReconnect(url);
              },
            );
            player.on(
              mpegts.default.Events.STATISTICS_INFO,
              (stats: { speed?: number }) => {
                setDebugInfo((d) => ({
                  ...d,
                  bitrate: Math.round(((stats.speed ?? 0) * 8) / 1000),
                }));
              },
            );
            const playResult: unknown = player.play();
            if (playResult instanceof Promise) {
              playResult.catch(() => {
                video.muted = true;
                const retry: unknown = player.play();
                if (retry instanceof Promise) retry.catch(console.warn);
              });
            }
            setStatus("playing");
          })
          .catch(() => {
            // mpegts.js unavailable — fall back to native (will likely fail for raw TS)
            video.src = url;
            safePlay();
            setStatus("playing");
          });
        return;
      }

      // ── MP4 / WebM / direct ─────────────────────────────────────────────
      video.src = url;
      video.addEventListener("canplay", () => setStatus("playing"), {
        once: true,
      });
      video.addEventListener("error", () => scheduleReconnect(url), {
        once: true,
      });
      safePlay();
    },
    [destroyAll, ensureAudioContext, scheduleReconnect],
  );

  // ── Debounced channel switch ──────────────────────────────────────────────
  useEffect(() => {
    pendingChannel.current = currentChannel;
    if (switchDebounce.current) clearTimeout(switchDebounce.current);
    switchDebounce.current = setTimeout(() => {
      const ch = pendingChannel.current;
      const video = videoRef.current;
      if (ch?.url) {
        reconnectAttempts.current = 0;
        loadStream(ch.url);
      } else {
        destroyAll();
        if (video) {
          video.pause();
          video.removeAttribute("src");
          video.load();
        }
      }
    }, SWITCH_DEBOUNCE_MS);

    return () => {
      if (switchDebounce.current) clearTimeout(switchDebounce.current);
    };
  }, [currentChannel?.url, loadStream, destroyAll]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      destroyAll();
      window.api?.powerSaveStop();
    };
  }, [destroyAll]);

  // ── powerSaveBlocker ──────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "playing") window.api?.powerSaveStart();
    else window.api?.powerSaveStop();
  }, [status]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    destroyAll();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    playChannel(null);
    window.api?.powerSaveStop();
  }, [destroyAll, playChannel]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(console.warn);
      setStatus("playing");
    } else {
      video.pause();
      setStatus("paused");
    }
  }, []);

  // jump to the live edge and resume (used after pausing)
  const goLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current && typeof hlsRef.current.liveSyncPosition === "number") {
      video.currentTime = hlsRef.current.liveSyncPosition;
    } else if (dashRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dash = dashRef.current as any;
      if (typeof dash.seekToOriginalLive === "function")
        dash.seekToOriginalLive();
      else if (video.seekable.length)
        video.currentTime = video.seekable.end(video.seekable.length - 1) - 1;
    } else if (video.seekable.length) {
      // mpegts.js / native HLS / direct streams
      const end = video.seekable.end(video.seekable.length - 1);
      video.currentTime = Math.max(video.seekable.start(0), end - 1);
    }

    video.play().catch(console.warn);
    setStatus("playing");
  }, []);

  // Fullscreen: ONLY the HTML Fullscreen API. Calling window.api.toggleFullscreen() as well
  // flipped the Electron window state a second time and fought with the first toggle.
  // The native window toggle is only a fallback if the HTML request is refused.
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current?.requestFullscreen();
      }
    } catch (e) {
      console.warn(
        "[player] HTML fullscreen failed, falling back to window toggle:",
        e,
      );
      window.api?.toggleFullscreen();
    }
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(console.warn);
    } else {
      await video.requestPictureInPicture().catch(console.warn);
    }
  }, []);

  const switchToNext = useCallback(() => {
    const ch = nextChannel();
    if (ch) {
      reconnectAttempts.current = 0;
      playChannel(ch);
    }
  }, [nextChannel, playChannel]);

  const switchToPrev = useCallback(() => {
    const ch = prevChannel();
    if (ch) {
      reconnectAttempts.current = 0;
      playChannel(ch);
    }
  }, [prevChannel, playChannel]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlayPause();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
        case "M":
          setMuted(!muted);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(Math.min(150, volume + 5));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(Math.max(0, volume - 5));
          break;
        case "ArrowRight":
          e.preventDefault();
          switchToNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          switchToPrev();
          break;
        case "p":
        case "P":
          togglePiP();
          break;
        case "l":
        case "L":
          goLive();
          break;
        case "Escape":
          if (!document.fullscreenElement) handleClose();
          break;
        case "d":
        case "D":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowDebug((v) => !v);
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    togglePlayPause,
    toggleFullscreen,
    togglePiP,
    goLive,
    handleClose,
    muted,
    volume,
    setMuted,
    setVolume,
    switchToNext,
    switchToPrev,
  ]);

  // ── Media keys from main process ──────────────────────────────────────────
  useEffect(() => {
    const unsub = window.api?.onMediaKey?.((key: string) => {
      if (key === "play-pause") togglePlayPause();
      if (key === "next") switchToNext();
      if (key === "prev") switchToPrev();
    });
    return () => unsub?.();
  }, [togglePlayPause, switchToNext, switchToPrev]);

  // ── HLS audio track switch ────────────────────────────────────────────────
  const switchAudioTrack = useCallback((trackId: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
      setActiveAudioTrack(trackId);
    }
  }, []);

  // ── Aspect ratio style ────────────────────────────────────────────────────
  const videoStyle = useMemo((): React.CSSProperties => {
    if (aspectMode === "16/9")
      return { aspectRatio: "16/9", maxWidth: "100%", maxHeight: "100%" };
    if (aspectMode === "4/3")
      return { aspectRatio: "4/3", maxWidth: "100%", maxHeight: "100%" };
    return {};
  }, [aspectMode]);

  if (!currentChannel) return null;

  const isLoading = status === "loading";
  const isReconnecting = status === "reconnecting";
  const isError = status === "error";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col select-none"
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      // CHANGED: hide the controls as soon as the pointer leaves the player
      onMouseLeave={() => {
        overControls.current = false;
        setControlsVisible(false);
      }}
      style={{ cursor: isFullscreen && !controlsVisible ? "none" : "default" }}
    >
      {/* Video */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          className={`w-full h-full ${videoClass} bg-black`}
          style={videoStyle}
          autoPlay
          playsInline
          onWaiting={() => {
            setStatus("buffering");
            stallCountRef.current++;
            setDebugInfo((d) => ({ ...d, stallCount: stallCountRef.current }));
          }}
          onPlaying={() => {
            setStatus("playing");
            // CHANGED (muted start): re-apply the store's mute state — a fallback inside
            // safePlay / mpegts may have muted the element while the UI says "unmuted"
            const v = videoRef.current;
            if (v && v.muted !== muted) v.muted = muted;
            // …and make sure the Web Audio graph isn't suspended (silent audio)
            if (audioCtxRef.current?.state === "suspended")
              audioCtxRef.current.resume().catch(() => {});
          }}
          onPause={() => {
            if (status !== "reconnecting") setStatus("paused");
          }}
          onError={(e) => {
            const el = e.currentTarget;
            if (
              !hlsRef.current &&
              !dashRef.current &&
              !mpegtsRef.current &&
              el.src
            ) {
              scheduleReconnect(el.src);
            }
          }}
          onDoubleClick={togglePlayPause}
        />
      </div>

      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-4 pb-10
          bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300
          ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        // CHANGED: remember when the pointer is on the bar so it doesn't auto-hide under it
        onMouseEnter={() => {
          overControls.current = true;
        }}
        onMouseLeave={() => {
          overControls.current = false;
        }}
        // no-drag so Electron's title-bar drag region doesn't eat clicks;
        // extra left padding on macOS to clear the traffic-light buttons
        style={{
          ...NO_DRAG,
          ...(isMac && !isFullscreen ? { paddingLeft: 88 } : {}),
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="relative z-20 pointer-events-auto w-10 h-10 rounded-full
                     bg-black/60 hover:bg-red-600 active:bg-red-700
                     flex items-center justify-center shrink-0
                     transition-colors backdrop-blur-sm border border-white/10 text-white
                     focus-visible:ring-2 focus-visible:ring-red-500"
          style={NO_DRAG}
          title="Back (Esc)"
          aria-label="Back"
        >
          {/* left arrow (back) */}
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {currentChannel.logo && (
            <img
              src={currentChannel.logo}
              alt=""
              className="w-8 h-8 object-contain rounded shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <span className="text-white font-semibold text-base truncate">
            {currentChannel.name}
          </span>
          {currentChannel.isHD && (
            <span className="bg-zinc-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
              HD
            </span>
          )}
        </div>

        {/* PiP */}
        <button
          onClick={togglePiP}
          title="Picture-in-Picture (P)"
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors
            ${isPiP ? "text-red-400" : "text-white/70 hover:text-white"}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <rect x="3" y="3" width="18" height="14" rx="2" />
            <rect
              x="11"
              y="11"
              width="9"
              height="6"
              rx="1"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        </button>
      </div>

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-2 px-4 pb-4 pt-10
          bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300
          ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        // CHANGED: remember when the pointer is on the bar so it doesn't auto-hide under it
        onMouseEnter={() => {
          overControls.current = true;
        }}
        onMouseLeave={() => {
          overControls.current = false;
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <IconBtn title="Previous channel (←)" onClick={switchToPrev}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </IconBtn>

          <IconBtn title="Play/Pause (Space)" onClick={togglePlayPause}>
            {status === "paused" ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </IconBtn>

          <IconBtn title="Next channel (→)" onClick={switchToNext}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" />
            </svg>
          </IconBtn>

          <IconBtn
            title="Mute (M)"
            onClick={() => setMuted(!muted)}
            active={muted}
          >
            {muted || volume === 0 ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18L19 19.27 20.27 18 5.27 3 4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            )}
          </IconBtn>

          {/* Volume slider */}
          <div className="flex items-center gap-1 w-32">
            <input
              type="range"
              min={0}
              max={150}
              step={1}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-1 accent-red-500 cursor-pointer"
              title={`Volume: ${volume}%`}
            />
            <span className="text-white/50 text-xs w-8 text-right tabular-nums">
              {volume}%
            </span>
          </div>

          {/* LIVE button, right next to the volume slider.
              Pulsing red "LIVE" while live, "● GO LIVE" when paused. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              goLive();
            }}
            title="Jump to live (L)"
            className={`text-white text-xs font-bold px-2 py-1 rounded shrink-0 transition-colors
              ${
                status === "paused"
                  ? "bg-zinc-700 hover:bg-red-600 ring-1 ring-red-500/60"
                  : "bg-red-600/90 animate-pulse"
              }`}
          >
            {status === "paused" ? "● GO LIVE" : "LIVE"}
          </button>

          <div className="flex-1" />

          {/* Aspect ratio */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAspectMenu((v) => !v);
                setShowTrackMenu(false);
              }}
              className="text-white/60 hover:text-white text-xs px-2 py-1 rounded border border-white/20 hover:border-white/40 transition-colors"
            >
              {aspectMode === "contain"
                ? "Fit"
                : aspectMode === "fill"
                  ? "Fill"
                  : aspectMode === "none"
                    ? "Stretch"
                    : aspectMode}
            </button>
            {showAspectMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-zinc-700 rounded-lg py-1 w-28 shadow-xl">
                {(["contain", "fill", "16/9", "4/3", "none"] as const).map(
                  (m) => (
                    <button
                      key={m}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAspectMode(m);
                        setShowAspectMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors
                      ${aspectMode === m ? "text-red-400" : "text-zinc-300 hover:text-white hover:bg-zinc-800"}`}
                    >
                      {m === "contain"
                        ? "Fit"
                        : m === "fill"
                          ? "Fill"
                          : m === "none"
                            ? "Stretch"
                            : m}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Audio tracks (HLS only, when > 1) */}
          {audioTracks.length > 1 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTrackMenu((v) => !v);
                  setShowAspectMenu(false);
                }}
                className="text-white/60 hover:text-white text-xs px-2 py-1 rounded border border-white/20 hover:border-white/40 transition-colors"
              >
                🎵{" "}
                {audioTracks.find((t) => t.id === activeAudioTrack)?.name ??
                  "Audio"}
              </button>
              {showTrackMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-zinc-700 rounded-lg py-1 w-36 shadow-xl">
                  {audioTracks.map((t) => (
                    <button
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        switchAudioTrack(t.id);
                        setShowTrackMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors
                        ${activeAudioTrack === t.id ? "text-red-400" : "text-zinc-300 hover:text-white hover:bg-zinc-800"}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fullscreen */}
          <IconBtn
            title="Fullscreen (F)"
            onClick={toggleFullscreen}
            active={isFullscreen}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {isFullscreen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9V4.5M9 9H4.5M9 15v4.5M9 15H4.5M15 9h4.5M15 9V4.5M15 15h4.5M15 15v4.5"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                />
              )}
            </svg>
          </IconBtn>
        </div>

        {/* Shortcut hint */}
        <div className="text-white/25 text-[10px] pointer-events-none text-right">
          Space · F · M · ↑↓ volume · ←→ channel · P = PiP · L = Live · Esc
        </div>
      </div>

      {/* Buffering indicator — small non-blocking badge bottom-left */}
      {status === "buffering" && !isError && (
        <div className="absolute bottom-20 left-4 z-20 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1.5 pointer-events-none">
          <div className="w-3 h-3 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
          <span className="text-white text-xs font-medium">Buffering…</span>
        </div>
      )}

      {/* Initial loading spinner — full overlay only on first load */}
      {status === "loading" && !isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-14 h-14 border-4 border-zinc-700 border-t-red-600 rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">Loading stream…</span>
        </div>
      )}

      {/* Reconnecting overlay */}
      {isReconnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 pointer-events-none">
          <div className="w-12 h-12 border-4 border-yellow-500/40 border-t-yellow-400 rounded-full animate-spin" />
          <p className="text-yellow-300 font-semibold text-base">
            Reconnecting…
          </p>
          {reconnectCountdown > 0 && (
            <p className="text-zinc-400 text-sm">
              Retry in {reconnectCountdown}s (attempt{" "}
              {reconnectAttempts.current}/{RECONNECT_MAX_ATTEMPTS})
            </p>
          )}
        </div>
      )}

      {/* Error overlay */}
      {isError && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/85">
          <svg
            className="w-14 h-14 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div className="text-center max-w-xs">
            <p className="text-zinc-100 font-semibold text-base mb-1">
              Playback failed
            </p>
            <p className="text-zinc-400 text-sm">{error.message}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                reconnectAttempts.current = 0;
                if (currentChannel?.url) loadStream(currentChannel.url);
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white font-semibold transition-colors"
            >
              Retry
            </button>
            <button
              onClick={switchToNext}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors"
            >
              Next Channel
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-zinc-800/60 hover:bg-zinc-700 rounded-lg text-sm text-zinc-400 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Ctrl+D debug overlay */}
      {showDebug && (
        <div className="absolute top-14 right-4 z-50 bg-black/80 text-green-400 font-mono text-xs rounded-lg px-3 py-2 pointer-events-none space-y-0.5 min-w-[200px]">
          <div>
            Engine: <span className="text-white">{debugInfo.engine}</span>
          </div>
          <div>
            Type: <span className="text-white">{debugInfo.streamType}</span>
          </div>
          <div>
            Buffer: <span className="text-white">{debugInfo.bufferSec}s</span>
          </div>
          <div>
            Bitrate:{" "}
            <span className="text-white">
              {debugInfo.bitrate > 0
                ? `${Math.round(debugInfo.bitrate / 1000)} kbps`
                : "—"}
            </span>
          </div>
          <div>
            Stalls:{" "}
            <span className="text-yellow-400">{debugInfo.stallCount}</span>
          </div>
          <div>
            DroppedFrames:{" "}
            <span className="text-yellow-400">
              {videoRef.current
                ? ((
                    videoRef.current as HTMLVideoElement & {
                      webkitDroppedFrameCount?: number;
                    }
                  ).webkitDroppedFrameCount ?? "—")
                : "—"}
            </span>
          </div>
          <div className="text-zinc-500 text-[10px] mt-1">Ctrl+D to close</div>
        </div>
      )}
    </div>
  );
}
