// ===================== KEEP ALIVE =====================
const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("Bot Online"));
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

// ===================== MEMORY STORAGE =====================
const settings = {
  logChannel: {},   // guildId => channelId
  antiAbuse: {}     // guildId => boolean
};

const nukeCount = {}; // anti-nuke tracker

// ===================== READY =====================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Server Security", {
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
          "`!help` — Commands list\n" +
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
          "• Anti-Abuse (5 min timeout)\n" +
          "• Anti-Link\n" +
          "• Anti-Nuke\n" +
          "• Anti-Bot Add (Instant ban)"
      }
    )
    .setFooter({ text: "Security system active" });
}

// ===================== MESSAGE HANDLER =====================
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;
  const content = msg.content.toLowerCase();

  // ===================== ANTI LINK =====================
  if (/(https?:\/\/|discord\.gg)/i.test(content)) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await msg.delete().catch(() => {});
      await msg.member.timeout(TIMEOUT_MS, "Anti-Link").catch(() => {});
      sendLog(msg.guild,
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🚫 Link Blocked")
          .setDescription(`User: ${msg.author}`)
          .setTimestamp()
      );
    }
    return;
  }

  // ===================== ANTI ABUSE =====================
  if (
    settings.antiAbuse[msg.guild.id] &&
    BAD_WORDS.some(w => content.includes(w))
  ) {
    await msg.delete().catch(() => {});
    await msg.member.timeout(TIMEOUT_MS, "Abusive Language").catch(() => {});
    sendLog(msg.guild,
      new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Abuse Detected")
        .setDescription(`User: ${msg.author}\nAction: 5 min timeout`)
        .setTimestamp()
    );
    return;
  }

  // ===================== COMMANDS =====================
  if (!content.startsWith(PREFIX)) return;

  const args = content.slice(1).trim().split(/ +/);
  const cmd = args.shift();

  // HELP
  if (cmd === "help") {
    return msg.reply({ embeds: [helpEmbed(msg.guild)] });
  }

  // PING
  if (cmd === "ping") {
    return msg.reply(`🏓 Pong: ${client.ws.ping}ms`);
  }

  // STATUS
  if (cmd === "status") {
    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🛡️ Protection Status")
          .addFields(
            { name: "Anti-Abuse", value: settings.antiAbuse[msg.guild.id] ? "ON ✅" : "OFF ❌", inline: true },
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
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only.");

    const ch = msg.mentions.channels.first();
    if (!ch) return msg.reply("❌ Mention a channel.");

    settings.logChannel[msg.guild.id] = ch.id;
    return msg.reply(`✅ Logs channel set to ${ch}`);
  }

  // ANTIABUSE TOGGLE
  if (cmd === "antiabuse") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply("❌ Admin only.");

    const opt = args[0];
    if (!["on", "off"].includes(opt))
      return msg.reply("Usage: `!antiabuse on/off`");

    settings.antiAbuse[msg.guild.id] = opt === "on";
    return msg.reply(`✅ Anti-Abuse **${opt.toUpperCase()}**`);
  }
});

// ===================== ANTI BOT ADD =====================
client.on("guildMemberAdd", async member => {
  if (!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.BotAdd,
    limit: 1
  });

  const entry = logs.entries.first();
  if (!entry) return;

  const inviter = entry.executor;
  if (!inviter) return;

  const invMember = await member.guild.members.fetch(inviter.id).catch(() => null);
  if (!invMember) return;

  await invMember.ban({ reason: "Anti-Bot Add" }).catch(() => {});
  sendLog(member.guild,
    new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🤖 Bot Added — Inviter Banned")
      .setDescription(`Bot: ${member.user.tag}\nBanned: ${inviter.tag}`)
      .setTimestamp()
  );
});

// ===================== ANTI NUKE =====================
async function handleNuke(member, reason) {
  const key = `${member.guild.id}-${member.id}`;
  nukeCount[key] = (nukeCount[key] || 0) + 1;

  if (nukeCount[key] >= 3) {
    await member.ban({ reason: "Anti-Nuke" }).catch(() => {});
    sendLog(member.guild,
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔥 Anti-Nuke Triggered")
        .setDescription(`User: ${member.user.tag}\nReason: ${reason}`)
        .setTimestamp()
    );
  }

  setTimeout(() => delete nukeCount[key], 60_000);
}

client.on("channelDelete", async channel => {
  const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Channel Delete");
});

client.on("roleDelete", async role => {
  const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Role Delete");
});

client.on("guildBanAdd", async ban => {
  const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const e = logs.entries.first();
  if (e?.executor) handleNuke(e.executor, "Mass Ban");
});

// ===================== LOGIN =====================
client.login(TOKEN);
