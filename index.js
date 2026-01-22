// ===================== KEEP ALIVE =====================
const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// ===================== ENV =====================
require("dotenv").config();

// ===================== IMPORTS =====================
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

// ===================== CONFIG =====================
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PREFIX = "!";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const BAD_WORDS = [
  "bsdk", "madarchod", "nga", "nigga",
  "mf", "ass", "dick", "pussy",
  "fuck", "bitch", "whore", "slut"
];

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// ===================== MEMORY STORAGE =====================
const logChannels = {};     // guildId => channelId
const nukeCount = {};       // guildId-userId => count

// ===================== READY =====================
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  client.user.setActivity("Server Protection", {
    type: ActivityType.Watching
  });
});

// ===================== HELP EMBED =====================
function helpEmbed(guild) {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({
      name: `${guild.name} • Security Panel`,
      iconURL: guild.iconURL({ dynamic: true })
    })
    .setTitle("🛡️ Protection Commands")
    .addFields(
      {
        name: "📌 General",
        value:
          "`!help` — Show this menu\n" +
          "`!ping` — Bot latency"
      },
      {
        name: "⚙️ Setup",
        value:
          "`!setlog #channel` — Set logs channel"
      },
      {
        name: "🚨 Automatic Systems",
        value:
          "• Anti-abuse (5 min timeout)\n" +
          "• Anti-link\n" +
          "• Anti-nuke"
      }
    )
    .setFooter({ text: "Security System Active" });
}

// ===================== LOG FUNCTION =====================
async function sendLog(guild, embed) {
  const logId = logChannels[guild.id];
  if (!logId) return;

  const ch = guild.channels.cache.get(logId);
  if (ch) ch.send({ embeds: [embed] });
}

// ===================== MESSAGE HANDLER =====================
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  // Owner bypass
  if (message.author.id === OWNER_ID) return;

  const content = message.content.toLowerCase();

  // ===================== ANTI-LINK =====================
  if (/(https?:\/\/|discord\.gg|discord\.com\/invite)/i.test(content)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await message.delete().catch(() => {});
      await message.member.timeout(TIMEOUT_MS, "Anti-link").catch(() => {});

      sendLog(message.guild,
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🚫 Link Blocked")
          .setDescription(`👤 ${message.author}\n⏱ Timeout: 5 minutes`)
          .setTimestamp()
      );
    }
    return;
  }

  // ===================== ANTI-ABUSE =====================
  if (BAD_WORDS.some(w => content.includes(w))) {
    await message.delete().catch(() => {});
    await message.member.timeout(TIMEOUT_MS, "Abusive language").catch(() => {});

    sendLog(message.guild,
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("⚠️ Abuse Detected")
        .setDescription(`👤 ${message.author}\n⏱ Timeout: 5 minutes`)
        .setTimestamp()
    );
    return;
  }

  // ===================== PREFIX COMMANDS =====================
  if (!content.startsWith(PREFIX)) return;

  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift();

  // ===================== HELP =====================
  if (cmd === "help") {
    return message.reply({ embeds: [helpEmbed(message.guild)] });
  }

  // ===================== PING =====================
  if (cmd === "ping") {
    return message.reply(`🏓 Pong: **${client.ws.ping}ms**`);
  }

  // ===================== SET LOG =====================
  if (cmd === "setlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ Admin only.");

    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("❌ Mention a channel.");

    logChannels[message.guild.id] = ch.id;
    return message.reply(`✅ Logs channel set to ${ch}`);
  }
});

// ===================== ANTI-NUKE =====================
async function handleNuke(member, reason) {
  const key = `${member.guild.id}-${member.id}`;
  nukeCount[key] = (nukeCount[key] || 0) + 1;

  if (nukeCount[key] >= 3) {
    await member.ban({ reason: "Anti-Nuke Triggered" }).catch(() => {});
    sendLog(member.guild,
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔥 Anti-Nuke Triggered")
        .setDescription(`👤 ${member.user.tag}\n📛 ${reason}`)
        .setTimestamp()
    );
  }

  setTimeout(() => delete nukeCount[key], 60_000);
}

client.on("channelDelete", async channel => {
  const logs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 });
  const entry = logs.entries.first();
  if (entry?.executor) handleNuke(entry.executor, "Channel Delete");
});

client.on("roleDelete", async role => {
  const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 1 });
  const entry = logs.entries.first();
  if (entry?.executor) handleNuke(entry.executor, "Role Delete");
});

client.on("guildBanAdd", async ban => {
  const logs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 });
  const entry = logs.entries.first();
  if (entry?.executor) handleNuke(entry.executor, "Mass Ban");
});

// ===================== LOGIN =====================
client.login(TOKEN);
