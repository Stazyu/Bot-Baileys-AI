import type { WASocket } from "@stazyu/baileys";
import type { CommandModule } from "../../types/index.js";
import type { ToolContext } from "../../types/tools.js";
import aiService, { AIService } from "../../services/aiService.js";
import { isOwner } from "../../config/botConfig.js";
import { getSystemPrompt } from "../../services/systemPrompt.js";
import { stripToolCallArtifacts } from "../../utils/toolCallFilter.js";
import {
  isAIModeEnabledSync,
  setAIModeEnabled,
} from "../../services/aiModePersistence.js";

const AICommand: CommandModule = {
  config: {
    name: "ai",
    aliases: ["ask", "chatai", "aioff", "aion"],
    description: "Aktifkan mode AI untuk chatting",
    usage: "!ai <pertanyaan>",
    category: "ai",
  },
  onLoad() {
    console.log("✅ AI Command loaded");
  },
  handler: async function (context, args: string[]): Promise<void> {
    const userId = context.simplified?.user_id || context.fromJid;

    if (args[0]?.toLowerCase() === "on") {
      await setAIModeEnabled(userId, true);
      await context.socket.sendMessage(context.fromJid, {
        text: "✅ Mode AI aktif! Semua pesan yang kamu kirim akan ditangani oleh AI.\n\nGunakan !aioff untuk menonaktifkan mode AI.",
      });
      return;
    }

    if (args[0]?.toLowerCase() === "off") {
      aiService.clearConversation(userId);
      await setAIModeEnabled(userId, false);
      await context.socket.sendMessage(context.fromJid, {
        text: "❌ Mode AI dinonaktifkan. Kembali ke mode perintah normal.",
      });
      return;
    }

    if (args[0]?.toLowerCase() === "model" && args[1]) {
      if (!isOwner(userId)) {
        await context.socket.sendMessage(context.fromJid, {
          text: "❌ Hanya owner yang bisa mengganti model AI.",
        });
        return;
      }
      const model = args.slice(1).join(" ");
      aiService.setModel(model);
      await context.socket.sendMessage(context.fromJid, {
        text: `✅ Model AI diganti ke: ${model}`,
      });
      return;
    }

    if (args[0]?.toLowerCase() === "clear") {
      aiService.clearConversation(userId);
      await context.socket.sendMessage(context.fromJid, {
        text: "🧹 Percakapan AI dibersihkan.",
      });
      return;
    }

    if (args[0]?.toLowerCase() === "models") {
      const provider = aiService.getProvider();
      let models: string[] = [];
      let info = "";

      if (provider === "ollama") {
        models = await AIService.listOllamaModels();
        if (models.length === 0) {
          info =
            "\n\n⚠️ Tidak bisa terhubung ke Ollama. Pastikan Ollama berjalan dan `OLLAMA_BASE_URL` benar.";
        }
        info +=
          "\n\nGunakan `!ai model <nama model>` untuk mengganti (hanya owner).";
      } else if (provider === "openai" || provider === "other") {
        // OpenAI-compatible custom API — try fetching from the /models endpoint
        models = await AIService.getAvailableModels(provider);
        if (models.length === 0) {
          info =
            "\n\n⚠️ Tidak bisa mengambil daftar model dari API. Set model manual dengan `!ai model <nama model>`.";
        } else {
          info =
            "\n\nGunakan `!ai model <nama model>` untuk mengganti (hanya owner).";
        }
      } else {
        // openrouter
        models = await AIService.getAvailableModels("openrouter");
        if (models.length === 0) {
          models = AIService.getAvailableOpenRouterModels();
        }
        info =
          "\n\nGunakan `!ai model <nama model>` untuk mengganti (hanya owner).";
      }

      const modelList = models.map((m: string) => `• ${m}`).join("\n");
      await context.socket.sendMessage(context.fromJid, {
        text: `🤖 *Model ${provider.toUpperCase()} yang Tersedia:*\n\n${modelList}\n\nModel saat ini: ${aiService.getModel()}${info}`,
      });
      return;
    }

    if (!aiService.isConfigured()) {
      await context.socket.sendMessage(context.fromJid, {
        text: "❌ AI service belum dikonfigurasi. Hubungi owner bot.",
      });
      return;
    }

    const question = args.join(" ");

    if (!question) {
      await context.socket.sendMessage(context.fromJid, {
        text: `📖 *Cara Penggunaan AI:*

• ${context.simplified?.prefix || "!"}ai on - Aktifkan mode AI
• ${context.simplified?.prefix || "!"}ai off - Nonaktifkan mode AI
• ${context.simplified?.prefix || "!"}ai <pertanyaan> - Tanya AI langsung
• ${context.simplified?.prefix || "!"}ai clear - Bersihkan percakapan
${isOwner(userId) ? `• ${context.simplified?.prefix || "!"}ai model <nama model> - Ganti model AI (hanya owner)` : ""}

🔹 Mode AI aktif: ${isAIModeEnabledSync(userId) ? "Ya" : "Tidak"}`,
      });
      return;
    }

    await context.socket.sendPresenceUpdate("composing", context.fromJid);

    try {
      const toolContext: ToolContext = {
        socket: context.socket,
        fromJid: context.fromJid,
        sessionId: userId,
        waSessionId: context.sessionId,
        userId,
        pushName: context.simplified?.pushName ?? undefined,
        userMessage: question,
      };

      let responseBuffer = "";
      await aiService.chatWithTools(
        userId,
        question,
        getSystemPrompt(),
        (chunk) => {
          if (chunk.done) return;
          if (chunk.phase === "progress") return; // don't treat progress ack as final
          if (chunk.content) {
            responseBuffer = chunk.content;
          }
        },
        toolContext,
      );

      await context.socket.sendPresenceUpdate("paused", context.fromJid);

      const safeResponse = stripToolCallArtifacts(responseBuffer);
      if (safeResponse) {
        await context.socket.sendMessage(context.fromJid, {
          text: safeResponse,
        });
      }
    } catch (error: any) {
      await context.socket.sendPresenceUpdate("paused", context.fromJid);
      await context.socket.sendMessage(context.fromJid, {
        text: `❌ Error: ${error.message}`,
      });
    }
  },
};

/**
 * Check whether AI mode is active for a given user.
 * Uses node-cache (sync) — no DB hit. Cache is populated at startup
 * (via initAIModePersistence) and updated write-through on toggle.
 */
export function isAIModeEnabled(userId: string): boolean {
  return isAIModeEnabledSync(userId);
}

export function getAIMode(userId: string): "single" | "chat" {
  return "chat";
}

export function handleAIMessage(
  userId: string,
  message: string,
): Promise<string> {
  return aiService.chat(userId, message, getSystemPrompt());
}

export function clearAISession(userId: string): void {
  aiService.clearConversation(userId);
  setAIModeEnabled(userId, false);
}

export default AICommand;
