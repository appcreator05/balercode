export type VideoPlayerType = 'video' | 'yt' | 'drc' | 'gdrive';

export interface StreamServerInfo {
  name: string;
  quality: string;
  url: string;
  type: VideoPlayerType;
}

export interface VideoSourceResolution {
  type: VideoPlayerType;
  id: string; // The ID or source string
  playerUrl: string; // Direct play or embed iframe URL
  rawUrl: string;
  label: string; // e.g. "Cloudflare Worker Stream", "YouTube Supported Player", "Plyr Direct Player"
  servers: StreamServerInfo[];
}

/**
 * Extracts and cleans Google Drive ID by stripping any trailing extra character or word
 */
export function cleanGoogleDriveId(raw: string): string {
  if (!raw) return '';
  let val = String(raw).trim();
  if (val.startsWith('hhttps://')) {
    val = val.replace('hhttps://', 'https://');
  }

  let id = '';
  const m = val.match(/\/file\/d\/([-\w]+)/i) ||
            val.match(/\/d\/([-\w]+)/i) ||
            val.match(/[?&]id=([-\w]+)/i) ||
            val.match(/id=([-\w]+)/i);
  if (m && m[1]) {
    id = m[1].trim();
  } else {
    const rawMatch = val.match(/[-\w]{15,}/);
    if (rawMatch) {
      id = rawMatch[0].trim();
    } else {
      id = val;
    }
  }

  // Google Drive file IDs are standard 33 characters (e.g. 18f2-h5i1OBj0yQawljfNilHg2UMtiC0).
  // If user has an extra character or word appended at the end (e.g. 34 characters:
  // "18f2-h5i1OBj0yQawljfNilHg2UMtiC0I" or "18f2-h5i1OBj0yQawljfNilHg2UMtiC0l", or longer),
  // strip the trailing extra character/word to preserve the clean 33-character Google Drive ID:
  if (id.length > 33) {
    id = id.slice(0, 33);
  } else if (id.length === 29) {
    id = id.slice(0, 28);
  }

  return id;
}

/**
 * Checks and resolves post video sources according to exact specification:
 * 1. "video": "1DlvdGn8QaXGuJVbeU6wrKxGUJfV-0Txh0"
 *    -> https://debasis.installapkapps.workers.dev/?id=1DlvdGn8QaXGuJVbeU6wrKxGUJfV-0Txh0
 * 2. "yt": "hf-EHqaybqI"
 *    -> https://www.youtube.com/embed/hf-EHqaybqI (YouTube supported player)
 * 3. "drc": "https://github.com/movieapp05/sps/releases/download/dsp/vdo3.mp4"
 *    -> Direct MP4 / Plyr player
 */
export function resolvePostVideoSource(post: {
  video?: string;
  yt?: string;
  drc?: string;
  videoUrl?: string;
  streamUrl?: string;
  url?: string;
  link?: string;
  [key: string]: any;
}): VideoSourceResolution {
  if (!post) {
    const fallbackUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4';
    return {
      type: 'drc',
      id: 'default',
      playerUrl: fallbackUrl,
      rawUrl: fallbackUrl,
      label: 'Default Stream',
      servers: [
        {
          name: 'Backup Server 1',
          quality: '1080p HD',
          url: fallbackUrl,
          type: 'drc'
        }
      ]
    };
  }

  // 1. CHECK "yt": YouTube Video ID or URL
  const ytRaw = (post.yt || post.youtube || '').trim();
  if (ytRaw) {
    let ytId = ytRaw;
    const match = ytRaw.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (match && match[1]) {
      ytId = match[1];
    }
    const embedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`;
    return {
      type: 'yt',
      id: ytId,
      playerUrl: embedUrl,
      rawUrl: `https://www.youtube.com/embed/${ytId}`,
      label: 'YouTube Supported Player',
      servers: [
        {
          name: 'Server 1 (YouTube HD Embed)',
          quality: 'Auto / 1080p',
          url: embedUrl,
          type: 'yt'
        },
        {
          name: 'Server 2 (YouTube Stream)',
          quality: '720p HD',
          url: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`,
          type: 'yt'
        }
      ]
    };
  }

  // 2. CHECK "drc": Direct video MP4 / stream URL for Plyr player
  const drcRaw = (post.drc || post.direct || '').trim();
  if (drcRaw) {
    return {
      type: 'drc',
      id: drcRaw,
      playerUrl: drcRaw,
      rawUrl: drcRaw,
      label: 'Plyr Direct Player',
      servers: [
        {
          name: 'Server 1 (Direct HD Stream)',
          quality: '1080p Ultra HD',
          url: drcRaw,
          type: 'drc'
        },
        {
          name: 'Server 2 (Direct Fast Stream)',
          quality: '720p HD',
          url: drcRaw,
          type: 'drc'
        }
      ]
    };
  }

  // 3. CHECK "video": Google Drive ID, Worker URL, or Stream URL
  const videoRaw = (post.video || post.videoUrl || post.streamUrl || post.url || post.link || '').trim();
  if (videoRaw) {
    // If videoRaw is a YouTube link
    if (videoRaw.includes('youtube.com') || videoRaw.includes('youtu.be')) {
      const match = videoRaw.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
      const ytId = match ? match[1] : videoRaw;
      const embedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`;
      return {
        type: 'yt',
        id: ytId,
        playerUrl: embedUrl,
        rawUrl: `https://www.youtube.com/embed/${ytId}`,
        label: 'YouTube Supported Player',
        servers: [
          {
            name: 'Server 1 (YouTube HD Embed)',
            quality: 'Auto / 1080p',
            url: embedUrl,
            type: 'yt'
          }
        ]
      };
    }

    // If videoRaw is direct http/https URL
    if (videoRaw.startsWith('http://') || videoRaw.startsWith('https://')) {
      // 1. Google Drive Preview Links: ONLY when link is https://drive.google.com/file/d/.../preview -> IFRAME PREVIEW
      if (
        (videoRaw.includes('drive.google.com') && (videoRaw.includes('/preview') || videoRaw.includes('/view') || videoRaw.includes('/file/d/'))) ||
        (videoRaw.includes('docs.google.com') && videoRaw.includes('/preview'))
      ) {
        const driveId = cleanGoogleDriveId(videoRaw);
        const previewUrl = driveId
          ? `https://drive.google.com/file/d/${driveId}/preview`
          : (videoRaw.includes('/preview') ? videoRaw : `${videoRaw.replace(/\/view(\?.*)?$/i, '')}/preview`);
        const workerUrl = driveId ? `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(driveId)}` : '';

        return {
          type: 'gdrive',
          id: driveId || videoRaw,
          playerUrl: previewUrl,
          rawUrl: videoRaw,
          label: 'Google Drive Preview (Iframe)',
          servers: [
            {
              name: 'Server 1 (Drive Preview HD)',
              quality: '1080p Ultra HD',
              url: previewUrl,
              type: 'gdrive'
            },
            {
              name: 'Server 2 (Fast Worker Stream)',
              quality: '720p HD',
              url: workerUrl || previewUrl,
              type: workerUrl ? 'video' : 'gdrive'
            },
            {
              name: 'Server 3 (Drive Direct HD)',
              quality: 'Auto Quality',
              url: driveId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}` : previewUrl,
              type: driveId ? 'video' : 'gdrive'
            }
          ]
        };
      }

      // 2. Cloudflare Worker Stream Links (e.g. https://debasis.installapkapps.workers.dev/?id=...)
      if (videoRaw.includes('workers.dev') && videoRaw.includes('id=')) {
        const driveId = cleanGoogleDriveId(videoRaw);
        const workerUrl = `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(driveId)}`;
        return {
          type: 'video',
          id: driveId,
          playerUrl: workerUrl,
          rawUrl: videoRaw,
          label: 'Cloudflare Worker Stream',
          servers: [
            {
              name: 'Server 1 (Fast Worker Stream)',
              quality: '1080p Ultra HD',
              url: workerUrl,
              type: 'video'
            },
            {
              name: 'Server 2 (Drive Direct HD)',
              quality: '720p HD',
              url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`,
              type: 'video'
            },
            {
              name: 'Server 3 (Drive Preview HD)',
              quality: 'Auto Quality',
              url: `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`,
              type: 'gdrive'
            }
          ]
        };
      }

      // 3. Direct MP4 / HLS stream or any other link -> Plyr Direct Player
      return {
        type: 'drc',
        id: videoRaw,
        playerUrl: videoRaw,
        rawUrl: videoRaw,
        label: 'Plyr Direct Player',
        servers: [
          {
            name: 'Server 1 (Direct HD Stream)',
            quality: '1080p Ultra HD',
            url: videoRaw,
            type: 'drc'
          },
          {
            name: 'Server 2 (Direct Fast Stream)',
            quality: '720p HD',
            url: videoRaw,
            type: 'drc'
          }
        ]
      };
    }

    // Otherwise it is a Google Drive file ID (e.g. "1DlvdGn8QaXGuJVbeU6wrKxGUJfV-0Txh0" or "17arA1F_qF-kqVqh7u8J_ofd8ws0_aHKl5")
    const driveId = cleanGoogleDriveId(videoRaw);
    const workerUrl = `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(driveId)}`;
    return {
      type: 'video',
      id: driveId,
      playerUrl: workerUrl,
      rawUrl: workerUrl,
      label: 'Worker CDN Player',
      servers: [
        {
          name: 'Server 1 (Fast Worker Stream)',
          quality: '1080p Ultra HD',
          url: workerUrl,
          type: 'video'
        },
        {
          name: 'Server 2 (Drive Direct HD)',
          quality: '720p HD',
          url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`,
          type: 'video'
        },
        {
          name: 'Server 3 (Google Drive Preview)',
          quality: 'Auto Quality',
          url: `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`,
          type: 'video'
        }
      ]
    };
  }

  // Fallback
  const defaultUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4';
  return {
    type: 'drc',
    id: 'default',
    playerUrl: defaultUrl,
    rawUrl: defaultUrl,
    label: 'Default Stream',
    servers: [
      {
        name: 'Backup Server 1',
        quality: '1080p HD',
        url: defaultUrl,
        type: 'drc'
      }
    ]
  };
}
