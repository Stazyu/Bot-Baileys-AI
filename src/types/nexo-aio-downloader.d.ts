declare module 'nexo-aio-downloader' {
    interface NexoResponse {
        error?: string;
        status: boolean;
        message?: string;
    }

    interface InstagramResponse extends NexoResponse {
        data?: {
            url: string[],
            caption: string | null,
            username: string | null,
            like: number | null,
            comment: number | null,
            isVideo: boolean,
        };
    }

    interface FacebookResponse extends NexoResponse {
        data?: {
            user: string | null,
            quoted: string | null,
            result: [
                {
                    url: string,
                    type: string,
                    quality: string,
                }
            ],
        };
    }

    interface TwitterResponse extends NexoResponse {
        data?: {
            author: string | null,
            like: number,
            view: number,
            retweet: number,
            description: string | null,
            sensitiveContent: boolean,
            result: [
                {
                    url: string,
                    type: string,
                }
            ]
        };
    }

    interface YoutubeResponse extends NexoResponse {
        data: {
            title: string,
            result: Buffer,
            size: string,
            quality: string,
            desc: string,
            views: string,
            likes: string,
            dislikes: string,
            channel: string,
            uploadDate: string,
            thumb: string,
            type: string,
        };
    }

    interface CapCutResponse extends NexoResponse {
        data?: {
            '@context': string,
            '@type': string,
            name: string,
            description: string,
            thumbnailUrl: string[],
            uploadDate: string,
            contentUrl: string,
            meta: {
                title: string,
                desc: string,
                like: string,
                play: string,
                duration: string,
                usage: string,
                createTime: string,
                coverUrl: string,
                videoRatio: string,
                author: string,
            }
        }
    }

    interface SnackVideoResponse extends NexoResponse {
        data?: {
            author: string,
            description: string,
            transcript: string,
            thumbnailUrl: string[],
            uploadDate: string,
            comment: string,
            audio: {
                name: string,
                author: string,
                '@type': string,
            },
            result: string,
        }
    }

    interface BiliBiliResponse extends NexoResponse {
        data: {
            title: string,
            locate: string,
            description: string,
            type: string,
            cover: string,
            views: string,
            like: string,
            result: Buffer,
            mediaList: MediaList,
        }
    }

    interface MediaList {
        videoList: [
            {
                quality: string,
                codecs: string,
                size: string,
                mime: string,
                url: string,
            }
        ],
        audioList: [
            {
                size: string,
                url: string,
            }
        ],
    }

    type QUALITY_MAP = {
        1: '160',   // 144p
        2: '134',   // 360p
        3: '135',   // 480p
        4: '136',   // 720p
        5: '137',   // 1080p
        6: '264',   // 1440p
        7: '266',   // 2160p
        8: 'bestaudio',
        9: 'bitrateList'
    };

    /**
     * Mengunduh konten dari Instagram (foto atau video)
     * @param url - URL posting Instagram yang akan diunduh
     * @returns Promise yang menghasilkan InstagramResponse dengan data media yang diunduh
     */
    function instagram(url: string): Promise<InstagramResponse>;

    /**
     * Mengunduh video dari Facebook
     * @param url - URL posting Facebook yang akan diunduh
     * @returns Promise yang menghasilkan FacebookResponse dengan data video yang diunduh
     */
    function facebook(url: string): Promise<FacebookResponse>;

    /**
     * Mengunduh media dari Twitter/X (foto atau video)
     * @param url - URL tweet yang akan diunduh
     * @returns Promise yang menghasilkan TwitterResponse dengan data media yang diunduh
     */
    function twitter(url: string): Promise<TwitterResponse>;

    /**
     * Mengunduh video dari TikTok
     * @param url - URL video TikTok yang akan diunduh
     * @returns Promise yang menghasilkan NexoResponse dengan data video yang diunduh
     */
    function tiktok(url: string): Promise<NexoResponse>;

    /**
     * Mengunduh video dari YouTube dengan kualitas yang dapat dipilih
     * @param url - URL video YouTube yang akan diunduh
     * @param qualityIndex - Indeks kualitas video yang diinginkan:
     * - 1: 144p (format: 160)
     * - 2: 360p (format: 134)
     * - 3: 480p (format: 135)
     * - 4: 720p (format: 136)
     * - 5: 1080p (format: 137)
     * - 6: 1440p (format: 264)
     * - 7: 2160p (format: 266)
     * - 8: bestaudio (kualitas audio terbaik)
     * - 9: bitrateList (daftar semua bitrate yang tersedia)
     * @returns Promise yang menghasilkan YoutubeResponse dengan data video yang diunduh
     */
    function youtube(url: string, qualityIndex?: keyof QUALITY_MAP): Promise<YoutubeResponse>;

    /**
     * Mengunduh video dari CapCut
     * @param url - URL video CapCut yang akan diunduh
     * @returns Promise yang menghasilkan CapCutResponse dengan data video yang diunduh
     */
    function capcut(url: string, meta?: boolean): Promise<CapCutResponse>;

    /**
     * Mengunduh video dari SnackVideo
     * @param url - URL video SnackVideo yang akan diunduh
     * @returns Promise yang menghasilkan SnackVideoResponse dengan data video yang diunduh
     */
    function snack(url: string): Promise<SnackVideoResponse>;

    /**
     * Mengunduh video dari BiliBili
     * @param url - URL video BiliBili yang akan diunduh
     * @returns Promise yang menghasilkan BiliBiliResponse dengan data video yang diunduh
     */
    function bilibili(url: string, { download, quality, cookie }: { download?: boolean, quality?: string, cookie?: string }): Promise<BiliBiliResponse>;
}