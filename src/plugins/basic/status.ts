import type { CommandModule } from '../../types/index.js';
import os from 'os';

function getCpuUsage(): Promise<string> {
  return new Promise((resolve) => {
    const startMeasure = cpuAverage();

    // Set delay for second measure
    setTimeout(() => {
      const endMeasure = cpuAverage();

      // Calculate the difference in idle and total time between the measures
      const idleDifference = endMeasure.idle - startMeasure.idle;
      const totalDifference = endMeasure.total - startMeasure.total;

      // Calculate the average percentage
      const percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);

      resolve(percentageCPU.toFixed(2));
    }, 100);
  });
}

function cpuAverage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }

  return {
    idle: totalIdle / cpus.length,
    total: totalTick / cpus.length,
  };
}

const statusCommand: CommandModule = {
  config: {
    name: 'status',
    aliases: ['s'],
    description: 'Check bot status',
    usage: '!status',
    category: 'basic',
  },
  handler: async function (context, args: string[]): Promise<void> {
    // Calculate CPU usage
    const cpuUsage = await getCpuUsage();

    // Get system information
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    const release = os.release();
    const nodeVersion = process.version;
    const totalMemory = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMemory = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const usedMemory = ((os.totalmem() - os.freemem()) / (1024 * 1024 * 1024)).toFixed(2);
    const memoryUsagePercent = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2);
    const cpuCores = os.cpus().length;
    const cpuModel = os.cpus()[0].model;
    const uptime = process.uptime();

    // Format uptime
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    const seconds = Math.floor(uptime % 60);

    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const statusText = `✅ *Bot Status*

📱 *Session Info*
Session: ${context.sessionId}
Status: Online
Connected to: ${context.fromJid}

🖥️ *Server Info*
OS: ${platform} (${arch})
Hostname: ${hostname}
OS Version: ${release}
Node.js: ${nodeVersion}
CPU: ${cpuCores} cores
CPU Model: ${cpuModel}
CPU Usage: ${cpuUsage}%

💾 *Memory Usage*
Total: ${totalMemory} GB
Used: ${usedMemory} GB (${memoryUsagePercent}%)
Free: ${freeMemory} GB

⏱️ *Uptime*
Bot Uptime: ${uptimeString}`;

    await context.socket.sendMessage(context.fromJid, {
      text: statusText,
    });
  },
};

export default statusCommand;
