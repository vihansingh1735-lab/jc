// ===================== KEEP ALIVE (RENDER) =====================
const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("Bot alive"));
app.listen(process.env.PORT || 3000);

// ===================== IMPORTS =====================
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActivityType,
  AuditLogEvent
} = require("discord.js");

// ===================== CONFIG =====================
const TOKEN = process.env.TOKEN;
const PREFIX = "!";

// 5 minutes timeout
const TIMEOUT_MS = 5 * 60 * 1000;

// ===================== BAD WORDS =====================
const BAD_WORDS = [
  "bsdk", "madarchod", "nga", "nigga",
  "mf", "ass", "dick", "pussy",
  "fuck", "bitch", "slut", "whore"
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

// ===================== STORAGE (IN-MEMORY) =====================
const settings = {
  logChannel: {},     // guildId => channelId
  antiAbuse: {}       // guildId => boolean
};

const nukeTracker = {}; // guildId-userId => count

// ===================== READY =====================
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  client.user.setActivity("Server Protection", {
    type: ActivityType.Watching
  });
});

// ===================== LOG FUNCTION =====================
async function sendLog(guild, embed) {
  const channelId = settings.logChannel[guild.id];
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (channel) channel.send({ embeds: [embed] });
}

// ===================== HELP EMBED =====================
function helpEmbed(guild) {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({
      name: `${guild.name} • Security Panel`,
      iconURL: guild.iconURL({ dynamic: true })
    })
    .setTitle("🛡️ Security Commands")
    .addFields(
      {
        name: "📌 General",
        value:
          "`!help` — Show help\n" +
          "`!ping` — Bot latency\n" +
          "`!status` — Protection status"
      },
      {
        name: "⚙️ Admin Setup",
        value:
          "`!setlog #channel` — Set logs channel\n" +
          "`!antiabuse on/off` — Toggle anti-abuse"
      },
      {
        name: "🚨 Auto Protection",
        value:
          "• Anti-abuse (timeout)\n" +
          "• Anti-link\n" +
          "• Anti-nuke\n" +
          "• **Instant bot-adder ban**"
      }
    )
    .setFooter({ text: "Security system active" });
}

// ===================== MESSAGE HANDLER =====================
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const content = message.content.toLowerCase();

  // ===================== ANTI-LINK =====================
  if (/(https?:\/\/|discord\.gg)/i.test(content)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await message.delete().catch(() => {});
      await message.member.timeout(TIMEOUT_MS, "Anti-link").catch(() => {});

      sendLog(message.guild,
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🚫 Link Blocked")
          .setDescription(`User: ${message.author}`)
          .setTimestamp()
      );
    }
    return;
  }

  // ===================== ANTI-ABUSE =====================
  if (
    settings.antiAbuse[message.guild.id] &&
    BAD_WORDS.some(w => content.includes(w))
  ) {
    await message.delete().catch(() => {});
    await message.member.timeout(TIMEOUT_MS, "Abusive language").catch(() => {});

    sendLog(message.guild,
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("⚠️ Abuse Detected")
        .setDescription(`User: ${message.author}\nAction: 5 min timeout`)
        .setTimestamp()
    );
    return;
  }

  // ===================== PREFIX COMMANDS =====================
  if (!content.startsWith(PREFIX)) return;
  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift();

  // HELP
  if (cmd === "help") {
    return message.reply({ embeds: [helpEmbed(message.guild)] });
  }

  // PING
  if (cmd === "ping") {
    return message.reply(`🏓 Pong: ${client.ws.ping}ms`);
  }

  // STATUS
  if (cmd === "status") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🛡️ Protection Status")
          .addFields(
            {
              name: "Anti-Abuse",
              value: settings.antiAbuse[message.guild.id] ? "ON ✅" : "OFF ❌",
              inline: true
            },
            { name: "Anti-Link", value: "ON ✅", inline: true },
            { name: "Anti-Nuke", value: "ON ✅", inline: true },
            { name: "Anti-Bot Add", value: "ON ✅", inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  // SET LOG
  if (cmd === "setlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ Admin only.");

    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("❌ Mention a channel.");

    settings.logChannel[message.guild.id] = ch.id;
    return message.reply(`✅ Logs channel set to ${ch}`);
  }

  // ANTIABUSE TOGGLE
  if (cmd === "antiabuse") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ Admin only.");

    const opt = args[0];
    if (!["on", "off"].includes(opt))
      return message.reply("Usage: `!antiabuse on/off`");

    settings.antiAbuse[message.guild.id] = opt === "on";
    return message.reply(`✅ Anti-Abuse **${opt.toUpperCase()}**`);
  }
});

// ===================== INSTANT BAN: BOT ADD =====================
client.on("guildMemberAdd", async member => {
  if (!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.BotAdd,
    limit: 1
  }).catch(() => null);

  if (!logs) return;
  const entry = logs.entries.first();
  if (!entry) return;

  const executor = entry.executor;
  if (!executor) return;

  const adder = await member.guild.members.fetch(executor.id).catch(() => null);
  if (!adder) return;

  // Allow owner & admins
  if (
    adder.id === member.guild.ownerId ||
    adder.permissions.has(PermissionsBitField.Flags.Administrator)
  ) return;

  // BAN THE ADDER
  await adder.ban({ reason: "Unauthorized bot addition" }).catch(() => {});

  sendLog(member.guild,
    new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🤖 Unauthorized Bot Added")
      .setDescription(
        `Bot: **${member.user.tag}**\n` +
        `Added by: **${adder.user.tag}**\n` +
        `Action: **BANNED**`
      )
      .setTimestamp()
  );
});

// ===================== ANTI-NUKE =====================
async function handleNuke(member, action) {
  const key = `${member.guild.id}-${member.id}`;
  nukeTracker[key] = (nukeTracker[key] || 0) + 1;

  if (nukeTracker[key] >= 3) {
    await member.ban({ reason: "Anti-Nuke triggered" }).catch(() => {});
    sendLog(member.guild,
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔥 Anti-Nuke Triggered")
        .setDescription(`User: ${member.user.tag}\nAction: ${action}`)
        .setTimestamp()
    );
  }

  setTimeout(() => delete nukeTracker[key], 60_000);
}

client.on("channelDelete", async channel => {
  const logs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Channel Delete");
});

client.on("roleDelete", async role => {
  const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Role Delete");
});

client.on("guildBanAdd", async ban => {
  const logs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Mass Ban");
});

// ===================== LOGIN =====================
client.login(TOKEN);
