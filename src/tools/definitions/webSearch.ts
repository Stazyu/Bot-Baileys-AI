import type { AIToolDefinition, ToolExecuteFunction } from '../../types/tools.js';

/**
 * Get Firecrawl base URL from environment, with fallback default.
 */
function getFirecrawlUrl(): string {
  return (process.env.FIRECRAWL_URL || 'https://firecrawl.wahyuhp.my.id').replace(/\/+$/, '');
}

/**
 * Firecrawl search API response shape.
 */
interface FirecrawlSearchResult {
  url: string;
  title: string;
  description: string;
}

interface FirecrawlSearchResponse {
  success: boolean;
  data: {
    web: FirecrawlSearchResult[];
  };
  id?: string;
  error?: string;
}

export const definition: AIToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for current information using Firecrawl. Returns search result snippets (title, URL, description) from the web. MUST be called immediately whenever the user asks about news, current events, or anything time-sensitive — never ask a clarifying question first, never answer such topics from memory. If you need full article content, use web_fetch after getting the URL.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A concise search query in Indonesian or English (e.g. "harga emas hari ini" or "penyebab pemadaman listrik Jawa"). Do not add a year unless the user explicitly asks about that year.',
        },
        maxResults: {
          type: 'number',
          description:
            'Maximum number of search results to return (between 3 and 15). Default is 8.',
        },
      },
      required: ['query'],
    },
  },
};

export const execute: ToolExecuteFunction = async (args, context) => {
  const query = (args.query as string || '').trim();
  const maxResults = Math.min(Math.max((args.maxResults as number) || 8, 3), 15);

  if (!query) {
    return { success: false, message: 'Query pencarian tidak diberikan.' };
  }

  const firecrawlBase = getFirecrawlUrl();
  if (!firecrawlBase) {
    return {
      success: false,
      message:
        'Web search tidak dapat digunakan karena FIRECRAWL_URL belum dikonfigurasi. Silakan set FIRECRAWL_URL di file .env.',
    };
  }

  const searchUrl = `${firecrawlBase}/v2/search`;

  try {
    console.log(`[Tool:WebSearch] 🔍 Searching via Firecrawl: ${query}`);

    const { default: axios } = await import('axios');

    const response = await axios.post<FirecrawlSearchResponse>(
      searchUrl,
      { query, limit: maxResults },
      {
        timeout: 30_000,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const result = response.data;

    if (!result.success || !result.data) {
      const errMsg = result.error || 'Firecrawl search returned unsuccessful response';
      console.error(`[Tool:WebSearch] ❌ Firecrawl search error: ${errMsg}`);
      return {
        success: false,
        message: `Gagal melakukan pencarian: ${errMsg}`,
      };
    }

    const results = result.data.web.slice(0, maxResults);

    if (results.length === 0) {
      return {
        success: false,
        message: `Pencarian "${query}" tidak menemukan hasil.`,
        data: { query, results: [] },
      };
    }

    // Format results
    const formatted = results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description || ''}`,
      )
      .join('\n\n');

    return {
      success: true,
      message: `Hasil pencarian "${query}":\n\n${formatted}`,
      data: {
        query,
        source: 'Firecrawl',
        results,
        totalResults: results.length,
      },
    };
  } catch (error: any) {
    const status = error.response?.status;
    const code = error.code;

    console.error(`[Tool:WebSearch] ❌ Firecrawl search error: ${error.message}`, {
      status,
      code,
    });

    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
      return {
        success: false,
        message: `Tidak dapat terhubung ke Firecrawl di ${getFirecrawlUrl()}. Pastikan server Firecrawl berjalan dan FIRECRAWL_URL di .env sudah benar.`,
      };
    }

    if (status === 404) {
      return {
        success: false,
        message: `Endpoint Firecrawl search tidak ditemukan (404) di ${getFirecrawlUrl()}/v2/search. Periksa konfigurasi FIRECRAWL_URL.`,
      };
    }

    if (status === 504) {
      return {
        success: false,
        message: `Firecrawl search timeout (504) saat mencari "${query}". Server mungkin sibuk, coba lagi nanti.`,
      };
    }

    return {
      success: false,
      message: `Gagal melakukan pencarian: ${error.message || 'Unknown error'}. Periksa server Firecrawl dan konfigurasi FIRECRAWL_URL.`,
    };
  }
};
