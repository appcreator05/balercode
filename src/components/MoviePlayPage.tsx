import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CachedImage } from './CachedImage';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Share2,
  Bookmark,
  BookmarkCheck,
  Smartphone,
  Check,
  Scaling,
  Expand,
  Zap,
  Youtube,
  ChevronLeft,
  ChevronRight,
  Film,
  ListVideo,
  X,
  Search,
  SkipForward,
  SkipBack,
  SlidersHorizontal
} from 'lucide-react';
import { Movie } from '../types';
import { StartIoNativeAd } from './StartIoNativeAd';
import { StartIoBannerAd } from './StartIoBannerAd';
import { SAMPLE_MOVIES } from '../data/movies';
import { VDOSKyLogo } from './VDOSKyLogo';
import { hideSystemNavigation, showSystemNavigation } from '../utils/systemBars';
import { resolvePostVideoSource, cleanGoogleDriveId } from '../utils/videoSourceResolver';

interface MoviePlayPageProps {
  movie: Movie;
  allMovies?: Movie[];
  onBack: () => void;
  onSelectRelatedMovie: (movie: Movie) => void;
  onSelectCategory?: (slug: string, label: string) => void;
  onAdClick?: () => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  isSubscribed?: boolean;
  enableBannerAd?: boolean;
  bannerAppId?: string;
  onAdImpression?: () => void;
}

const createYtMovie = (
  id: string,
  title: string,
  cast: string[],
  duration: string,
  rating = '4.8',
  channel = 'YouTube'
): Movie => ({
  id,
  title,
  rating,
  category: 'youtube',
  categoryLabel: 'YouTube Video',
  genres: ['YouTube', 'Video'],
  poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  backdrop: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  yt: id,
  videoType: 'yt',
  videoUrl: `https://www.youtube.com/embed/${id}`,
  cast,
  description: `${title} on YouTube by ${channel}.`,
  duration,
  streamServers: [
    { name: 'YouTube Stream HD', quality: '1080p', url: `https://www.youtube.com/embed/${id}`, type: 'yt' }
  ]
});

const CURATED_YT_MOVIES: Movie[] = [
  createYtMovie('DKhcGYlnfdY', 'Yeh Majhdhaar (1996) Full Hindi Movie | Salman Khan, Manisha Koirala, Rahul Roy', ['Salman Khan', 'Manisha Koirala', 'Rahul Roy'], '2:19:41', '4.8', 'Goldmines Bollywood'),
  createYtMovie('QaloT95dYRE', 'Judwaa (HD) Full Hindi Comedy Movie | Salman Khan, Karisma Kapoor, Rambha', ['Salman Khan', 'Karisma Kapoor'], '2:18:30', '4.9', 'Shemaroo'),
  createYtMovie('eOEGcZupyWU', 'Karan Arjun (1995) Full Hindi Action Movie | Shah Rukh Khan, Salman Khan, Kajol', ['Shah Rukh Khan', 'Salman Khan', 'Kajol'], '2:45:00', '4.9', 'Ultra Bollywood'),
  createYtMovie('2mwVKYPl4P8', 'Sanam Bewafa {HD} Superhit Romantic Movie | Salman Khan, Chandni, Danny', ['Salman Khan', 'Chandni', 'Danny'], '2:38:12', '4.8', 'Shemaroo'),
  createYtMovie('Js2C11L7DU4', 'Biwi Ho To Aisi Full Movie | Salman Khan First Movie | Rekha, Farooq Shaikh', ['Salman Khan', 'Rekha', 'Farooq Shaikh'], '2:14:40', '4.7', 'NH Studioz'),
  createYtMovie('8YcicFH4ODQ', 'Suryavanshi | Hindi Full Movie | Salman Khan | Amrita Singh | Hindi Action Movie', ['Salman Khan', 'Amrita Singh'], '2:24:15', '4.6', 'Bolly Blockbuster'),
  createYtMovie('ZvdIpqnHf5g', 'Salman Khan Birthday Special | Yeh Majhdhaar HD | Rahul Roy, Manisha Koirala', ['Salman Khan', 'Rahul Roy'], '2:15:20', '4.7', 'Goldmines Bollywood'),
  createYtMovie('YBXtjHi2HZg', 'Kya Zamana Aa Gaya | Yeh Majhdhaar 1996 Songs | Salman Khan', ['Kumar Sanu', 'Udit Narayan', 'Salman Khan'], '6:27', '4.9', 'Goldmines Gaane Sune Ansune'),
  createYtMovie('XaFnsdQg3l8', 'Main Isse Mohabbat Karta Hoon | Yeh Majhdhaar 1996 Songs | Salman Khan', ['Alka Yagnik', 'Udit Narayan', 'Salman Khan'], '6:06', '4.8', 'Goldmines Gaane Sune Ansune'),
  createYtMovie('GLGUKqqu7sQ', 'Kung Fu Full Action Movie | Ram Charan | Pooja Hegde | South Hindi Action Movie', ['Ram Charan', 'Pooja Hegde'], '2:10:00', '4.8', 'Movie Zilla - Hindi Movies'),
  createYtMovie('UJHjQBA0Gc4', 'TARGET: THE BLACK COMMANDO - Hindi Dubbed Full Movie | Gopichand, Mehreen', ['Gopichand', 'Mehreen'], '2:05:00', '4.8', 'ADMD South Flix'),
  createYtMovie('vXwRYN5AU2Q', 'ROBBERY Vijay Thalapathy Hindi Dubbed Action Movie | South Indian Movie', ['Vijay Thalapathy'], '2:15:30', '4.8', 'Sur Hindi Manoranjan'),
  createYtMovie('4XowbIYI6wM', 'सुपरहिट (HD) ब्लॉकबस्टर साउथ इंडियन हिंदी डब्ड एक्शन मूवी || Jakkana', ['Sunil', 'Mannara Chopra'], '2:08:40', '4.8', 'Movies Digital'),
  createYtMovie('x2SeyqGjySs', 'MISSION PAK | Full Hindi Dubbed Movie | Allu Arjun & Kareena Kapoor', ['Allu Arjun', 'Kareena Kapoor'], '2:20:10', '4.8', 'Super South Movies'),
  createYtMovie('8wtBevf0GA8', "The Wolf's Revenge | Full Action Fantasy Movie | HD Stream", ['Action Cast'], '2h 22m', '4.8', 'Titan Entertainment'),
  createYtMovie('crEH4dKuKOY', 'Jason Statham & Josh Harnett ELITE SPY - Hollywood English Movie', ['Jason Statham', 'Josh Harnett'], '1h 45m', '4.8', 'Blockbuster English Movies'),
  createYtMovie('SO2XafPXgm0', 'AAKHRI CHAAL AB KAUN BACHEGA | Vijay Sethupathi | South Action Hindi Dubbed', ['Vijay Sethupathi'], '2:12:00', '4.8', 'Wam India Movie Talkies'),
  createYtMovie('MgXY8B4bXn0', 'Jason Statham In ONE MAN WAR - Hollywood Free English Movie HD', ['Jason Statham'], '1h 50m', '4.8', 'Hollywood English Collection'),
  createYtMovie('zeVWTY31Vn8', 'Top 30 Romantic Hindi Songs | Audio Jukebox | Bollywood Love Songs', ['Various Artists'], '2:30:00', '4.9', 'Sony Music India'),
  createYtMovie('LElOSR7cJyM', 'Top 20 Bollywood Romance | Audio Jukebox | Best Hindi Love Songs', ['Various Artists'], '1:45:00', '4.9', 'YRF Music'),
  createYtMovie('PWyXe6fzsmM', "Bollywood 90's Romantic Songs | Video Jukebox | Hindi Love Songs", ['Various Artists'], '1:55:00', '4.9', 'Tips Official'),
  createYtMovie('2ohXK1kSX8A', 'BLACK VIOLET : Angelina Jolie | New Action Movie | Full Movie 4K', ['Angelina Jolie'], '1h 33m', '4.8', 'Joy Drama'),
  createYtMovie('Vzg7hNXk7lo', 'THE MERGER - Latest Full Movie HD Stream', ['Uche Montana'], '1h 34m', '4.8', 'Uche Montana TV'),
  createYtMovie('9Tw7oOVaUEE', 'DEATH ORDER : Angelina Jolie | New Action Movie | Full Movie 4K', ['Angelina Jolie'], '1h 32m', '4.8', 'Joy Drama'),
  createYtMovie('KuEzbaxEdww', 'LOVE & FAITH - Latest Full Movie HD Stream', ['Chidi Dike', 'Ali Nuhu'], '1h 40m', '4.8', 'Amal motion pictures'),
  createYtMovie('qy5gcu2zRIs', 'SHADOW FIGHT : Jackie Chan | NEW ACTION Movie | Full Movie 4K', ['Jackie Chan'], '1h 36m', '4.8', 'X Drama'),
  createYtMovie('hNbRVElRkes', 'ENCOUNTER 2 | New Released Full Action Thriller South Hindi Dubbed Movie', ['South Action Cast'], '2:15:00', '4.8', 'Super South Movies'),
  createYtMovie('KpUHwT29n20', 'Revolver Rita | Keerthy Suresh South Action Movie HD', ['Keerthy Suresh'], '2:05:00', '4.8', 'RKD Studios')
];

export const MoviePlayPage: React.FC<MoviePlayPageProps> = ({
  movie,
  allMovies = [],
  onBack,
  onSelectRelatedMovie,
  onSelectCategory,
  onAdClick,
  onFullscreenChange,
  isSubscribed = false,
  enableBannerAd = true,
  bannerAppId = '208187630',
  onAdImpression
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFillScreen, setIsFillScreen] = useState(true); // Default true: fills entire mobile display edge-to-edge
  const [showControls, setShowControls] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  const [activeServerIndex, setActiveServerIndex] = useState(0);
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(0);

  // Reset server & episode index on movie change
  useEffect(() => {
    setActiveServerIndex(0);
    setActiveEpisodeIndex(0);
  }, [movie.id]);

  const hasEpisodes = Boolean(movie.episodes && movie.episodes.length > 0);
  const currentEpisode = hasEpisodes && movie.episodes ? movie.episodes[activeEpisodeIndex] || movie.episodes[0] : null;

  // Resolve active episode video source if episodes exist
  const resolvedEpisodeSource = useMemo(() => {
    if (!currentEpisode) return null;
    const epLink = currentEpisode.link || currentEpisode.url || currentEpisode.video || '';
    if (!epLink) return null;
    return resolvePostVideoSource({ video: epLink });
  }, [currentEpisode]);

  const activeServers = resolvedEpisodeSource?.servers && resolvedEpisodeSource.servers.length > 0
    ? resolvedEpisodeSource.servers
    : movie.streamServers || [];

  const currentServer = activeServers[activeServerIndex] || {
    name: 'Server 1',
    quality: '1080p HD',
    url: resolvedEpisodeSource?.playerUrl || movie.videoUrl,
    type: resolvedEpisodeSource?.type || movie.videoType || 'drc'
  };

  const activeUrl = currentServer.url || resolvedEpisodeSource?.playerUrl || movie.videoUrl || '';
  const isDriveEmbed =
    currentServer.type === 'gdrive' ||
    resolvedEpisodeSource?.type === 'gdrive' ||
    movie.videoType === 'gdrive' ||
    (typeof activeUrl === 'string' && activeUrl.startsWith('http') && (
      (activeUrl.includes('drive.google.com') && (activeUrl.includes('/preview') || activeUrl.includes('/view') || activeUrl.includes('/file/d/'))) ||
      (activeUrl.includes('docs.google.com') && activeUrl.includes('/preview'))
    ));

  const isYouTube =
    !isDriveEmbed && (
      currentServer.type === 'yt' ||
      resolvedEpisodeSource?.type === 'yt' ||
      movie.videoType === 'yt' ||
      activeUrl.includes('youtube.com') ||
      activeUrl.includes('youtu.be') ||
      (!hasEpisodes && Boolean(movie.yt))
    );

  const isIframePlayer = isYouTube || isDriveEmbed;

  // Normalized iframe embed source URL (auto formats any drive link to /preview)
  const iframeSrc = useMemo(() => {
    if (isDriveEmbed) {
      const driveId = cleanGoogleDriveId(activeUrl);
      if (driveId) {
        return `https://drive.google.com/file/d/${driveId}/preview`;
      }
      return activeUrl;
    }
    if (isYouTube) {
      return activeUrl.includes('youtube.com/embed')
        ? `${activeUrl}${activeUrl.includes('?') ? '&' : '?'}autoplay=1&enablejsapi=1&rel=0&playsinline=1&fs=0`
        : `https://www.youtube.com/embed/${movie.yt || movie.videoId || 'hf-EHqaybqI'}?autoplay=1&enablejsapi=1&rel=0&playsinline=1&fs=0`;
    }
    return activeUrl;
  }, [isDriveEmbed, isYouTube, activeUrl, movie.yt, movie.videoId]);

  // Playlist management states
  const [showFullscreenPlaylist, setShowFullscreenPlaylist] = useState(false);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [playlistViewMode, setPlaylistViewMode] = useState<'grid' | 'list'>('grid');

  const goToNextEpisode = () => {
    if (movie.episodes && activeEpisodeIndex < movie.episodes.length - 1) {
      setActiveEpisodeIndex((prev) => prev + 1);
      setActiveServerIndex(0);
      setIsVideoBuffering(true);
      if (isFullscreen) {
        try {
          if ((window as any).Android && typeof (window as any).Android.setLandscape === 'function') {
            (window as any).Android.setLandscape();
          }
        } catch {}
        try {
          if (screen.orientation && 'lock' in screen.orientation) {
            (screen.orientation as any).lock('landscape').catch(() => {});
          }
        } catch {}
      }
    }
  };

  const goToPrevEpisode = () => {
    if (movie.episodes && activeEpisodeIndex > 0) {
      setActiveEpisodeIndex((prev) => prev - 1);
      setActiveServerIndex(0);
      setIsVideoBuffering(true);
      if (isFullscreen) {
        try {
          if ((window as any).Android && typeof (window as any).Android.setLandscape === 'function') {
            (window as any).Android.setLandscape();
          }
        } catch {}
        try {
          if (screen.orientation && 'lock' in screen.orientation) {
            (screen.orientation as any).lock('landscape').catch(() => {});
          }
        } catch {}
      }
    }
  };

  const filteredEpisodes = useMemo(() => {
    if (!movie.episodes) return [];
    if (!episodeSearchQuery.trim()) return movie.episodes;
    const q = episodeSearchQuery.toLowerCase().trim();
    return movie.episodes.filter((ep, idx) => {
      const titleMatch = (ep.title || '').toLowerCase().includes(q);
      const numMatch = String(idx + 1) === q || `ep ${idx + 1}`.includes(q) || `episode ${idx + 1}`.includes(q);
      return titleMatch || numMatch;
    });
  }, [movie.episodes, episodeSearchQuery]);

  // Dynamic viewport dimension tracking for pixel-perfect CSS landscape on portrait devices
  const [viewportDim, setViewportDim] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 360,
    height: typeof window !== 'undefined' ? window.innerHeight : 640
  }));

  const isPortraitViewport = viewportDim.height > viewportDim.width;

  useEffect(() => {
    const updateDimensions = () => {
      setViewportDim({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
    };
  }, []);

  // Auto-play when opened
  useEffect(() => {
    setIsVideoBuffering(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  }, [movie, activeUrl]);

  // Notify parent component about fullscreen state changes
  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  // Synchronize fullscreen change & screen orientation lock/unlock
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );
      if (isCurrentlyFs) {
        setIsFullscreen(true);
      } else {
        setIsFullscreen(false);
        try {
          if (screen.orientation && 'unlock' in screen.orientation) {
            screen.orientation.unlock();
          }
        } catch {}
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      try {
        if (screen.orientation && 'unlock' in screen.orientation) {
          screen.orientation.unlock();
        }
      } catch {}
    };
  }, []);

  // Controls auto-hide timer in fullscreen
  useEffect(() => {
    if (!isFullscreen || !isPlaying) {
      setShowControls(true);
      return;
    }
    const timer = setTimeout(() => {
      setShowControls(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, [isFullscreen, isPlaying, showControls]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      setIsVideoBuffering(true);
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      setIsVideoBuffering(true);
      videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  /**
   * Fullscreen toggle:
   * 1. Requests native immersive fullscreen with navigationUI: 'hide'
   *    (completely hides Android status bar & bottom navigation bar)
   * 2. Attempts native orientation lock to landscape
   * 3. Uses pixel-perfect CSS landscape rotation if device stays portrait
   */
  const toggleFullscreen = async () => {
    const container = playerContainerRef.current;
    if (!container) return;

    if (isFullscreen) {
      // Exit fullscreen
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
        }
      } catch {}

      try {
        if ((window as any).Android && typeof (window as any).Android.unlockOrientation === 'function') {
          (window as any).Android.unlockOrientation();
        }
      } catch {}
      try {
        if (screen.orientation && 'unlock' in screen.orientation) {
          screen.orientation.unlock();
        }
      } catch {}
    } else {
      // Enter fullscreen: completely hide Android navigation bar and status bar
      setIsFullscreen(true);
      await hideSystemNavigation();

      try {
        const reqOpts = { navigationUI: 'hide' as const };
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen(reqOpts);
        } else if (container.requestFullscreen) {
          await container.requestFullscreen(reqOpts);
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen();
        }
      } catch (err) {
        console.warn('Native requestFullscreen denied or restricted:', err);
      }

      // Force landscape orientation
      try {
        if ((window as any).Android && typeof (window as any).Android.setLandscape === 'function') {
          (window as any).Android.setLandscape();
        }
      } catch {}
      try {
        if (screen.orientation && 'lock' in screen.orientation) {
          await (screen.orientation as any).lock('landscape');
        }
      } catch {
        // Handled by CSS rotation below
      }

      // iOS Safari fallback
      try {
        if ((videoRef.current as any)?.webkitEnterFullscreen) {
          (videoRef.current as any).webkitEnterFullscreen();
        }
      } catch {}
    }
  };

  /**
   * Manual Rotate button: switches orientation between landscape and portrait
   */
  const handleManualRotate = async () => {
    if (!isFullscreen) {
      toggleFullscreen();
      return;
    }

    try {
      if (screen.orientation && 'lock' in screen.orientation) {
        const isCurrentlyLandscape = screen.orientation.type.includes('landscape');
        if (isCurrentlyLandscape) {
          await (screen.orientation as any).lock('portrait');
        } else {
          await (screen.orientation as any).lock('landscape');
        }
      }
    } catch {}
  };

  const handleShare = async () => {
    const shareUrl = 'https://vdoskay.blogspot.com';
    const shareData = {
      title: `${movie.title} - Watch on VDOSKy`,
      text: `Watch ${movie.title} online in HD on VDOSKy! Explore 3000+ movies & live streams.`,
      url: shareUrl
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err && err.name === 'AbortError') return;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      } else {
        window.prompt('Share link (Copy and share to WhatsApp, Facebook, etc.):', shareUrl);
      }
    } catch {
      window.prompt('Share link (Copy and share to WhatsApp, Facebook, etc.):', shareUrl);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  // Related movies (up to 20 posts) based on Category, Cast, and Title
  const relatedMovies = React.useMemo(() => {
    const pool = (allMovies.length > 0 ? allMovies : SAMPLE_MOVIES);
    const candidates = pool.filter((m) => m.id !== movie.id && m.title !== movie.title);
    const curCat = (movie.category || '').toLowerCase();
    const curCast = Array.isArray(movie.cast) ? movie.cast.map(c => c.toLowerCase()) : [];
    const curWords = (movie.title || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const scored = candidates.map((m) => {
      let score = 0;
      const mCat = (m.category || '').toLowerCase();
      const mCast = Array.isArray(m.cast) ? m.cast.map(c => c.toLowerCase()) : [];
      const mTitle = (m.title || '').toLowerCase();

      if (curCat && mCat && (curCat === mCat || mCat.includes(curCat))) score += 40;
      if (curCast.length > 0 && mCast.length > 0) {
        const hasOverlap = curCast.some(c => mCast.some(mc => mc.includes(c) || c.includes(mc)));
        if (hasOverlap) score += 25;
      }
      for (const w of curWords) {
        if (mTitle.includes(w)) score += 15;
      }
      score += parseFloat(m.rating) || 0;
      return { m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(0, 20).map((s) => s.m);

    if (result.length < 20) {
      for (const cand of candidates) {
        if (result.length >= 20) break;
        if (!result.includes(cand)) result.push(cand);
      }
    }
    return result.slice(0, 20);
  }, [allMovies, movie]);

  // YouTube-specific 20 related posts (loaded dynamically from YouTube when isYouTube is true)
  const [ytRelatedMovies, setYtRelatedMovies] = useState<Movie[]>(() => CURATED_YT_MOVIES.slice(0, 20));

  useEffect(() => {
    if (!isYouTube) return;
    let isCancelled = false;

    const fetchYtPosts = async () => {
      try {
        const rawTitle = movie.title || 'Hindi Movie';
        const curYtId = movie.yt || '';

        const POPULAR_ACTORS = [
          'Allu Arjun', 'Prabhas', 'Ram Charan', 'Jr NTR', 'NTR', 'Mahesh Babu',
          'Thalapathy Vijay', 'Vijay', 'Ajith Kumar', 'Ajith', 'Suriya', 'Dhanush',
          'Chiyaan Vikram', 'Vikram', 'Kamal Haasan', 'Rajinikanth', 'Yash', 'Rishab Shetty',
          'Ravi Teja', 'Nani', 'Vijay Sethupathi', 'Sivakarthikeyan', 'Karthi', 'Nagarjuna',
          'Salman Khan', 'Shah Rukh Khan', 'Aamir Khan', 'Akshay Kumar', 'Ajay Devgn', 'Ajay Devgan',
          'Hrithik Roshan', 'Ranbir Kapoor', 'Ranveer Singh', 'Shahid Kapoor', 'Sunny Deol', 'Bobby Deol',
          'Amitabh Bachchan', 'Sanjay Dutt', 'John Abraham', 'Tiger Shroff', 'Varun Dhawan', 'Sidharth Malhotra',
          'Deepika Padukone', 'Katrina Kaif', 'Samantha', 'Rashmika Mandanna', 'Nayanthara', 'Kareena Kapoor'
        ];

        let actorName = '';
        for (const actor of POPULAR_ACTORS) {
          const reg = new RegExp('\\b' + actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
          if (reg.test(rawTitle)) {
            actorName = actor;
            break;
          }
        }
        if (!actorName && Array.isArray(movie.cast)) {
          const castStr = movie.cast.join(' ');
          for (const actor of POPULAR_ACTORS) {
            const reg = new RegExp('\\b' + actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            if (reg.test(castStr)) {
              actorName = actor;
              break;
            }
          }
        }

        let cleanTitle = rawTitle
          .replace(/\[[^\]]*\]/g, ' ')
          .replace(/\((19|20)\d{2}\)/g, ' ')
          .replace(/\b(full\s+movie|hindi\s+dubbed|blockbuster|superhit|action|comedy|movie|hd|4k|1080p|720p|latest|new)\b/gi, ' ');
        if (actorName) {
          cleanTitle = cleanTitle.replace(new RegExp('\\b' + actorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' ');
        }
        cleanTitle = cleanTitle.replace(/[|:–—].*$/, ' ').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

        const isSameMovie = (t: string) => {
          if (!cleanTitle || cleanTitle.length < 3) return false;
          const tLow = (t || '').toLowerCase();
          const cLow = cleanTitle.toLowerCase();
          if (tLow.includes(cLow)) return true;
          const words = cLow.split(/\s+/).filter(w => w.length > 2);
          if (words.length > 0 && words.filter(w => tLow.includes(w)).length >= Math.min(2, words.length)) return true;
          return false;
        };

        const res = await fetch(`/api/youtube-related?q=${encodeURIComponent(rawTitle)}&actor=${encodeURIComponent(actorName)}&exclude=${encodeURIComponent(cleanTitle)}&v=${encodeURIComponent(curYtId)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0 && !isCancelled) {
            const filteredData = data.filter((v: any) => !isSameMovie(v.title));
            const mapped: Movie[] = filteredData.map((v: any) => ({
              id: v.videoId || v.yt || v.id,
              title: v.title,
              rating: v.rating || '4.8',
              category: 'youtube',
              categoryLabel: 'YouTube Video',
              genres: ['YouTube', 'Video'],
              poster: v.poster || `https://i.ytimg.com/vi/${v.videoId || v.yt}/hqdefault.jpg`,
              backdrop: v.poster || `https://i.ytimg.com/vi/${v.videoId || v.yt}/hqdefault.jpg`,
              yt: v.videoId || v.yt,
              videoType: 'yt',
              videoUrl: `https://www.youtube.com/embed/${v.videoId || v.yt}`,
              cast: [v.channel || 'YouTube Creator'],
              description: v.title,
              duration: v.duration || 'Full HD',
              streamServers: [
                { name: 'YouTube Stream HD', quality: '1080p', url: `https://www.youtube.com/embed/${v.videoId || v.yt}`, type: 'yt' }
              ]
            }));

            // Complement with CURATED_YT_MOVIES if less than 20
            if (mapped.length < 20) {
              const seen = new Set(mapped.map(m => m.id));
              if (curYtId) seen.add(curYtId);
              for (const c of CURATED_YT_MOVIES) {
                if (mapped.length >= 20) break;
                if (!seen.has(c.id) && !isSameMovie(c.title)) {
                  seen.add(c.id);
                  mapped.push(c);
                }
              }
            }

            setYtRelatedMovies(mapped.slice(0, 20));
            return;
          }
        }
      } catch {}

      if (!isCancelled) {
        // Fallback to sorted curated YouTube catalog
        const curWords = (movie.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const sorted = [...CURATED_YT_MOVIES].sort((a, b) => {
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();
          let aScore = 0;
          let bScore = 0;
          for (const w of curWords) {
            if (aTitle.includes(w)) aScore += 10;
            if (bTitle.includes(w)) bScore += 10;
          }
          return bScore - aScore;
        });
        setYtRelatedMovies(sorted.slice(0, 20));
      }
    };

    fetchYtPosts();
    return () => {
      isCancelled = true;
    };
  }, [movie.id, movie.title, movie.yt, isYouTube]);

  // Determine whether to apply 90-degree CSS rotation:
  // When in fullscreen and device is still physically in portrait mode (orientation lock not supported by browser)
  const isCssLandscape = isFullscreen && isPortraitViewport;

  const handleBackToMovies = async () => {
    if (isFullscreen) {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
        }
      } catch {}
      try {
        if (screen.orientation && 'unlock' in screen.orientation) {
          screen.orientation.unlock();
        }
      } catch {}
    }
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-gray-100 pb-28 animate-fadeIn">
      
      {/* Top Breadcrumb Header (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="bg-[#0f131c] border-b border-gray-800 px-3 sm:px-6 py-2.5 sticky top-0 z-30 flex items-center justify-between">
          <button
            id="btn-back-to-home"
            onClick={handleBackToMovies}
            className="flex items-center gap-1.5 text-white hover:text-red-400 font-extrabold text-xs sm:text-sm bg-gray-800/90 hover:bg-gray-750 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow"
          >
            <ArrowLeft className="w-4 h-4 text-red-500" />
            <span>Back to Movies</span>
          </button>

          <div className="flex items-center gap-2 truncate max-w-[220px] sm:max-w-md">
            <VDOSKyLogo size={24} />
            <div className="text-right truncate">
              <span className="text-[10px] text-gray-400 block leading-tight">Now Playing on VDOSKy</span>
              <h2 className="text-xs sm:text-sm font-bold text-white truncate leading-tight">{movie.title}</h2>
            </div>
          </div>
        </div>
      )}

      <div className={isFullscreen ? 'p-0 m-0' : 'max-w-5xl mx-auto px-2.5 sm:px-6 pt-3 sm:pt-5'}>

        {/* Video Player Container */}
        <div
          ref={playerContainerRef}
          id="main-video-player-container"
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(isPlaying ? false : true)}
          onClick={() => setShowControls((prev) => !prev)}
          className={
            isFullscreen
              ? 'fixed inset-0 z-[999999] bg-black overflow-hidden w-screen h-screen select-none'
              : 'relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800 group select-none'
          }
        >
          {/* Inner Player Stage (rotates 90deg to fill 100% of screen if held in portrait) */}
          <div
            className="relative bg-black overflow-hidden w-full h-full"
            style={
              isCssLandscape
                ? {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${viewportDim.height}px`, // full height of phone becomes landscape width
                    height: `${viewportDim.width}px`, // full width of phone becomes landscape height
                    transform: 'rotate(90deg) translateY(-100%)',
                    transformOrigin: 'top left',
                    zIndex: 10
                  }
                : {
                    width: '100%',
                    height: '100%',
                    position: 'relative'
                  }
            }
          >
            {/* Video Player Display: YouTube / Drive Preview Embed OR HTML5 / Plyr Direct */}
            {isIframePlayer ? (
              <>
                <iframe
                  key={iframeSrc}
                  src={iframeSrc}
                  title={currentEpisode ? `${movie.title} - ${currentEpisode.title}` : movie.title}
                  className="w-full h-full border-0 absolute inset-0 block m-0 p-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  onLoad={() => setIsVideoBuffering(false)}
                />

                {/* Floating Quick Action Overlay for Iframe Players (Fullscreen & Rotate buttons) */}
                {!isFullscreen && (
                  <div
                    className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      id="btn-iframe-rotate"
                      onClick={handleManualRotate}
                      className="p-1.5 bg-black/80 hover:bg-black text-cyan-400 border border-cyan-500/40 rounded-xl transition-all cursor-pointer backdrop-blur-md shadow-xl flex items-center gap-1 text-[11px] font-bold"
                      title="Rotate to Landscape"
                    >
                      <Smartphone className="w-3.5 h-3.5 rotate-90" />
                      <span className="hidden sm:inline">Rotate</span>
                    </button>
                    <button
                      type="button"
                      id="btn-iframe-fullscreen"
                      onClick={toggleFullscreen}
                      className="px-3 py-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-xl transition-all cursor-pointer backdrop-blur-md shadow-xl flex items-center gap-1.5 text-xs font-black active:scale-95"
                      title="Fullscreen Landscape (Full Display)"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Fullscreen</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <video
                ref={videoRef}
                src={activeUrl}
                onTimeUpdate={handleTimeUpdate}
                onSeeking={() => setIsVideoBuffering(true)}
                onSeeked={() => {
                  if (videoRef.current && videoRef.current.readyState >= 3) {
                    setIsVideoBuffering(false);
                  }
                }}
                onWaiting={() => setIsVideoBuffering(true)}
                onLoadStart={() => setIsVideoBuffering(true)}
                onStalled={() => setIsVideoBuffering(true)}
                onPlaying={() => {
                  setIsPlaying(true);
                  setIsVideoBuffering(false);
                }}
                onLoadedData={() => setIsVideoBuffering(false)}
                onCanPlay={() => setIsVideoBuffering(false)}
                onCanPlayThrough={() => setIsVideoBuffering(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  if (autoPlayNext && hasEpisodes) {
                    if (isFullscreen) {
                      try {
                        if ((window as any).Android && typeof (window as any).Android.setLandscape === 'function') {
                          (window as any).Android.setLandscape();
                        }
                      } catch {}
                      try {
                        if (screen.orientation && 'lock' in screen.orientation) {
                          (screen.orientation as any).lock('landscape').catch(() => {});
                        }
                      } catch {}
                    }
                    goToNextEpisode();
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className={`w-full h-full cursor-pointer transition-all duration-200 ${
                  isFullscreen && isFillScreen
                    ? 'object-cover' // Full Edge-to-edge screen fill with ZERO black bars
                    : 'object-contain' // Original aspect ratio
                }`}
                playsInline
              />
            )}

            {/* Buffering Stream Spinner (Centered in both Normal & Fullscreen Mode) */}
            {isVideoBuffering && !isIframePlayer && (
              <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none z-40 animate-fadeIn">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 border-white/15 border-t-red-500 border-r-cyan-400 animate-spin mb-3 shadow-[0_0_25px_rgba(0,210,255,0.45)]" />
                <span className="text-xs sm:text-sm font-extrabold text-white tracking-wider drop-shadow-lg">
                  Buffering Stream...
                </span>
              </div>
            )}

            {/* Big Center Play/Pause button when paused (HTML5 video only) */}
            {!isIframePlayer && !isPlaying && !isVideoBuffering && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer z-20"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all">
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white translate-x-1" />
                </div>
              </div>
            )}

            {/* Top Bar inside Fullscreen */}
            {isFullscreen && (
              <div
                className={`absolute top-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
                  showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    id="btn-player-exit-fs"
                    onClick={toggleFullscreen}
                    className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg active:scale-95"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Exit Fullscreen</span>
                  </button>

                  <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px] sm:max-w-md drop-shadow">
                    {currentEpisode ? `${movie.title} (${currentEpisode.title})` : movie.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {/* Fullscreen Episode Playlist Drawer Toggle */}
                  {hasEpisodes && movie.episodes && (
                    <button
                      onClick={() => setShowFullscreenPlaylist(!showFullscreenPlaylist)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow border ${
                        showFullscreenPlaylist
                          ? 'bg-red-600 text-white border-red-500 font-black'
                          : 'bg-gray-800/90 hover:bg-gray-700 text-cyan-300 border-gray-700'
                      }`}
                      title="Open Episode Playlist"
                    >
                      <ListVideo className="w-3.5 h-3.5" />
                      <span>Playlist ({movie.episodes.length})</span>
                    </button>
                  )}

                  {/* Screen Fit (Fill vs Fit 16:9) Toggle */}
                  <button
                    onClick={() => setIsFillScreen(!isFillScreen)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow border ${
                      isFillScreen
                        ? 'bg-[#00b4d8] text-black border-[#00b4d8] font-black'
                        : 'bg-gray-800/90 hover:bg-gray-700 text-white border-gray-700'
                    }`}
                    title={isFillScreen ? 'Switch to Original 16:9 Fit' : 'Fill Entire Screen (Puro Screen)'}
                  >
                    <Scaling className="w-3.5 h-3.5" />
                    <span>{isFillScreen ? 'Puro Screen (Fill)' : 'Fit (16:9)'}</span>
                  </button>

                  {/* Manual Rotate Button */}
                  <button
                    onClick={handleManualRotate}
                    className="p-1.5 bg-gray-800/90 hover:bg-gray-700 text-cyan-400 border border-gray-700 rounded-xl transition-all cursor-pointer"
                    title="Rotate Screen"
                  >
                    <Smartphone className="w-4 h-4 rotate-90" />
                  </button>
                </div>
              </div>
            )}

            {/* Fullscreen Slide-in Playlist Drawer */}
            {isFullscreen && showFullscreenPlaylist && hasEpisodes && movie.episodes && (
              <div
                className="absolute inset-y-0 right-0 w-72 sm:w-80 bg-black/92 backdrop-blur-md z-40 border-l border-gray-800 flex flex-col p-4 animate-fadeIn pointer-events-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
                  <div className="flex items-center gap-2">
                    <ListVideo className="w-4 h-4 text-red-500" />
                    <h4 className="text-sm font-bold text-white">Playlist ({movie.episodes.length})</h4>
                  </div>
                  <button
                    onClick={() => setShowFullscreenPlaylist(false)}
                    className="p-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span className="truncate max-w-[170px]">Now: {movie.episodes[activeEpisodeIndex]?.title || `Episode ${activeEpisodeIndex + 1}`}</span>
                  <span className="text-[11px] font-mono text-cyan-400 shrink-0">{activeEpisodeIndex + 1} / {movie.episodes.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {movie.episodes.map((ep, idx) => {
                    const isCur = idx === activeEpisodeIndex;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveEpisodeIndex(idx);
                          setActiveServerIndex(0);
                          setIsVideoBuffering(true);
                          setShowFullscreenPlaylist(false);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between cursor-pointer transition-all ${
                          isCur
                            ? 'bg-red-600 text-white shadow-md'
                            : 'bg-gray-900/80 hover:bg-gray-800 text-gray-300 border border-gray-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                            isCur ? 'bg-white text-red-600' : 'bg-gray-800 text-gray-400'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="truncate">{ep.title || `Episode ${idx + 1}`}</span>
                        </div>
                        {isCur && <span className="text-[10px] font-bold uppercase tracking-wider bg-black/40 px-1.5 py-0.5 rounded">Playing</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Controls Bar (HTML5 video only; YouTube/Embeds use native player controls) */}
            {!isIframePlayer && (
              <div
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent p-2.5 sm:p-4 transition-opacity duration-300 z-30 pointer-events-auto ${
                  showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Scrubber Range */}
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onPointerDown={() => setIsVideoBuffering(true)}
                  onMouseDown={() => setIsVideoBuffering(true)}
                  onTouchStart={() => setIsVideoBuffering(true)}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                />

                <div className="flex items-center justify-between mt-2 text-xs sm:text-sm text-gray-200">
                  {/* Left Controls: Play/Pause, Rewind, Forward, Time */}
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    <button
                      id="btn-player-play-pause"
                      onClick={togglePlay}
                      className="p-1 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>

                    <button
                      onClick={() => skipTime(-10)}
                      className="p-1 text-gray-300 hover:text-white transition-colors cursor-pointer"
                      title="Rewind 10s"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => skipTime(10)}
                      className="p-1 text-gray-300 hover:text-white transition-colors cursor-pointer"
                      title="Forward 10s"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    <span className="text-[10px] sm:text-xs text-gray-400 font-mono ml-1">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  {/* Right Controls: Volume, Fill/Fit, Rotate, HD, Fullscreen */}
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    <div className="flex items-center gap-1 group/volume">
                      <button onClick={toggleMute} className="hover:text-red-400 cursor-pointer">
                        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-12 sm:w-20 h-1 bg-gray-600 rounded cursor-pointer accent-red-600 hidden xs:inline"
                      />
                    </div>

                    {/* Toggle Screen Fill / Fit (Puro Screen) */}
                    <button
                      onClick={() => setIsFillScreen(!isFillScreen)}
                      className="p-1 hover:text-cyan-400 text-gray-300 transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                      title={isFillScreen ? 'Crop to Fill is ON (Click for Fit)' : 'Click for Puro Screen (Fill)'}
                    >
                      <Expand className="w-4 h-4 text-cyan-400" />
                      <span className="hidden md:inline text-[10px]">{isFillScreen ? 'Fill' : 'Fit'}</span>
                    </button>

                    {/* Rotate Button */}
                    <button
                      onClick={handleManualRotate}
                      className="p-1 hover:text-cyan-400 text-gray-300 transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                      title="Rotate Screen (Landscape/Portrait)"
                    >
                      <Smartphone className="w-4 h-4 rotate-90 text-cyan-400" />
                      <span className="hidden sm:inline text-[10px]">Rotate</span>
                    </button>

                    <span className="bg-red-600/30 text-red-300 text-[10px] font-black px-1.5 py-0.5 rounded border border-red-500/40">
                      HD
                    </span>

                    {/* Fullscreen Toggle Button */}
                    <button
                      id="btn-player-fullscreen-toggle"
                      onClick={toggleFullscreen}
                      className="p-1 hover:text-red-400 transition-colors cursor-pointer"
                      title="Toggle Fullscreen (Full Display)"
                    >
                      {isFullscreen ? <Minimize2 className="w-4 h-4 text-cyan-400" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Start.io Native Ad Placed Directly Below Player (hidden in fullscreen & blocked if user has VIP subscription) */}
        {!isFullscreen && !isSubscribed && (
          <StartIoNativeAd
            variant="player-inline"
            adIndex={1}
            onAdClick={onAdClick}
          />
        )}

        {!isFullscreen && (
          <>
            {/* Movie Title & Essential Details */}
            <div className="mt-4 bg-[#111724] border border-gray-800/90 rounded-2xl p-4 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="bg-amber-400/20 text-amber-400 border border-amber-400/40 text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                      ★ {movie.rating}
                    </span>
                    <span className="bg-gray-800 text-gray-300 text-xs font-semibold px-2 py-0.5 rounded">
                      {movie.year}
                    </span>
                    <span className="bg-gray-800 text-gray-300 text-xs font-semibold px-2 py-0.5 rounded">
                      {movie.duration}
                    </span>

                    {/* Clickable Category Badge: Opens all posts in this category */}
                    <button
                      type="button"
                      onClick={() => onSelectCategory && onSelectCategory(movie.category, movie.categoryLabel)}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-red-500/40 transition-all cursor-pointer flex items-center gap-1 active:scale-95 group/cat"
                      title={`View all posts in ${movie.categoryLabel}`}
                    >
                      <span>{movie.categoryLabel}</span>
                      <span className="text-[10px] text-red-400 group-hover/cat:translate-x-0.5 transition-transform font-bold">›</span>
                    </button>

                    {/* Source Player Badge */}
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded border ${
                        isYouTube
                          ? 'bg-red-500/20 text-red-400 border-red-500/40'
                          : movie.videoType === 'video'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      {isYouTube ? 'YouTube Supported Player' : movie.videoType === 'video' ? 'Worker CDN 1080p' : 'Plyr Direct 1080p'}
                    </span>
                  </div>

                  <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
                    {movie.title}
                  </h1>

                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1.5 flex-wrap">
                    <span className="font-semibold text-gray-300">Audio:</span>
                    {(movie.audioLanguages || ['Hindi (Original)']).map((lang) => (
                      <span key={lang} className="bg-gray-800/80 text-gray-300 px-2 py-0.5 rounded text-[11px]">
                        {lang}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {(movie.genres || []).map((g) => (
                      <span key={g} className="text-xs bg-gray-800 text-cyan-300/90 px-2.5 py-0.5 rounded-md border border-gray-700">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setIsBookmarked(!isBookmarked)}
                    className={`p-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                      isBookmarked
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white'
                    }`}
                    title="Save to Watchlist"
                  >
                    {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    <span>{isBookmarked ? 'Saved' : 'Watchlist'}</span>
                  </button>
                </div>
              </div>

              {/* Comprehensive Episodes & Playlist System */}
              {hasEpisodes && movie.episodes && movie.episodes.length > 0 && (
                <div className="mt-4 bg-[#0d121c] border border-gray-800/90 rounded-2xl p-4 sm:p-5 shadow-xl">
                  {/* Playlist Top Toolbar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-800/80">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <ListVideo className="w-5 h-5 text-red-500" />
                        <h3 className="text-sm sm:text-base font-extrabold text-white tracking-wide">
                          Web Series Playlist
                        </h3>
                        <span className="text-[11px] font-bold bg-red-600/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">
                          Season 1 ({movie.episodes.length} Episodes)
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                        <span className="text-cyan-400 font-semibold">Now Playing:</span>
                        <span className="text-white font-bold truncate max-w-[220px] sm:max-w-md">
                          {movie.episodes[activeEpisodeIndex]?.title || `Episode ${activeEpisodeIndex + 1}`}
                        </span>
                      </p>
                    </div>

                    {/* Quick Action Controls: Prev, Next, Auto-Next */}
                    <div className="flex items-center gap-2 flex-wrap self-stretch sm:self-auto justify-between sm:justify-end">
                      {/* Auto-Next Toggle */}
                      <button
                        onClick={() => setAutoPlayNext(!autoPlayNext)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                          autoPlayNext
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                        }`}
                        title="Toggle automatic next episode transition"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${autoPlayNext ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                        <span>Auto-Next: {autoPlayNext ? 'ON' : 'OFF'}</span>
                      </button>

                      {/* Navigation buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={activeEpisodeIndex === 0}
                          onClick={goToPrevEpisode}
                          className="px-2.5 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-1 cursor-pointer transition-all font-semibold"
                          title="Previous Episode"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Prev
                        </button>
                        <button
                          disabled={!movie.episodes || activeEpisodeIndex >= movie.episodes.length - 1}
                          onClick={goToNextEpisode}
                          className="px-2.5 py-1 text-xs rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-1 cursor-pointer transition-all font-semibold shadow-md"
                          title="Next Episode"
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={toggleFullscreen}
                          className="px-2.5 py-1 text-xs rounded-lg bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 hover:text-white flex items-center gap-1 cursor-pointer transition-all font-semibold shadow-md"
                          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Video"}
                        >
                          {isFullscreen ? (
                            <>
                              <Minimize2 className="w-3.5 h-3.5" /> Exit FS
                            </>
                          ) : (
                            <>
                              <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Filter and View Mode Switcher */}
                  <div className="flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2.5 my-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={episodeSearchQuery}
                        onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                        placeholder={`Search in ${movie.episodes.length} episodes (e.g. 15)...`}
                        className="w-full bg-gray-900 border border-gray-800 text-xs text-white pl-8 pr-7 py-1.5 rounded-xl placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                      />
                      {episodeSearchQuery && (
                        <button
                          onClick={() => setEpisodeSearchQuery('')}
                          className="absolute right-2.5 top-2 text-gray-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 self-end xs:self-auto text-xs text-gray-400">
                      <span className="text-[11px] font-mono mr-1">
                        Showing {filteredEpisodes.length} of {movie.episodes.length}
                      </span>
                      <button
                        onClick={() => setPlaylistViewMode('grid')}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                          playlistViewMode === 'grid'
                            ? 'bg-red-600/30 text-red-300 border-red-500/50'
                            : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'
                        }`}
                      >
                        Grid
                      </button>
                      <button
                        onClick={() => setPlaylistViewMode('list')}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                          playlistViewMode === 'list'
                            ? 'bg-red-600/30 text-red-300 border-red-500/50'
                            : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'
                        }`}
                      >
                        List
                      </button>
                    </div>
                  </div>

                  {/* Episodes List / Grid Container */}
                  {playlistViewMode === 'grid' ? (
                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 max-h-80 overflow-y-auto pr-1">
                      {filteredEpisodes.map((ep, originalIdx) => {
                        const actualIdx = movie.episodes?.indexOf(ep) ?? originalIdx;
                        const isCurrent = actualIdx === activeEpisodeIndex;
                        return (
                          <button
                            key={actualIdx}
                            onClick={() => {
                              setActiveEpisodeIndex(actualIdx);
                              setActiveServerIndex(0);
                              setIsVideoBuffering(true);
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 active:scale-95 ${
                              isCurrent
                                ? 'bg-gradient-to-br from-red-600/35 to-red-950/70 border-red-500 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-500'
                                : 'bg-gray-900/80 hover:bg-gray-800 border-gray-800 text-gray-300 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                isCurrent ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'
                              }`}>
                                EP {actualIdx + 1}
                              </span>
                              {isCurrent ? (
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                                  <span className="text-[9px] font-bold text-red-300 uppercase tracking-wider">Live</span>
                                </div>
                              ) : (
                                <Play className="w-3 h-3 text-gray-500" />
                              )}
                            </div>
                            <span className="text-xs font-semibold truncate text-white" title={ep.title}>
                              {ep.title || `Episode ${actualIdx + 1}`}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                              <span>Drive HD</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {filteredEpisodes.map((ep, originalIdx) => {
                        const actualIdx = movie.episodes?.indexOf(ep) ?? originalIdx;
                        const isCurrent = actualIdx === activeEpisodeIndex;
                        return (
                          <button
                            key={actualIdx}
                            onClick={() => {
                              setActiveEpisodeIndex(actualIdx);
                              setActiveServerIndex(0);
                              setIsVideoBuffering(true);
                            }}
                            className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99] ${
                              isCurrent
                                ? 'bg-gradient-to-r from-red-950/60 via-red-900/40 to-gray-900 border-red-500 text-white shadow-md ring-1 ring-red-500'
                                : 'bg-gray-900/70 hover:bg-gray-800 border-gray-800 text-gray-300 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                isCurrent ? 'bg-red-600 text-white shadow-md' : 'bg-gray-800 text-gray-300'
                              }`}>
                                {actualIdx + 1}
                              </span>
                              <div className="min-w-0">
                                <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                                  {ep.title || `Episode ${actualIdx + 1}`}
                                </h4>
                                <p className="text-[11px] text-gray-400">
                                  Google Drive Video Preview · Fast Stream
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isCurrent ? (
                                <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  Now Playing
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Play
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Streaming Server Switcher Pills */}
              {activeServers && activeServers.length > 0 && (
                <div className="mt-3.5 bg-gray-900/70 p-2.5 sm:p-3 rounded-xl border border-gray-800 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-400 flex items-center gap-1 shrink-0">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Stream Server:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {activeServers.map((srv, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveServerIndex(idx);
                          setIsVideoBuffering(true);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                          idx === activeServerIndex
                            ? 'bg-gradient-to-r from-red-600 to-cyan-500 text-white shadow-md font-bold'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                        }`}
                      >
                        <span>{srv.name}</span>
                        <span className="text-[10px] opacity-75 font-mono">({srv.quality})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Synopsis & Cast */}
              <div className="mt-5 border-t border-gray-800/80 pt-4">
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Movie Synopsis &amp; Cast
                </h3>
                <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                  {movie.description || `${movie.title} starring ${movie.cast.join(', ')}.`}
                </p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
                  <div>
                    <strong className="text-gray-300">Category:</strong> {movie.categoryLabel}
                  </div>
                  <div>
                    <strong className="text-gray-300">Cast:</strong> {movie.cast.join(', ')}
                  </div>
                </div>
              </div>
            </div>

            {/* Related Movies Section (20 Posts) */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-5 rounded-full ${isYouTube ? 'bg-red-600' : 'bg-cyan-500'}`} />
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    {isYouTube ? (
                      <>
                        <Youtube className="w-5 h-5 text-red-500" />
                        Related YouTube Videos
                      </>
                    ) : (
                      'Related Movies & Recommendations'
                    )}
                  </h2>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${isYouTube ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'}`}>
                  {isYouTube ? `${ytRelatedMovies.length || 20} YouTube Posts` : `${relatedMovies.length} Posts`}
                </span>
              </div>

              {isYouTube ? (
                /* YouTube Single-Single Post Feed (1 post per row, like authentic YouTube) */
                <div className="flex flex-col gap-4 w-full pb-8">
                  {(ytRelatedMovies.length > 0 ? ytRelatedMovies : CURATED_YT_MOVIES.slice(0, 20)).map((relMovie) => {
                    const channelName = Array.isArray(relMovie.cast) && relMovie.cast.length > 0
                      ? relMovie.cast[0]
                      : 'YouTube Channel';

                    return (
                      <div
                        key={relMovie.id}
                        onClick={() => onSelectRelatedMovie(relMovie)}
                        className="w-full flex flex-col bg-[#11141c] hover:bg-[#161b26] rounded-2xl overflow-hidden border border-white/10 hover:border-red-600 transition-all cursor-pointer shadow-lg hover:shadow-red-600/20 group select-none"
                      >
                        {/* 16:9 Landscape YouTube Thumbnail */}
                        <div className="relative w-full aspect-video bg-black overflow-hidden">
                          <CachedImage
                            src={relMovie.poster}
                            alt={relMovie.title}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                          />

                          {/* Duration Badge Bottom-Right */}
                          {relMovie.duration && (
                            <div className="absolute bottom-2 right-2 bg-black/90 text-white text-[11px] font-bold px-2 py-0.5 rounded border border-white/20 tracking-wide z-10">
                              {relMovie.duration}
                            </div>
                          )}

                          {/* Rating Badge Top-Right */}
                          <div className="absolute top-2 right-2 bg-black/85 text-amber-400 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1 z-10">
                            <span>★</span>
                            <span>{relMovie.rating || '4.8'}</span>
                          </div>

                          {/* Center Play Circle on Hover */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform">
                              <Play className="w-6 h-6 fill-white ml-0.5" />
                            </div>
                          </div>
                        </div>

                        {/* YouTube Video Info Row */}
                        <div className="p-3.5 sm:p-4 flex items-start gap-3">
                          {/* Channel Avatar */}
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-red-600 to-red-900 text-white flex items-center justify-center shrink-0 border border-white/15 shadow-md">
                            <Youtube className="w-5 h-5 text-white" />
                          </div>

                          {/* Video Details */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm sm:text-base font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                              {relMovie.title}
                            </h3>
                            <div className="flex items-center flex-wrap gap-2 text-xs text-gray-400 mt-1.5">
                              <span className="text-gray-300 font-medium flex items-center gap-1">
                                {channelName}
                                <span className="inline-block w-3.5 h-3.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[9px] font-bold text-center leading-tight">✓</span>
                              </span>
                              <span className="text-gray-600">•</span>
                              <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded">
                                <Youtube className="w-2.5 h-2.5" />
                                YouTube
                              </span>
                              {relMovie.duration && (
                                <>
                                  <span className="text-gray-600">•</span>
                                  <span>{relMovie.duration}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Movie Carousel (Horizontal Posters for standard movies) */
                <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 scrollbar-none smooth-scroll-container">
                  {relatedMovies.map((relMovie) => (
                    <div
                      key={relMovie.id}
                      onClick={() => onSelectRelatedMovie(relMovie)}
                      className="w-32 sm:w-40 shrink-0 flex flex-col cursor-pointer group select-none"
                    >
                      <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#151922] border border-gray-800 group-hover:border-cyan-500 transition-all">
                        <CachedImage
                          src={relMovie.poster}
                          alt={relMovie.title}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute top-1.5 right-1.5 bg-black/80 text-amber-400 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-amber-500/60">
                          ★ {relMovie.rating}
                        </div>
                        {relMovie.duration && (
                          <div className="absolute top-1.5 left-1.5 bg-black/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded border border-white/20">
                            {relMovie.duration}
                          </div>
                        )}
                      </div>
                      <h4 className="text-xs font-semibold truncate mt-1.5 text-gray-200 group-hover:text-cyan-400">
                        {relMovie.title}
                      </h4>
                      <span className="text-[10px] text-gray-400 truncate">
                        {Array.isArray(relMovie.cast) ? relMovie.cast.join(', ') : relMovie.year || 'Movie'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
};

