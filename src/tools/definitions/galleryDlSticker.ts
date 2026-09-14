import type {
  AIToolDefinition,
  ToolExecuteFunction,
} from "../../types/tools.js";
import {
  createPinterestSticker,
  createPinterestStickers,
  type PinterestStickerType,
} from "../../utils/pinterestSticker.js";

function parseIndex(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 50);
}

function parseCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 50);
}

function parseStickerType(value: unknown): PinterestStickerType {
  if (value === "default" || value === "cropped" || value === "full") {
    return value;
  }
  return "full";
}

/**
 * Build the sticker pack name: prefer the LLM-provided `pack` argument,
 * otherwise derive a readable name from the search query, otherwise fall
 * back to a generic default.
 */
function buildPackName(
  packName: string | undefined,
  query: string,
  fallback: string,
): string {
  if (packName?.trim()) return packName.trim();
  if (query.trim()) {
    const derived = query
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    if (derived) return derived;
  }
  return fallback;
}

export const definition: AIToolDefinition = {
  type: "function",
  function: {
    name: "gallery_dl_sticker",
    description:
      'Create and send WhatsApp sticker(s) from a gallery-dl supported source (Pinterest URL, board, user page, or a plain search keyword). Use this when the user asks to make a sticker/stiker from Pinterest or when the user gives a Pinterest URL or a topic/keyword like "kucing". Supports making multiple stickers at once using the "count" parameter (e.g. "buat 5 stiker kucing"); multiple stickers are sent together as a single sticker pack.',
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Optional Pinterest URL (pin, board, or user page) to download images from.",
        },
        query: {
          type: "string",
          description:
            'Optional plain search keyword/topic when the user does not provide a URL, e.g. "kucing", "anime lucu", or "meme tidur".',
        },
        pack: {
          type: "string",
          description:
            'Optional sticker pack name. When making multiple stickers (count > 1), generate a short, catchy, creative pack name from the topic/query (e.g. query "kucing lucu" → pack name "Kucing Lucu Pack"). If omitted, a name derived from the query is used automatically.',
        },
        author: {
          type: "string",
          description: "Optional sticker author name. Default: Pinterest.",
        },
        sticker_type: {
          type: "string",
          enum: ["full", "cropped", "default"],
          description:
            "Sticker layout. Use full by default, cropped for square crop, or default for library default.",
        },
        index: {
          type: "number",
          description:
            "Optional 1-based item number from the Pinterest gallery to use. Default is 1. Maximum is 50.",
        },
        count: {
          type: "number",
          description:
            'Number of stickers to make. Default 1. Maximum 50. Use this when user asks for multiple stickers like "buat 5 stiker".',
        },
      },
      required: [],
    },
  },
};

export const execute: ToolExecuteFunction = async (args, context) => {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!url && !query) {
    return {
      success: false,
      message: "URL Pinterest atau kata kunci tidak diberikan.",
    };
  }

  if (!context.socket || !context.fromJid) {
    return {
      success: false,
      message: "Konteks chat tidak tersedia, jadi sticker tidak bisa dikirim.",
    };
  }

  const count = parseCount(args.count);
  const stickerType = parseStickerType(args.sticker_type);
  const packName = typeof args.pack === "string" ? args.pack : undefined;
  const authorName = typeof args.author === "string" ? args.author : undefined;
  const resolvedPackName = buildPackName(packName, query, "Sticker Pack");
  const resolvedAuthorName =
    authorName ||
    "Di buat oleh : Staz AI Bot\n\nJangan lupa follow IG owner @wahyuhp57";

  console.log(
    `[Tool:PinterestSticker] 🎨 Creating: ${url || query} (count: ${count}, type: ${stickerType})`,
  );

  try {
    if (count <= 1) {
      // Single sticker (original behavior)
      const result = await createPinterestSticker({
        url: url || undefined,
        query: query || undefined,
        packName: resolvedPackName,
        authorName: resolvedAuthorName,
        stickerType,
        index: parseIndex(args.index),
      });

      await context.socket.sendMessage(context.fromJid, {
        sticker: result.stickerBuffer,
      });

      return {
        success: true,
        message:
          "Sticker dari Pinterest berhasil dibuat dan sudah dikirim ke user.",
        data: {
          sourceFileName: result.sourceFileName,
          downloadedFiles: result.downloadedFiles,
          count: 1,
        },
      };
    }

    // Multiple stickers (batch) → sent as a single WhatsApp sticker pack
    const batchResult = await createPinterestStickers({
      url: url || undefined,
      query: query || undefined,
      packName: resolvedPackName,
      authorName: resolvedAuthorName,
      stickerType,
      count,
      startIndex: parseIndex(args.index),
    });

    if (batchResult.stickers.length === 0) {
      return { success: false, message: "Gagal membuat sticker." };
    }

    // Send all stickers at once as one sticker pack (Baileys PR #1561 / @stazyu fork)
    await context.socket.sendMessage(context.fromJid, {
      stickerPack: {
        name: resolvedPackName,
        publisher: resolvedAuthorName,
        packId: `sp-pinterest-${Date.now().toString(36)}`,
        // description: `This sticker was made by ${resolvedAuthorName} totaling (${batchResult.stickers.length} stickers)\n\nDon't forget to follow the owner IG @wahyuhp57`,
        cover: batchResult.stickers[0].stickerBuffer,
        stickers: batchResult.stickers.map((stickerResult, i) => ({
          data: stickerResult.stickerBuffer,
          emojis: ["✨"],
          accessibilityLabel: `Sticker Pinterest ${i + 1}`,
        })),
      },
    });

    return {
      success: true,
      message: `Berhasil membuat ${batchResult.stickers.length} sticker dari Pinterest dan dikirim sebagai sticker pack "${resolvedPackName}". Total ${batchResult.totalDownloaded} gambar ditemukan.`,
      data: {
        requestedCount: count,
        sentCount: batchResult.stickers.length,
        successCount: batchResult.successCount,
        totalDownloaded: batchResult.totalDownloaded,
        sentAs: "stickerPack",
      },
    };
  } catch (error: any) {
    console.error("[Tool:gallery_dl_sticker] Error:", error);
    return {
      success: false,
      message: `Gagal membuat sticker dari Pinterest: ${error.message || "Unknown error"}`,
    };
  }
};
