import type {
  AIToolDefinition,
  ToolExecuteFunction,
  ToolContext,
} from "../../types/tools.js";
import {
  downloadMediaBuffer,
  safeMediaHost,
  type MediaKind,
} from "../../utils/mediaDownload.js";
import {
  unwrapMessage,
  extractContextInfo,
} from "../../utils/messageHelper.js";
import { Sticker, StickerTypes } from "wa-sticker-formatter";
import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import axios from "axios";
import type { proto, DownloadableMessage, WAMessage } from "@stazyu/baileys";

export interface TargetStickerMedia {
  payload: DownloadableMessage;
  kind: MediaKind;
  source: "own" | "quoted";
  seconds?: number;
}

/**
 * Resolve sticker crop/layout type from user or model argument.
 */
export function resolveStickerType(type?: unknown): StickerTypes {
  if (typeof type !== "string") return StickerTypes.FULL;
  const normalized = type.toLowerCase().trim();
  switch (normalized) {
    case "cropped":
    case "crop":
      return StickerTypes.CROPPED;
    case "circle":
      return StickerTypes.CIRCLE;
    case "rounded":
      return StickerTypes.ROUNDED;
    case "default":
      return StickerTypes.DEFAULT;
    case "full":
    default:
      return StickerTypes.FULL;
  }
}

/**
 * Extract target media payload from incoming message or its quoted message.
 * Prioritizes direct user upload if present, otherwise inspects quoted/tagged message.
 */
export function extractTargetMedia(
  context: ToolContext,
): TargetStickerMedia | null {
  const rawMsg = context.message?.message;
  const unwrapped = unwrapMessage(rawMsg);

  // 1. Check message's own payload
  if (unwrapped) {
    if (unwrapped.imageMessage) {
      return { payload: unwrapped.imageMessage, kind: "image", source: "own" };
    }
    if (unwrapped.videoMessage) {
      return {
        payload: unwrapped.videoMessage,
        kind: "video",
        source: "own",
        seconds: unwrapped.videoMessage.seconds ?? undefined,
      };
    }
    if (unwrapped.stickerMessage) {
      return { payload: unwrapped.stickerMessage, kind: "sticker", source: "own" };
    }
    if (
      unwrapped.documentMessage &&
      unwrapped.documentMessage.mimetype?.startsWith("image/")
    ) {
      return { payload: unwrapped.documentMessage, kind: "document", source: "own" };
    }
    if (
      unwrapped.documentMessage &&
      unwrapped.documentMessage.mimetype?.startsWith("video/")
    ) {
      return {
        payload: unwrapped.documentMessage,
        kind: "document",
        source: "own",
      };
    }
  }

  // 2. Check quoted message payload
  const ctxInfo = extractContextInfo(unwrapped);
  const quoted = unwrapMessage(ctxInfo?.quotedMessage);

  if (quoted) {
    if (quoted.imageMessage) {
      return { payload: quoted.imageMessage, kind: "image", source: "quoted" };
    }
    if (quoted.videoMessage) {
      return {
        payload: quoted.videoMessage,
        kind: "video",
        source: "quoted",
        seconds: quoted.videoMessage.seconds ?? undefined,
      };
    }
    if (quoted.stickerMessage) {
      return { payload: quoted.stickerMessage, kind: "sticker", source: "quoted" };
    }
    if (
      quoted.documentMessage &&
      quoted.documentMessage.mimetype?.startsWith("image/")
    ) {
      return { payload: quoted.documentMessage, kind: "document", source: "quoted" };
    }
    if (
      quoted.documentMessage &&
      quoted.documentMessage.mimetype?.startsWith("video/")
    ) {
      return {
        payload: quoted.documentMessage,
        kind: "document",
        source: "quoted",
      };
    }
  }

  // 3. Fallback: check simplified.quotedInfo
  if (context.simplified?.quotedInfo?.quotedMessage) {
    const simpQuoted = unwrapMessage(
      context.simplified.quotedInfo.quotedMessage,
    );
    if (simpQuoted) {
      if (simpQuoted.imageMessage) {
        return { payload: simpQuoted.imageMessage, kind: "image", source: "quoted" };
      }
      if (simpQuoted.videoMessage) {
        return {
          payload: simpQuoted.videoMessage,
          kind: "video",
          source: "quoted",
          seconds: simpQuoted.videoMessage.seconds ?? undefined,
        };
      }
      if (simpQuoted.stickerMessage) {
        return { payload: simpQuoted.stickerMessage, kind: "sticker", source: "quoted" };
      }
      if (
        simpQuoted.documentMessage &&
        simpQuoted.documentMessage.mimetype?.startsWith("image/")
      ) {
        return {
          payload: simpQuoted.documentMessage,
          kind: "document",
          source: "quoted",
        };
      }
      if (
        simpQuoted.documentMessage &&
        simpQuoted.documentMessage.mimetype?.startsWith("video/")
      ) {
        return {
          payload: simpQuoted.documentMessage,
          kind: "document",
          source: "quoted",
        };
      }
    }
  }

  return null;
}

/**
 * Compress video for WhatsApp animated sticker using ffmpeg.
 */
async function compressVideo(buffer: Buffer): Promise<Buffer> {
  const tempDir = tmpdir();
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputPath = join(tempDir, `input_${unique}.mp4`);
  const outputPath = join(tempDir, `output_${unique}.webp`);

  try {
    await writeFile(inputPath, buffer);
    const args = [
      "-i",
      inputPath,
      "-vf",
      "scale=512:512:force_original_aspect_ratio=decrease,fps=15",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "40",
      "-b:v",
      "150k",
      "-maxrate",
      "200k",
      "-bufsize",
      "300k",
      "-t",
      "5",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", args);
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    const compressed = await readFile(outputPath);
    return compressed;
  } finally {
    await unlink(inputPath).catch(() => { });
    await unlink(outputPath).catch(() => { });
  }
}

export const definition: AIToolDefinition = {
  type: "function",
  function: {
    name: "create_sticker",
    description:
      'Create and send a WhatsApp sticker from an image (or short video/gif) sent by the user or quoted/tagged in a reply. Use this whenever the user asks to turn a sent or quoted picture/photo/image/sticker into a sticker (e.g. "buatkan stiker dari foto ini", "jadikan stiker", "bikin stiker", "stikerin ini", "jadikan stiker dong"). Can customize pack name, author name, and crop layout (full, cropped, circle, rounded).',
    parameters: {
      type: "object",
      properties: {
        pack: {
          type: "string",
          description:
            'Optional sticker pack name. Defaults to "Staz-AI-Bot" or a creative short name if the user requested a specific pack title.',
        },
        author: {
          type: "string",
          description:
            "Optional sticker author/creator name. Defaults to the user's name or 'Di buat oleh : Staz AI Bot\n\nJangan lupa follow IG owner @wahyuhp57'.",
        },
        sticker_type: {
          type: "string",
          enum: ["full", "cropped", "circle", "rounded", "default"],
          description:
            "Optional sticker crop/layout. 'full' (default) preserves the entire image aspect ratio without cropping. 'cropped' (or square crop) fills 1:1. 'circle' cuts to a circular sticker. 'rounded' adds rounded corners.",
        },
        url: {
          type: "string",
          description:
            "Optional direct image URL if the user provided an image link in the text instead of uploading or quoting an image.",
        },
      },
      required: [],
    },
  },
};

export const execute: ToolExecuteFunction = async (args, context) => {
  if (!context.socket || !context.fromJid) {
    return {
      success: false,
      message: "Konteks chat tidak tersedia, jadi sticker tidak bisa dikirim.",
    };
  }

  const targetMedia = extractTargetMedia(context);
  let mediaBuffer: Buffer | null = null;
  let isVideo = false;

  if (targetMedia) {
    isVideo = targetMedia.kind === "video";
    if (isVideo && targetMedia.seconds && targetMedia.seconds > 10) {
      return {
        success: false,
        message:
          "Durasi video terlalu panjang (maksimal 10 detik untuk stiker bergerak). Minta user mengirim video yang lebih singkat.",
      };
    }

    try {
      mediaBuffer = await downloadMediaBuffer(
        targetMedia.payload,
        targetMedia.kind,
        safeMediaHost(context.socket),
      );
    } catch (downloadErr) {
      console.warn(
        `[Tool:create_sticker] Media download failed: ${(downloadErr as Error).message}`,
      );
      // Fallback: if vision images were already downloaded for this turn, try to use them
      if (context.visionImages && context.visionImages.length > 0) {
        mediaBuffer = Buffer.from(context.visionImages[0].data);
        isVideo = false;
      } else {
        return {
          success: false,
          message: `Gagal mengunduh gambar/media dari WhatsApp: ${(downloadErr as Error).message}`,
        };
      }
    }
  } else if (typeof args.url === "string" && args.url.trim().startsWith("http")) {
    try {
      const response = await axios.get<ArrayBuffer>(args.url.trim(), {
        responseType: "arraybuffer",
        timeout: 15_000,
        maxContentLength: 15 * 1024 * 1024,
      });
      mediaBuffer = Buffer.from(response.data);
    } catch (urlErr) {
      return {
        success: false,
        message: `Gagal mengunduh gambar dari URL: ${(urlErr as Error).message}`,
      };
    }
  } else if (context.visionImages && context.visionImages.length > 0) {
    mediaBuffer = Buffer.from(context.visionImages[0].data);
  }

  if (!mediaBuffer || mediaBuffer.length === 0) {
    return {
      success: false,
      message:
        "Tidak ada gambar atau video yang dikirim atau di-tag/reply. Minta user untuk mengirim gambar atau me-reply gambar yang ingin dijadikan stiker.",
    };
  }

  // Handle video compression
  let processBuffer: Buffer = mediaBuffer;
  if (isVideo) {
    try {
      processBuffer = await compressVideo(mediaBuffer);
    } catch (compressErr) {
      console.warn(
        `[Tool:create_sticker] Video compression error, using raw buffer: ${(compressErr as Error).message}`,
      );
      processBuffer = mediaBuffer;
    }
  }

  const packName =
    typeof args.pack === "string" && args.pack.trim()
      ? args.pack.trim()
      : "Staz-AI-Bot";

  const authorName =
    typeof args.author === "string" && args.author.trim()
      ? args.author.trim()
      : context.pushName?.trim() || "Di buat oleh : Staz AI Bot\n\nJangan lupa follow IG owner @wahyuhp57";

  const stickerType = resolveStickerType(args.sticker_type);

  try {
    const sticker = new Sticker(processBuffer, {
      pack: packName,
      author: authorName,
      type: stickerType,
      categories: ["❤️", "✨"],
      quality: isVideo ? 40 : 100,
    });

    const stickerBuffer = await sticker.toBuffer();

    await context.socket.sendMessage(
      context.fromJid,
      { sticker: stickerBuffer },
      context.message?.key ? { quoted: context.message as WAMessage } : undefined,
    );

    return {
      success: true,
      message: "Stiker berhasil dibuat dan sudah dikirim ke chat.",
      data: {
        pack: packName,
        author: authorName,
        type: stickerType,
        source: targetMedia?.source || (args.url ? "url" : "vision"),
      },
    };
  } catch (error) {
    console.error("[Tool:create_sticker] Error creating sticker:", error);
    return {
      success: false,
      message: `Gagal membuat stiker: ${(error as Error).message || "Unknown error"}`,
    };
  }
};
