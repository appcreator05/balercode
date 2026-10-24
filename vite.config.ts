import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

function youtubeApiPlugin() {
  return {
    name: 'youtube-related-api',
    configureServer(server: any) {
      server.middlewares.use('/api/youtube-related', async (req: any, res: any) => {
        try {
          const parsedUrl = new URL(req.url, 'http://localhost:3000');
          const rawQuery = parsedUrl.searchParams.get('q') || 'Hindi Movie';
          const currentId = parsedUrl.searchParams.get('v') || '';
          let actorParam = parsedUrl.searchParams.get('actor') || '';
          const excludeTitleParam = (parsedUrl.searchParams.get('exclude') || '').trim();

          const POPULAR_ACTORS = [
            'Allu Arjun', 'Prabhas', 'Ram Charan', 'Jr NTR', 'NTR', 'Mahesh Babu',
            'Thalapathy Vijay', 'Vijay', 'Ajith Kumar', 'Ajith', 'Suriya', 'Dhanush',
            'Chiyaan Vikram', 'Vikram', 'Kamal Haasan', 'Rajinikanth', 'Yash', 'Rishab Shetty',
            'Ravi Teja', 'Nani', 'Vijay Sethupathi', 'Sivakarthikeyan', 'Karthi', 'Nagarjuna',
            'Venkatesh', 'Chiranjeevi', 'Balakrishna', 'Puneeth Rajkumar', 'Upendra', 'Sudeep',
            'Dulquer Salmaan', 'Fahadh Faasil', 'Mohanlal', 'Mammootty', 'Prithviraj Sukumaran',
            'Vijay Deverakonda', 'Naga Chaitanya', 'Ram Pothineni', 'Bellamkonda Sreenivas',
            'Salman Khan', 'Shah Rukh Khan', 'Aamir Khan', 'Akshay Kumar', 'Ajay Devgn', 'Ajay Devgan',
            'Hrithik Roshan', 'Ranbir Kapoor', 'Ranveer Singh', 'Shahid Kapoor', 'Sunny Deol', 'Bobby Deol',
            'Dharmendra', 'Amitabh Bachchan', 'Mithun Chakraborty', 'Sanjay Dutt', 'John Abraham', 'Tiger Shroff',
            'Varun Dhawan', 'Sidharth Malhotra', 'Vicky Kaushal', 'Kartik Aaryan', 'Ayushmann Khurrana',
            'Rajkummar Rao', 'Nawazuddin Siddiqui', 'Emraan Hashmi', 'Saif Ali Khan', 'Anil Kapoor',
            'Jackie Shroff', 'Govinda', 'Suniel Shetty',
            'Deepika Padukone', 'Katrina Kaif', 'Alia Bhatt', 'Samantha', 'Rashmika Mandanna',
            'Nayanthara', 'Anushka Shetty', 'Kajal Aggarwal', 'Tamannaah', 'Pooja Hegde',
            'Keerthy Suresh', 'Trisha', 'Shruti Haasan', 'Kiara Advani', 'Kriti Sanon', 'Shraddha Kapoor',
            'Disha Patani', 'Kareena Kapoor', 'Priyanka Chopra', 'Kajol', 'Madhuri Dixit', 'Sreeleela',
            'Tom Cruise', 'Dwayne Johnson', 'The Rock', 'Vin Diesel', 'Jason Statham', 'Keanu Reeves',
            'Jackie Chan', 'Arnold Schwarzenegger', 'Sylvester Stallone', 'Will Smith'
          ];

          const MOVIE_STAR_MAP: Record<string, string> = {
            'pushpa': 'Allu Arjun', 'kgf': 'Yash', 'k.g.f': 'Yash', 'bahubali': 'Prabhas', 'baahubali': 'Prabhas',
            'salaar': 'Prabhas', 'kalki': 'Prabhas', 'saaho': 'Prabhas', 'rrr': 'Ram Charan', 'magadheera': 'Ram Charan',
            'rangasthalam': 'Ram Charan', 'devara': 'Jr NTR', 'guntur kaaram': 'Mahesh Babu', 'sarileru neekevvaru': 'Mahesh Babu',
            'leo': 'Thalapathy Vijay', 'master': 'Thalapathy Vijay', 'beast': 'Thalapathy Vijay', 'varisu': 'Thalapathy Vijay',
            'jailer': 'Rajinikanth', 'robot': 'Rajinikanth', 'vikram': 'Kamal Haasan', 'kantara': 'Rishab Shetty',
            'asuran': 'Dhanush', 'soorarai pottru': 'Suriya', 'dhamaka': 'Ravi Teja', 'hi nanna': 'Nani',
            'valimai': 'Ajith Kumar', 'radhe': 'Salman Khan', 'tiger': 'Salman Khan', 'dabangg': 'Salman Khan',
            'sultan': 'Salman Khan', 'bajrangi bhaijaan': 'Salman Khan', 'jawan': 'Shah Rukh Khan', 'pathaan': 'Shah Rukh Khan',
            'singham': 'Ajay Devgn', 'drishyam': 'Ajay Devgn', 'golmaal': 'Ajay Devgn', 'animal': 'Ranbir Kapoor',
            'sanju': 'Ranbir Kapoor', 'war': 'Hrithik Roshan', 'krrish': 'Hrithik Roshan', 'rowdy rathore': 'Akshay Kumar',
            'sooryavanshi': 'Akshay Kumar', 'khiladi': 'Akshay Kumar', 'gadar': 'Sunny Deol', 'dangal': 'Aamir Khan',
            'kabir singh': 'Shahid Kapoor'
          };

          // Detect actor from rawQuery or actorParam
          if (!actorParam) {
            for (const actor of POPULAR_ACTORS) {
              const reg = new RegExp('\\b' + actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
              if (reg.test(rawQuery)) {
                actorParam = actor;
                break;
              }
            }
          }
          if (!actorParam) {
            const lowQ = rawQuery.toLowerCase();
            for (const [mKey, star] of Object.entries(MOVIE_STAR_MAP)) {
              if (lowQ.includes(mKey)) {
                actorParam = star;
                break;
              }
            }
          }

          // Build primary and secondary search queries
          const queriesToRun: string[] = [];
          if (actorParam) {
            queriesToRun.push(`${actorParam} hindi dubbed full movie`);
            queriesToRun.push(`${actorParam} blockbuster movie hindi dubbed`);
            queriesToRun.push(`${actorParam} action full movie hindi`);
          } else {
            queriesToRun.push(`${rawQuery} full movie hindi`);
            queriesToRun.push(`${rawQuery} action movie hindi`);
          }

          const fetchYt = async (q: string) => {
            const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
            const ytRes = await fetch(searchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
              }
            });
            const html = await ytRes.text();
            const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
            const results: any[] = [];
            if (match) {
              const data = JSON.parse(match[1]);
              const sectionList = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
              for (const section of sectionList) {
                const itemSection = section.itemSectionRenderer?.contents || [];
                for (const item of itemSection) {
                  const v = item.videoRenderer;
                  if (v && v.videoId && v.videoId !== currentId) {
                    results.push({
                      id: v.videoId,
                      videoId: v.videoId,
                      yt: v.videoId,
                      title: v.title?.runs?.map((r: any) => r.text).join('') || v.title?.simpleText || 'YouTube Video',
                      poster: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                      duration: v.lengthText?.simpleText || 'Full HD',
                      rating: '4.8',
                      category: 'YouTube Video',
                      channel: v.ownerText?.runs?.map((r: any) => r.text).join('') || 'YouTube',
                      views: v.shortViewCountText?.simpleText || ''
                    });
                  }
                }
              }
            }
            return results;
          };

          const normalizeTitle = (t: string) => {
            return t.toLowerCase()
              .replace(/\b(full\s+movie|hindi\s+dubbed|blockbuster|superhit|action|comedy|hd|4k|1080p|720p|movie|south|bollywood|new|latest|official)\b/gi, '')
              .replace(/\[[^\]]*\]/g, '')
              .replace(/\((19|20)\d{2}\)/g, '')
              .replace(/[-_:|]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          };

          const excludeNormalized = excludeTitleParam ? normalizeTitle(excludeTitleParam) : '';
          const excludeWords = excludeNormalized.split(/\s+/).filter(w => w.length > 2);

          const isExcluded = (title: string) => {
            if (!excludeNormalized && excludeWords.length === 0) return false;
            const tLow = title.toLowerCase();
            if (excludeNormalized.length >= 3 && tLow.includes(excludeNormalized)) return true;
            // If primary key words of current movie are in title
            if (excludeWords.length > 0) {
              const matchCount = excludeWords.filter(w => tLow.includes(w)).length;
              if (matchCount >= Math.min(2, excludeWords.length)) return true;
            }
            return false;
          };

          const collected: any[] = [];
          const seenIds = new Set<string>();
          if (currentId) seenIds.add(currentId);
          const seenCoreTitles = new Set<string>();

          for (const q of queriesToRun) {
            if (collected.length >= 25) break;
            const res = await fetchYt(q);
            for (const item of res) {
              if (collected.length >= 25) break;
              if (seenIds.has(item.videoId)) continue;
              
              // Exclude exact current movie to avoid duplicate uploads of the same movie!
              if (isExcluded(item.title)) continue;

              // Deduplicate title so the user gets different movies of the actor
              const core = normalizeTitle(item.title).slice(0, 20);
              if (core.length >= 4 && seenCoreTitles.has(core)) continue;
              if (core.length >= 4) seenCoreTitles.add(core);

              seenIds.add(item.videoId);
              collected.push(item);
            }
          }

          // If still fewer than 20, relax core title deduplication to ensure at least 20 items
          if (collected.length < 20 && queriesToRun.length > 0) {
            const more = await fetchYt(queriesToRun[0]);
            for (const item of more) {
              if (collected.length >= 25) break;
              if (!seenIds.has(item.videoId) && !isExcluded(item.title)) {
                seenIds.add(item.videoId);
                collected.push(item);
              }
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(collected.slice(0, 25)));
        } catch (err: any) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message || 'Failed' }));
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    youtubeApiPlugin()
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        music: resolve(__dirname, 'music.html'),
        qr: resolve(__dirname, 'qr.html'),
        share: resolve(__dirname, 'share.html'),
        antSmash: resolve(__dirname, 'ant-smash.html'),
        carRacing: resolve(__dirname, 'car-racing.html'),
        fillTheGap: resolve(__dirname, 'fill-the-gap.html'),
        jewelCrush: resolve(__dirname, 'jewel-crush.html')
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  }
});
